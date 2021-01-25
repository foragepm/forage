const validateNpmPackageName = require("validate-npm-package-name")
const uint8ArrayToString = require('uint8arrays/to-string')
const IpfsHttpClient = require('ipfs-http-client')
const { urlSource } = IpfsHttpClient
const ipfs = IpfsHttpClient()
const detectContentType = require('ipfs-http-response/src/utils/content-type')
const toStream = require('it-to-stream')
const fetch = require('node-fetch')
const fs = require('fs-extra');
const path = require('path');

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

  console.log(msg.from, "republished", json.name, json.version)

  try {
    exists = await db.get(`pkg:npm:${json.name}`)
  } catch (e) {
    exists = false
  }

  if (exists) {
    // known project

    try {
      cid = await db.get(`cid:npm:${json.name}:${json.version}`)
    } catch (e) {
      cid = false
    }

    if(cid){
      // already downloaded
      if (cid == json.cid) {
        // matching IPFS cid
        console.log(json.name, json.version, 'as', json.cid, 'matches existing local copy')
      } else {
        console.log('WARNING', json.name, json.version, 'as', json.cid, 'does not match existing local copy')
      }
    } else {
      // download via IPFS
      await downloadPackageFromIPFS(json.name, json.version, json.cid)
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

async function downloadPackageFromRegistry(name, version){
  var metadata = await loadMetadata(name)
  var versionData = metadata.versions[version]

  if(versionData == null){
    console.log('Reloading metadata for', name, version)
    const metadata = await loadMetadataFromRegistry(name)
    var versionData = metadata.versions[version]

    if(versionData == null){
      // no known version in registy
      console.log("Can't find", version, "for", name)
      return false
    }
  }

  var url = versionData.dist.tarball
  await addUrltoIPFS(name, version, url)
}

async function addUrltoIPFS(name, version, url){
  try {
    exists = await db.get(`cid:npm:${name}:${version}`)
  } catch (e) {
    exists = false
  }

  if (exists) { return exists }
  // TODO maybe use the response body we just downloaded rather than downloading again (when used in proxy)

  try {
    const file = await ipfs.add(urlSource(url))
    console.log('IPFS add:', file.path, file.cid.toString())

    await db.put(`cid:npm:${name}:${version}`, file.cid.toString())
    var size = await setTarballSize(name, version)

    try {
      // TODO extract into announce method
      ipfs.pubsub.publish('forest', JSON.stringify({
        url: url,
        manager: 'npm', // TODO make this dynamic when more package managers are supported
        name: name,
        version: version,
        path: file.path,
        cid: file.cid.toString(),
        forest: pjson.version,
        size: size
      }))
    } catch(e) {
      console.error('Failed to announce', name, 'over pubsub')
    }

    return file.cid.toString()
  } catch(e) {
    console.log('error in ipfs add')
    console.error(e)
    return false
  }
}

function listPackages() {
  var packages = new Promise((resolve, reject) => {
    var keys = []
    db.createKeyStream({gte: 'cid:npm:', lt: 'cid:npm:~'})
      .on('data', function (data) {
        var parts = data.split(':')
        keys.push({name: parts[2], version: parts[3]})
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

function listPackageNames() {
  return new Promise((resolve, reject) => {
    var names = []
    db.createKeyStream({gte: 'pkg:npm:', lt: 'pkg:npm:~'})
      .on('data', function (data) {
        var parts = data.split(':')
        names.push(parts[2])
      })
      .on('end', function () {
        resolve(names.sort())
      })
  })
}

async function downloadPackageFromIPFS(name, version, cid) {
  try {
    existing_cid = await db.get(`cid:npm:${name}:${version}`)
  } catch (e) {
    existing_cid = false
  }

  if (await existing_cid === cid){
    console.log('Already downloaded', name, version, 'from IPFS')
    return
  }
  var metadata = await loadMetadata(name)
  var versionData = metadata.versions[version]

  if (versionData == null) {
    console.log('Reloading metadata for', name, version)
    var metadata = await loadMetadataFromRegistry(name)
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
      console.log('Downloaded', name, version, 'from IPFS')
      await db.put(`cid:npm:${name}:${version}`, cid)
      // TODO announce on pubsub (maybe?)
    } else {
      console.log('Failed to download', name, version, 'from IPFS', cid)
    }
  } else {
    console.log('Unknown version', name, version)
  }
}

async function setTarballSize(name, version) {
  var cid = await db.get(`cid:npm:${name}:${version}`)
  const { size } = await ipfs.files.stat(`/ipfs/${cid}`)
  await db.put(`size:${name}:${version}`, size)
  return size
}

async function getTarballSize(name, version) {
  await db.get(`size:${name}:${version}`)
}

async function loadMetadata(name) {
    try {
      json = await db.get(`pkg:npm:${name}`)
    } catch (e) {
      json = false
    }

  if(json){
    // console.log('Loading metadata for', name, 'from cache')
    return JSON.parse(json)
  } else {
    console.log('Loading metadata for', name, 'from registry')
    return await loadMetadataFromRegistry(name)
  }
}

async function fetchMetadata(name) {
  url = "http://registry.npmjs.org/" + name
  const response = await fetch(url);
  const json = await response.json();
  return json
}

async function loadMetadataFromRegistry(name) {
  try{
    const json = await fetchMetadata(name)
    await db.put(`pkg:npm:${name}`, JSON.stringify(json))
    return json
  } catch(e) {
    return console.error("loadMetadataFromRegistry error", name, e)
  }
}

async function updateMetadata(name) {
  try{
    const json = await fetchMetadata(name);

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

async function tarballHandler(name, cid, req, res) {
  const { size } = await ipfs.files.stat(`/ipfs/${cid}`)
  const { source, contentType } = await detectContentType(name+'.tgz', ipfs.cat(cid))
  const responseStream = toStream.readable((async function * () {
    for await (const chunk of source) {
      yield chunk.slice()
    }
  })())
  res.writeHead(200, { 'Content-Type': 'application/gzip', 'Content-Length': size });
  responseStream.pipe(res)
}

async function validate(name, version) {
  const metadata = await loadMetadata(name)
  var versionData = metadata.versions[version]

  if(versionData == null){
    console.log('Reloading metadata for', name, version)
    const metadata = await loadMetadataFromRegistry(name)
    var versionData = metadata.versions[version]

    if(versionData == null){
      // no known version in registy
      console.log("Can't find", version, "for", name)
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

async function setupWatcher(callback) {
  const ChangesStream = require('changes-stream');
  const changes = new ChangesStream({
    db: 'https://replicate.npmjs.com/registry',
    include_docs: true,
    since: 'now'
  });
  changes.on('data', callback)
}

function getLatestVersion(doc) {
  var latest = Object.entries(doc.time).filter(([key, value]) => ["created", "modified"].indexOf(key) < 0).sort(function(a, b) { return new Date(b[1]) - new Date(a[1]) })[0]
  return latest[0]
}

async function watchImporter(change) {
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
    console.log('New release:', name, versionNumber)
    addUrltoIPFS(name, versionNumber, version.dist.tarball)
    loadMetadata(name)
  }
}

async function watchAll() {
  console.log('Watching for new upstream releases for all packages')
  setupWatcher(function(change) {
    if(change.doc.name){ watchImporter(change) }
  })
}

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

async function removePackage(name, version) {
  await db.del(`cid:npm:${name}:${version}`)
}

function setConfig() {
  require('child_process').exec("npm config set proxy=http://0.0.0.0:8005/ https-proxy=http://0.0.0.0:8005/ registry=http://registry.npmjs.org/ strict-ssl=false")
}

function removeConfig() {
  require('child_process').exec("npm config delete proxy https-proxy registry strict-ssl")
}

function filteredReadStream(start) {
  return db.createReadStream({gte: start, lt: start+ '~'})
}

module.exports = {
  subscribePackageAnnoucements,
  unsubscribePackageAnnoucements,
  isMetadataRequest,
  isTarballRequest,
  returnTarballEarly,
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
  validate,
  connectIPFS,
  watchKnown,
  watchAll,
  updateMetadata,
  getLatestVersion,
  removePackage,
  setConfig,
  removeConfig,
  closeDB,
  version,
  setTarballSize,
  getTarballSize,
  filteredReadStream,
  connectDB
}
