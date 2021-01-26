const uint8ArrayToString = require('uint8arrays/to-string')
const IpfsHttpClient = require('ipfs-http-client')
const { urlSource } = IpfsHttpClient
const ipfs = IpfsHttpClient()
const detectContentType = require('ipfs-http-response/src/utils/content-type')
const toStream = require('it-to-stream')
const fetch = require('node-fetch')
const fs = require('fs-extra');
const path = require('path');

const npm = require('./managers/npm')
const go = require('./managers/go')

const envPaths = require('env-paths');
const level = require('level-party')
const paths = envPaths('forest');
var db

var pjson = require('../package.json');

const ssri = require('ssri')

const packageAnnoucementsTopic = 'forest'

var ipfsID = undefined;
var ipfsd = undefined;

function connectDB() {
  return db = level(paths.data)
}

function version() {
  pjson.version
}

async function connectIPFS(){
  try{
    ipfsID = await ipfs.id()
    console.log('Connected to IPFS')
    return ipfsID;
  } catch {
    try{
      ipfsd = await startIPFS()
      ipfsID = await ipfsd.api.id()
      return ipfsID;
    } catch(e){
      console.log('ERROR', e)
      console.error('ERROR: Could not connect to or start IPFS')
      process.exit(1);
    }
  }
}

async function startIPFS() {
  console.log('Starting IPFS')

  const Ctl = require('ipfsd-ctl');

  const ipfsd = await Ctl.createController({
      disposable: false,
      args: '--enable-pubsub-experiment',
      ipfsHttpModule: require('ipfs-http-client'),
      ipfsBin: require('go-ipfs').path(),
      test: false,
      remote: false
  })

  fs.removeSync(path.join(ipfsd.path, 'api'))

  var started = await ipfsd.start()
  console.log('Started IPFS')
  const id = await ipfsd.api.id()

  return ipfsd
}

async function reset() {
  await db.clear()
}

async function defaultAnnounceCb(msg) {
  json = JSON.parse(uint8ArrayToString(msg.data))

  if (ipfsID.id === msg.from) { return } // ignore our own announcements

  console.log(msg.from, "republished", json.manager, json.name, json.version)

  try {
    exists = await db.get(`pkg:${json.manager}:${json.name}`)
  } catch (e) {
    exists = false
  }

  if (exists) {
    // known project

    try {
      cid = await db.get(`cid:${json.manager}:${json.name}:${json.version}`)
    } catch (e) {
      cid = false
    }

    if(cid){
      // already downloaded
      if (cid == json.cid) {
        // matching IPFS cid
        console.log(json.manager, json.name, json.version, 'as', json.cid, 'matches existing local copy')
      } else {
        console.log('WARNING', json.manager, json.name, json.version, 'as', json.cid, 'does not match existing local copy')
      }
    } else {
      // download via IPFS
      await downloadPackageFromIPFS(json.manager, json.name, json.version, json.cid)
      // TODO fallback to http download if ipfs download fails
    }
  }
}

async function subscribePackageAnnoucements(receiveMsg = defaultAnnounceCb) {
  try {
    await ipfs.pubsub.subscribe(packageAnnoucementsTopic, receiveMsg)
    console.log(`Subscribed to '${packageAnnoucementsTopic}' pubsub topic`)
  } catch(e) {
    console.error(`Failed to subscribe to '${packageAnnoucementsTopic}' pubsub topic`)
    console.log("IPFS experimental pubsub feature not enabled. Run daemon with --enable-pubsub-experiment")
  }
}

async function unsubscribePackageAnnoucements() {
  await ipfs.pubsub.unsubscribe(packageAnnoucementsTopic)
  console.log(`Unsubscribed from '${packageAnnoucementsTopic}' pubsub topic`)
}

// has npm specific code
async function downloadPackageFromRegistry(manager, name, version){
  var metadata = await loadMetadata(manager, name)
  if(!metadata) {
    console.log("Failed to load metadata for", name)
    return false
  }
  var versionData = metadata.versions[version]

  if(versionData == null){
    console.log('Reloading metadata for', name, version)
    const metadata = await loadMetadataFromRegistry(manager, name)
    var versionData = metadata.versions[version]

    if(versionData == null){
      // no known version in registy
      console.log("Can't find", version, "for", name)
      return false
    }
  }

  var url = versionData.dist.tarball
  await addUrltoIPFS(manager, name, version, url)
}

