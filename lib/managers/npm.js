const validateNpmPackageName = require("validate-npm-package-name")

const core = require('./core')
const ssri = require('ssri')
const toStream = require('it-to-stream')
const IpfsHttpClient = require('ipfs-http-client')
const { urlSource } = IpfsHttpClient
const ipfs = IpfsHttpClient()

async function importPackage(db, manager, name, version, url) {
  var hashAlg = 'sha2-256'
  var possibleCID
  var cid
  var loaded = false

  var meta = await core.loadVersionMetadata(db, manager, name, version)
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
      await db.put(`cid:${manager}:${name}:${version}`, possibleCID)
      cid = possibleCID
      loaded = true
    }

    if(!loaded){
      // if files didn't load
      // load via url, add cid to db and announce over pubsub
      cid = await core.addUrltoIPFS(db, manager, name, version, url, hashAlg)
    }

  } else {
    // regular url download (only old npms + other possible package managers)
    cid = await core.addUrltoIPFS(db, manager, name, version, url, hashAlg)
  }

  return cid
}

function isTarballRequest(path) {
  if (path.match('\.tgz$')) {
    parts = path.split("/")
    vparts = path.split('-')
    version = vparts[vparts.length - 1].replace('.tgz', '')
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
  parts = path.split("/")
  if(parts.length == 2){
    return validateNpmPackageName(parts[1]).validForOldPackages ? parts[1] : false
  } else if (parts.length == 3) {
    scopedName = parts[1] + '/' + parts[2]
    return validateNpmPackageName(scopedName).validForOldPackages ? scopedName : false
  } else {
    return false;
  }
}

async function returnTarballEarly(path) {
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

function setConfig() {
  require('child_process').exec("npm config set proxy=http://0.0.0.0:8005/ https-proxy=http://0.0.0.0:8005/ registry=http://registry.npmjs.org/ strict-ssl=false")
}

function removeConfig() {
  require('child_process').exec("npm config delete proxy https-proxy registry strict-ssl")
}

function getLatestVersion(doc) {
  var latest = Object.entries(doc.time).filter(([key, value]) => ["created", "modified"].indexOf(key) < 0).sort(function(a, b) { return new Date(b[1]) - new Date(a[1]) })[0]
  return latest[0]
}

async function verify(db, name, version, cid) {
  var manager = 'npm'
  var metadata = await core.loadMetadata(db, manager, name)
  if(!metadata) {
    console.log("Failed to load metadata for", name)
    return false
  }
  var versionData = metadata.versions[version]

  if (versionData == null) {
    console.log('Reloading metadata for', name, version)
    var metadata = await core.loadMetadataFromRegistry(db, manager, name)
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
      // console.log('Downloaded', manager, name, version, 'from IPFS')
      await core.saveCid(db, manager, name, version, cid)
      return true
      // TODO announce on pubsub (maybe?)
    } else {
      console.log('Failed to download', manager, name, version, 'from IPFS', cid)
      return false
    }
  } else {
    console.log('Unknown version', manager, name, version)
    return false
  }
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

function setupWatcher(callback) {
  const ChangesStream = require("@npmcorp/changes-stream");
  const changes = new ChangesStream({
    db: 'https://replicate.npmjs.com/registry',
    include_docs: true,
    since: 'now'
  });
  changes.on('data', function(change) { callback('npm', change) })
  changes.on('error', function(error){
    console.error("Failed to connect to the npm changes feed")
  })
}

async function watchImporter(db, change) {
  try{
    var versionNumber = getLatestVersion(change.doc)
    var version = change.doc.versions[versionNumber]
    var name = change.doc.name

    try {
      exists = await db.get(`cid:npm:${name}:${versionNumber}`)
    } catch (e) {
      exists = false
    }

    if(exists) {
      // duplicate change from stream
    } else {
      console.log('New release:', 'npm', name, versionNumber)
      await core.loadMetadata(db, 'npm', name)
      await importPackage(db, 'npm', name, versionNumber, version.dist.tarball)
    }
  } catch(e){
    // invalid
    console.error(e)
  }
}

async function metadataHandler(db, name, req, res) {
  // TODO handle etags and 304 requests
  // TODO handle npm minimal metadata requests
  // TODO should probably move saving metadata from res in ProxyRes so it handles private modules
  const json = await core.loadMetadata(db, 'npm', name)

  res.writeHead(200, {"Content-Type": "application/json"});
  res.end(JSON.stringify(json));
}

module.exports = {
  getLatestVersion,
  isTarballRequest,
  isMetadataRequest,
  returnTarballEarly,
  setConfig,
  removeConfig,
  verify,
  setupWatcher,
  metadataHandler,
  watchImporter,
  importPackage
}
