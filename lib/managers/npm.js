const validateNpmPackageName = require("validate-npm-package-name")
const core = require('../core')
const ssri = require('ssri')
const toStream = require('it-to-stream')
const { create } = require('ipfs-http-client')
const ipfs = create()
const httpProxy = require('http-proxy');
const fs = require('fs-extra');
const path = require('path');
const url = require('url');
const semver = require('semver');
const execa = require('execa');

const log = require('electron-log');

async function importMetadata(db, name, metadata) {
  var keys = []
  // package level responses
  for (const [key, value] of Object.entries(metadata.responses)) {
    if(value.body){
      var dbkey = `response:npm:${key}:${name}`
      keys.push([dbkey, value.body])
      await db.put(dbkey, value.body)
    }
  }

  // version level responses
  for (const [number, version] of Object.entries(metadata.versions)) {
    // import cid
    if(version.cid){
      var dbkey = `cid:npm:${name}:${number}`
      keys.push([dbkey, version.cid])
      await db.put(dbkey, version.cid)
    }
  }

  return keys
}

async function packageAsJson(db, name) {
  var meta = await fetchMetadata(db, name)

  var versionNumbers = Object.keys(meta.versions).sort(semver.compare).reverse()

  try{
    var versionsCID = await db.get(`response:npm:versions:${name}`)
  } catch {
    var versionsCID = null
  }

  var versionsJson = {}

  for (const version of versionNumbers) {
    if(version){
      versionsJson[version] = await versionAsJson(db, name, version)
    }
  }

  var json = {
    manager: 'npm',
    registry: 'https://registry.npmjs.org/',
    name: name,
    publicUrl: `https://www.npmjs.com/package/${name}`,
    versions: versionsJson,
    responses: {
      versions: {
        url: `https://registry.npmjs.org/${name}`,
        body: versionsCID
      }
    }
  }

  return json
}

async function versionAsJson(db, name, version) {
  var meta = await loadVersionMetadata(db, name, version)

  try{
    var cid = await db.get(`cid:npm:${name}:${version}`)
  } catch {
    var cid = null
  }

  if(meta.dist.integrity){
    var integrity = meta.dist.integrity
  } else {
    var integrity = ssri.fromHex(meta.dist.shasum, 'sha1').toString()
  }

  var url = meta.dist.tarball

  return {
    manager: 'npm',
    registry: 'https://registry.npmjs.org/',
    name: name,
    number: version,
    url: url,
    integrity: integrity,
    cid: cid,
    responses: {}
  }
}

async function importLatest(db, name) {
  var metadata = await fetchMetadata(db, name)
  var version = await getLatestVersion(metadata)

  try{
    var cid = await db.get(`cid:npm:${name}:${version}`)
    log.debug(name, version, 'already imported')
    return {
      version: version,
      cid: cid
    }
  } catch {}

  if(!metadata) {
    log.info("Failed to load metadata for", name)
    return false
  }
  var versionData = metadata.versions[version]
  var url = versionData.dist.tarball

  var wantedCid = await core.announceWant(db, 'npm', name, version, url)

  var cid = await importPackage(db, name, version, url, wantedCid)

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

function manifestExists(filepath) {
  return fs.existsSync('package.json')
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

    await downloadVersion(db, name, newestVersion)

    return true
  } else {
    return false
  }
}

async function importPackage(db, name, version, url, wantedCid) {
  var hashAlg = 'sha2-256'
  var possibleCID
  var cid
  var loaded = false
  var timeout = 1000

  var meta = await loadVersionMetadata(db, name, version)

  if(wantedCid){
    timeout = 5000
    possibleCID = wantedCid
  } else {
    if(meta){
      var integrity = meta.dist.integrity
      if(integrity){
        var hashAlg = 'sha2-512' // TODO parse alg from integrity ssri
        // guess the cid
        possibleCID = core.guessCID(integrity)
      }
    }
  }

  if(possibleCID){
    log.info('Attempting to load', name, version, 'via IPFS')
    // attempt to load possibleCID via ipfs
    var file = await core.attemptIPFSLoad(possibleCID, timeout)

    if(file){
      log.info('Loaded', name, version, 'from IPFS')
      await core.saveCid(db, 'npm', name, version, possibleCID)
      cid = possibleCID
      loaded = true
    }

    if(!loaded){
      log.info('Failed to load', name, version, 'from IPFS')
      log.info('Loading', name, version, 'from url', url)
      // if files didn't load
      // load via url, add cid to db and announce over pubsub
      cid = await core.addUrltoIPFS(db, 'npm', name, version, url, hashAlg)
    }

  } else {
    // regular url download (only old npms)
    cid = await core.addUrltoIPFS(db, 'npm', name, version, url, hashAlg)
  }

  // TODO should verify against integrity somewhere here

  if(cid){
    await core.saveVersion(db, 'npm', name, version, url, cid)
    return cid
  } else {
    return false
  }
}

function matchesUseragent(req) {
  return req.headers['user-agent'].match(/npm/)
}