async function addUrltoIPFS(manager, name, version, url){
  try {
    exists = await db.get(`cid:${manager}:${name}:${version}`)
  } catch (e) {
    exists = false
  }

  if (exists) { return exists }

  try {
    const file = await ipfs.add(urlSource(url))
    console.log('IPFS add:', file.path, file.cid.toString())

    await db.put(`cid:${manager}:${name}:${version}`, file.cid.toString())
    var size = await setTarballSize(manager, name, version)

    try {
      ipfs.pubsub.publish('forest', JSON.stringify({
        url: url,
        manager: manager,
        name: name,
        version: version,
        path: file.path,
        cid: file.cid.toString(),
        forest: pjson.version,
        size: size
      }))
    } catch(e) {
      console.error('Failed to announce', manager, name, version, 'over pubsub')
    }

    return file.cid.toString()
  } catch(e) {
    console.log('error in ipfs add')
    console.error(e)
    return false
  }
}

// has npm specific code
function listPackages(manager) {
  var packages = new Promise((resolve, reject) => {
    var keys = []
    db.createKeyStream({gte: `cid:${manager}:`, lt: `cid:${manager}:~`})
      .on('data', function (data) {
        var parts = data.split(':')
        keys.push({manager: parts[1], name: parts[2], version: parts[3]})
      })
      .on('end', function () {
        resolve(keys.sort())
      })
  })
  return packages
}

async function closeDB(){
  return await db.close()
}

function listPackageNames(manager) {
  return new Promise((resolve, reject) => {
    var names = []
    db.createKeyStream({gte: `pkg:${manager}:`, lt: `pkg:${manager}:~`})
      .on('data', function (data) {
        var parts = data.split(':')
        names.push({manager: parts[1], name: parts[2]})
      })
      .on('end', function () {
        resolve(names.sort())
      })
  })
}

// has npm specific code
async function downloadPackageFromIPFS(manager, name, version, cid) {
  try {
    existing_cid = await db.get(`cid:${manager}:${name}:${version}`)
  } catch (e) {
    existing_cid = false
  }

  if (await existing_cid === cid){
    console.log('Already downloaded', mananger, name, version, 'from IPFS')
    return
  }
  var metadata = await loadMetadata(manager, name)
  if(!metadata) {
    console.log("Failed to load metadata for", name)
    return false
  }
  var versionData = metadata.versions[version]

  if (versionData == null) {
    console.log('Reloading metadata for', name, version)
    var metadata = await loadMetadataFromRegistry(manager, name)
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
      console.log('Downloaded', manager, name, version, 'from IPFS')
      await db.put(`cid:${manager}:${name}:${version}`, cid)
      // TODO announce on pubsub (maybe?)
    } else {
      console.log('Failed to download', manager, name, version, 'from IPFS', cid)
    }
  } else {
    console.log('Unknown version', manager, name, version)
  }
}

async function setTarballSize(manager, name, version) {
  var cid = await db.get(`cid:${manager}:${name}:${version}`)
  const { size } = await ipfs.files.stat(`/ipfs/${cid}`)
  await db.put(`size:${manager}:${name}:${version}`, size)
  return size
}

async function getTarballSize(manager, name, version) {
  await db.get(`size:${manager}:${name}:${version}`)
}

async function loadMetadata(manager, name) {
    try {
      var json = await db.get(`pkg:${manager}:${name}`)
    } catch (e) {
      var json = false
    }

  if(json){
    // console.log('Loading metadata for', manager, name, 'from cache')
    return JSON.parse(json)
  } else {
    console.log('Loading metadata for', manager, name, 'from registry')
    return await loadMetadataFromRegistry(manager, name)
  }
}

// has npm specific code
async function fetchMetadata(manager, name) {
  url = "http://registry.npmjs.org/" + name
  const response = await fetch(url);
  if (response.ok) {
    return await response.json();
  } else {
    return false
  }
}

// has npm specific code
async function loadMetadataFromRegistry(manager, name) {
  try{
    const json = await fetchMetadata(manager, name)
    if(!json) { return false }
    await db.put(`pkg:${manager}:${name}`, JSON.stringify(json))
    return json
  } catch(e) {
    console.error("loadMetadataFromRegistry error", manager, name, e)
    return false
  }
}

// has npm specific code
async function updateMetadata(name) {
  try{
    const json = await fetchMetadata('npm', name);

    try {
      var existingJson = await db.get(`pkg:npm:${name}`)
    } catch(e) {
      var existingJson = ''
    }

    if (JSON.stringify(json) !== existingJson) {
      console.log('Updating', name)
      await db.put(`pkg:npm:${name}`, JSON.stringify(json))
      return json
    } else {
      return false
    }
  } catch(e) {
    return console.error("fetchMetadata error", name, e)
  }
}

// has npm specific code
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

