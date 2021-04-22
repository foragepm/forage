const validateNpmPackageName = require("validate-npm-package-name")
const core = require('../core')
const ssri = require('ssri')
const toStream = require('it-to-stream')
const IpfsHttpClient = require('ipfs-http-client')
const ipfs = IpfsHttpClient()
const httpProxy = require('http-proxy');
const fs = require('fs-extra');
const path = require('path');
const url = require('url');

var debug = require('debug')('forage-npm')

async function importLatest(db, name) {
  var metadata = await loadMetadata(db, name)
  var version = await getLatestVersion(metadata)

  if(!metadata) {
    debug("Failed to load metadata for", name)
    return false
  }
  var versionData = metadata.versions[version]

  var cid = await importPackage(db, name, version, versionData.dist.tarball)

  return {
    version: version,
    cid: cid
  }
}

function isLockfilepath(filepath) {
  return filepath.match(/package-lock\.json$/)
}

function lockfileExists() {
  return fs.existsSync('package-lock.json')
}

function lockfileName() {
  return 'package-lock.json'
}

async function readLockfile(filepath) {
  const packageLock = JSON.parse(fs.readFileSync(path.resolve(filepath), 'utf8'));

  var packages = []
  if(packageLock.dependencies) {
    for (const name in packageLock.dependencies) {
      const pkg = packageLock.dependencies[name]
      pkg.manager = 'npm'
      pkg.name = name
      packages.push(pkg)
    }
  }
  return packages
}

async function updatePackage(db, name) {
  var update = await updateMetadata(db, name)
  if (update) {
    var newestVersion = getLatestVersion(update)
    await importPackage(db, name, newestVersion, update['versions'][newestVersion].dist.tarball)
    return true
  } else {
    return false
  }
}

async function importPackage(db, name, version, url) {
  var hashAlg = 'sha2-256'
  var possibleCID
  var cid
  var loaded = false

  try {
    var exists = await db.get(`cid:npm:${name}:${version}`)
    debug(name, version, 'already imported')
    return exists
  } catch (e) {
    var exists = false
  }

  var meta = await loadVersionMetadata(db, name, version)
  if(meta){
    var integrity = meta.dist.integrity
    if(integrity){
      var hashAlg = 'sha2-512' // TODO parse alg from integrity ssri
      // guess the cid
      possibleCID = core.guessCID(integrity)
    }
  }

  if(possibleCID){
    // attempt to load possibleCID via ipfs
    var file = await core.attemptIPFSLoad(possibleCID)

    if(file){
      // guessed CID was correct and loaded from ipfs

      // TODO pin cid
      await core.saveCid(db, 'npm', name, version, possibleCID)
      cid = possibleCID
      loaded = true
    }

    if(!loaded){
      // if files didn't load
      // load via url, add cid to db and announce over pubsub
      cid = await core.addUrltoIPFS(db, 'npm', name, version, url, hashAlg)
    }

  } else {
    // regular url download (only old npms)
    cid = await core.addUrltoIPFS(db, 'npm', name, version, url, hashAlg)
  }

  if(cid){
    await core.saveVersion(db, 'npm', name, version, url, cid)
    return cid
  } else {
    return false
  }
}

async function serverHandler(db, req, res) {
  var proxy = httpProxy.createProxy({secure: false});

  if(req.headers['user-agent'].match(/npm/)){
    var path = url.parse(req.url).path
    var tarball = await returnTarballEarly(db, path)
    var metadataName = isMetadataRequest(path)

    if(req.method != 'PUT' && tarball.name && tarball.cid) {
      debug(tarball.name, 'Available in IPFS', tarball.cid)
      return await core.tarballHandler(tarball.name+'.tgz', 'application/gzip', tarball.cid, req, res)
    } else if (req.method == 'GET' && metadataName){
      debug('metadata request', metadataName)
      return await metadataHandler(db, metadataName, req, res)
    } else {
      debug('proxy', path)
      proxy.web(req, res, {
        target: 'https://registry.npmjs.org/',
        changeOrigin: true
      })
    }
  }

  proxy.on('error', function (err, req, res) {
    debug('ERROR', req.url, err)
  });

  proxy.on('proxyRes', async function (proxyRes, req, res) {
    var path = req.url.replace('http://registry.npmjs.org', '')
    if({name, version} = isTarballRequest(path)) {
      await importPackage(db, name, version, req.url)
    }
  });
}