async function serverHandler(db, req, res) {
  var proxy = httpProxy.createProxy({secure: false});

  var path = url.parse(req.url).path
  var tarball = await returnTarballEarly(db, path)
  var metadataName = isMetadataRequest(path)

  if(req.method != 'PUT' && tarball.name && tarball.cid) {
    log.info(tarball.name, 'Available in IPFS', tarball.cid)
    return await core.tarballHandler(tarball.name+'.tgz', 'application/gzip', tarball.cid, req, res)
  } else if (req.method == 'GET' && metadataName){
    log.info('metadata request', metadataName)
    // TODO if ?write=true then always load metadata from registry
    return await metadataHandler(db, metadataName, req, res)
  } else if({name, version} = isTarballRequest(path)) {
    var wantedCid = await core.announceWant(db, 'npm', name, version, req.url)
    await importPackage(db, name, version, req.url, wantedCid)
  } else {
    log.info('npm proxy', path)
    proxy.web(req, res, {
      target: 'https://registry.npmjs.org/',
      changeOrigin: true
    })
  }

  proxy.on('error', function (err, req, res) {
    log.error('npm proxy error', req.url, err)
  });
}

function setConfig(port) {
  require('child_process').exec(`npm config set proxy=http://0.0.0.0:${port}/ https-proxy=http://0.0.0.0:${port}/ registry=http://registry.npmjs.org/ strict-ssl=false`)
}

function unsetConfig() {
  require('child_process').exec("npm config delete proxy https-proxy registry strict-ssl")
}

function getLatestVersion(doc) {
  var latest = Object.entries(doc.time).filter(([key, value]) => ["created", "modified"].indexOf(key) < 0).sort(function(a, b) { return new Date(b[1]) - new Date(a[1]) })[0]
  return latest[0]
}

async function verify(db, name, version, cid) {
  var metadata = await fetchMetadata(db, name)
  if(!metadata) {
    log.info("Failed to load metadata for", name)
    return false
  }
  var versionData = metadata.versions[version]

  if (versionData == null) {
    log.info('Reloading metadata for', name, version)
    var metadata = await fetchMetadata(db, name, true)
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
      log.info('Downloaded', name, version, 'from IPFS')
      await core.saveCid(db, 'npm', name, version, cid)
      return true
      // TODO announce on pubsub (maybe?)
    } else {
      log.info('Failed to download', name, version, 'from IPFS', cid)
      return false
    }
  } else {
    log.info('Unknown version', name, version)
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
    log.info("Failed to connect to the changes feed")
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
        log.info('New release:', name, versionNumber)
        await fetchMetadata(db, name)
        await importPackage(db, name, versionNumber, version.dist.tarball)
      }
    } catch(e){
      // invalid
      log.info(e)
    }
  }
}

async function watchKnown(db, change) {
  const name = change.doc.name
  if(name){
    try {
      var known = await db.get(`response:npm:versions:${name}`)
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
  const json = await fetchMetadata(db, name)

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

async function downloadVersion(db, name, version) {

  try{
    var cid = await db.get(`cid:npm:${name}:${version}`)
    return cid
  } catch {

  }

  var versionData = await loadVersionMetadata(db, name, version)
  var url = versionData.dist.tarball
  var wantedCid = await core.announceWant(db, 'npm', name, version, url)
  return await importPackage(db, name, version, url, wantedCid)
}

async function loadVersionMetadata(db, name, version) {
  var metadata = await fetchMetadata(db, name)
  if(!metadata) {
    log.info("Failed to load metadata for", name)
    return false
  }

  var versionData = metadata.versions[version]

  if(versionData == null){
    log.info('Reloading metadata for', name, version)
    const metadata = await fetchMetadata(db, name, true)
    var versionData = metadata.versions[version]

    if(versionData == null){
      // no known version in registry
      log.info("Can't find", version, "for", name)
      return false
    }
  }
  return versionData
}

async function fetchMetadata(db, name, force = false) {
  var url = "http://registry.npmjs.org/" + name
  var body = await core.fetchResponse(db, `response:npm:versions:${name}`, url, force)
  if(body){
    return JSON.parse(body)
  } else {
    return false
  }
}

async function updateMetadata(db, name) {
  var existingJson = await fetchMetadata(db, name)
  var json = await fetchMetadata(db, name, true)

  if (JSON.stringify(json) !== JSON.stringify(existingJson)) {
    return json
  } else {
    return false
  }
}

async function installCommand(port){
  var env = {
    npm_config_proxy: `http://0.0.0.0:${port}/`,
    npm_config_https_proxy: `http://0.0.0.0:${port}/`,
    npm_config_registry: 'http://registry.npmjs.org/',
    npm_config_strict_ssl: 'false'
  }
  console.log('Running "npm install" ...')
  await execa.command('npm install', {env: env });
  return
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
  lockfileName,
  matchesUseragent,
  versionAsJson,
  packageAsJson,
  importMetadata,
  downloadVersion,
  manifestExists,
  installCommand
}