// has npm specific code
async function tarballHandler(name, contentType, cid, req, res) {
  const { size } = await ipfs.files.stat(`/ipfs/${cid}`)
  const { source } = await detectContentType(name, ipfs.cat(cid)) // TODO don't bother detecting contentType here, it's not reliable
  const responseStream = toStream.readable((async function * () {
    for await (const chunk of source) {
      yield chunk.slice()
    }
  })())
  res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': size });
  responseStream.pipe(res)
}

// has npm specific code
async function validate(manager, name, version) {
  const metadata = await loadMetadata(manager, name)
  if(!metadata) {
    console.log("Failed to load metadata for", name)
    return false
  }
  var versionData = metadata.versions[version]

  if(versionData == null){
    console.log('Reloading metadata for', manager, name, version)
    const metadata = await loadMetadataFromRegistry(manager, name)
    var versionData = metadata.versions[version]

    if(versionData == null){
      // no known version in registy
      console.log("Can't find", version, "for", manager, name)
      return false
    }
  }

  if(versionData != null  && versionData.dist.integrity){
    var integrity = versionData.dist.integrity
  } else if (versionData != null) {
    var integrity = ssri.fromHex(versionData.dist.shasum, 'sha1').toString()
  }

  try{
    const cid = await db.get(`cid:npm:${name}:${version}`)
    return await checkIntegrity(cid, integrity)
  } catch(e) {
    return false
  }
}

// has npm specific code
async function setupWatcher(callback) {
  const ChangesStream = require("@npmcorp/changes-stream");
  const changes = new ChangesStream({
    db: 'https://replicate.npmjs.com/registry',
    include_docs: true,
    since: 'now'
  });
  changes.on('data', callback)
}

// has npm specific code
async function watchImporter(change) {
  var versionNumber = npm.getLatestVersion(change.doc)
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
    console.log('New release:', name, versionNumber)
    addUrltoIPFS('npm', name, versionNumber, version.dist.tarball)
    loadMetadata('npm', name)
  }
}

async function watchAll() {
  console.log('Watching for new upstream releases for all packages')
  setupWatcher(function(change) {
    if(change.doc.name){ watchImporter(change) }
  })
}

// has npm specific code
async function watchKnown() {
  console.log('Watching for new upstream releases for cached packages')
  setupWatcher(async function(change) {
    const name = change.doc.name
    if(name){
      try {
        var known = await db.get(`pkg:npm:${name}`)
        if(known){
          watchImporter(change)
        }
      } catch(e){
        // ignore packages we haven't already downloaded
      }
    }
  })
}

// has npm specific code
async function removePackage(name, version) {
  await db.del(`cid:npm:${name}:${version}`)
}

function filteredReadStream(start) {
  return db.createReadStream({gte: start, lt: start+ '~'})
}

async function metadataHandler(name, req, res) {
  // TODO handle etags and 304 requests
  // TODO handle npm minimal metadata requests
  // TODO should probably move saving metadata from res in ProxyRes so it handles private modules
  const json = await loadMetadata('npm', name)

  res.writeHead(200, {"Content-Type": "application/json"});
  res.end(JSON.stringify(json));
}

async function loadGoVersionsList(path) {
  var name = go.parseName(path)

  try {
    var versions = await db.get(`versions:go:${name}`)
  } catch (e) {
    var versions = false
  }

  if(versions){
    return versions
  } else {
    var url = "https://proxy.golang.org"+path
    const response = await fetch(url);
    if(response.ok){
      const body = await response.text();
      await db.put(`versions:go:${name}`, body)
      return body
    } else {
      return false
    }
  }
}

async function loadGoInfo(path) {
  var name = go.parseName(path)

  try {
    var info = await db.get(`info:go:${name}`)
  } catch (e) {
    var info = false
  }

  if(info){
    return JSON.parse(info)
  } else {
    var url = "https://proxy.golang.org"+path
    const response = await fetch(url);
    if(response.ok){
      const body = await response.json();
      await db.put(`info:go:${name}`, JSON.stringify(body))
      return body
    } else {
      return false
    }
  }
}

module.exports = {
  go,
  npm,
  subscribePackageAnnoucements,
  unsubscribePackageAnnoucements,
  addUrltoIPFS,
  downloadPackageFromIPFS,
  downloadPackageFromRegistry,
  listPackages,
  listPackageNames,
  checkIntegrity,
  loadMetadata,
  reset,
  loadMetadataFromRegistry,
  tarballHandler,
  metadataHandler,
  validate,
  connectIPFS,
  watchKnown,
  watchAll,
  updateMetadata,
  removePackage,
  closeDB,
  version,
  setTarballSize,
  getTarballSize,
  filteredReadStream,
  connectDB,
  loadGoVersionsList,
  loadGoInfo
}