function setConfig() {
  require('child_process').exec("npm config set proxy=http://0.0.0.0:8005/ https-proxy=http://0.0.0.0:8005/ registry=http://registry.npmjs.org/ strict-ssl=false")
}

function unsetConfig() {
  require('child_process').exec("npm config delete proxy https-proxy registry strict-ssl")
}

function getLatestVersion(doc) {
  var latest = Object.entries(doc.time).filter(([key, value]) => ["created", "modified"].indexOf(key) < 0).sort(function(a, b) { return new Date(b[1]) - new Date(a[1]) })[0]
  return latest[0]
}

async function verify(db, name, version, cid) {
  var metadata = await loadMetadata(db, name)
  if(!metadata) {
    debug("Failed to load metadata for", name)
    return false
  }
  var versionData = metadata.versions[version]

  if (versionData == null) {
    debug('Reloading metadata for', name, version)
    var metadata = await loadMetadataFromRegistry(db, name)
    var versionData = metadata.versions[version]
  }

  if (versionData) {
    if(versionData.dist.integrity){
      var integrity = versionData.dist.integrity
    } else {
      var integrity = ssri.fromHex(versionData.dist.shasum, 'sha1').toString()
    }
    var res = await checkIntegrity(cid, integrity)
    if (res){
      debug('Downloaded', 'npm', name, version, 'from IPFS')
      await core.saveCid(db, 'npm', name, version, cid)
      return true
      // TODO announce on pubsub (maybe?)
    } else {
      debug('Failed to download', 'npm', name, version, 'from IPFS', cid)
      return false
    }
  } else {
    debug('Unknown version', 'npm', name, version)
    return false
  }
}

function setupWatcher(callback) {
  const ChangesStream = require("@npmcorp/changes-stream");
  const changes = new ChangesStream({
    db: 'https://replicate.npmjs.com/registry',
    include_docs: true,
    since: 'now'
  });
  changes.on('data', function(change) { callback('npm', change) })
  changes.on('error', function(error){
    debug("Failed to connect to the npm changes feed")
  })
}

async function watchImporter(db, change) {
  if(change.doc.name){
    try{
      var versionNumber = getLatestVersion(change.doc)
      var version = change.doc.versions[versionNumber]
      var name = change.doc.name

      try {
        var exists = await db.get(`cid:npm:${name}:${versionNumber}`)
      } catch (e) {
        var exists = false
      }

      if(exists) {
        // duplicate change from stream
      } else {
        debug('New release:', 'npm', name, versionNumber)
        await loadMetadata(db, name)
        await importPackage(db, name, versionNumber, version.dist.tarball)
      }
    } catch(e){
      // invalid
      debug(e)
    }
  }
}

async function watchKnown(db, change) {
  const name = change.doc.name
  if(name){
    try {
      var known = await db.get(`pkg:npm:${name}`)
      if(known){
        watchImporter(db, change)
      }
    } catch(e){
      // ignore packages we haven't already downloaded
    }
  }
}

// internal

function isTarballRequest(path) {
  if (path.match('\.tgz$')) {
    var parts = path.split("/")
    var vparts = path.split('-')
    var version = vparts[vparts.length - 1].replace('.tgz', '')
    if (parts[1].startsWith('@')) {
      // return parts[1] + '/' + parts[2] + '@' + version
      return {name: parts[1] + '/' + parts[2], version: version}
    } else {
      // return parts[1] + '@' + version
      return {name: parts[1], version: version}
    }
  } else {
    return false;
  }
}

function isMetadataRequest(path) {
  var parts = path.split("/")
  if(parts.length == 2){
    return validateNpmPackageName(parts[1]).validForOldPackages ? parts[1] : false
  } else if (parts.length == 3) {
    var scopedName = parts[1] + '/' + parts[2]
    return validateNpmPackageName(scopedName).validForOldPackages ? scopedName : false
  } else {
    return false;
  }
}

async function returnTarballEarly(db, path) {
  var res = isTarballRequest(path)
  if(!res){ return false }
  var {name, version} = res

  try {
    var cid = await db.get(`cid:npm:${name}:${version}`)
  } catch (e) {
    var cid = false
  }

  if (name != null && cid != undefined) {
    return {name: name, cid: cid}
  } else {
    return false
  }
}

async function metadataHandler(db, name, req, res) {
  // TODO handle etags and 304 requests
  // TODO handle npm minimal metadata requests
  // TODO should probably move saving metadata from res in ProxyRes so it handles private modules
  const json = await loadMetadata(db, name)

  res.writeHead(200, {"Content-Type": "application/json"});
  return res.end(JSON.stringify(json));
}

async function checkIntegrity(cid, integrity) {
  var sha = ssri.parse(integrity)
  const responseStream = toStream.readable((async function * () {
    for await (const chunk of ipfs.cat(cid)) { // cid can't be null here
      yield chunk.slice()
    }
  })())

  var sri = await ssri.fromStream(responseStream, {algorithms: ['sha1', 'sha512']})
  return !!sri.match(sha)
}

async function loadMetadata(db, name) {
    try {
      var json = await db.get(`pkg:npm:${name}`)
    } catch (e) {
      var json = false
    }

  if(json){
    debug('Loading metadata for', name, 'from cache')
    return JSON.parse(json)
  } else {
    debug('Loading metadata for npm', name, 'from registry')
    return await loadMetadataFromRegistry(db, name)
  }
}

async function loadVersionMetadata(db, name, version) {
  var metadata = await loadMetadata(db, name)
  if(!metadata) {
    debug("Failed to load metadata for", name)
    return false
  }

  var versionData = metadata.versions[version]

  if(versionData == null){
    debug('Reloading metadata for', name, version)
    const metadata = await loadMetadataFromRegistry(db, name)
    var versionData = metadata.versions[version]

    if(versionData == null){
      // no known version in registy
      debug("Can't find", version, "for", name)
      return false
    }
  }
  return versionData
}

async function fetchMetadata(name) {
  var url = "http://registry.npmjs.org/" + name
  const response = await core.fetchWithTimeout(url);
  if (response.ok) {
    return await response.json();
  } else {
    return false
  }
}

async function loadMetadataFromRegistry(db, name) {
  try{
    const json = await fetchMetadata(name)
    if(!json) { return false }
    await db.put(`pkg:npm:${name}`, JSON.stringify(json))
    return json
  } catch(e) {
    debug("loadMetadataFromRegistry error", name, e)
    return false
  }
}

async function updateMetadata(db, name) {
  try{
    const json = await fetchMetadata(name);

    try {
      var existingJson = await db.get(`pkg:npm:${name}`)
    } catch(e) {
      var existingJson = ''
    }

    if (JSON.stringify(json) !== existingJson) {
      debug('Updating npm', name)
      await db.put(`pkg:npm:${name}`, JSON.stringify(json))
      return json
    } else {
      return false
    }
  } catch(e) {
    return debug("fetchMetadata error", name, e)
  }
}

module.exports = {
  getLatestVersion,
  setConfig,
  unsetConfig,
  verify,
  setupWatcher,
  watchImporter,
  watchKnown,
  importPackage,
  serverHandler,
  importLatest,
  updatePackage,
  readLockfile,
  isLockfilepath,
  lockfileExists,
  lockfileName
}
