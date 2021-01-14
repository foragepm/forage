const validateNpmPackageName = require("validate-npm-package-name")
const uint8ArrayToString = require('uint8arrays/to-string')
const IpfsHttpClient = require('ipfs-http-client')
const { urlSource } = IpfsHttpClient
const ipfs = IpfsHttpClient()
const detectContentType = require('ipfs-http-response/src/utils/content-type')
const toStream = require('it-to-stream')
const fetch = require('node-fetch')

const envPaths = require('env-paths');
const paths = envPaths('forest');
const level = require('level-party')
const db = level(paths.data)
var pjson = require('../package.json');

const ssri = require('ssri')

const packageAnnoucementsTopic = 'forest'

let ipfsID = undefined;

function version() {
  pjson.version
}

async function connectIPFS(){
  try{
    ipfsID = await ipfs.id()
    console.log('Connected to IPFS')
    return ipfsID;
  } catch(e) {
    console.error('ERROR: Could not connect to IPFS')
    process.exit(1);
  }
}

async function reset() {
  await db.clear()
}

function splitKey(key) {
  parts = key.split('@')
  if (key.startsWith('@')) {
    name = '@'+parts[1]
    version = parts[2]
  } else {
    name = parts[0]
    version = parts[1]
  }
  return {name, version}
}

async function defaultAnnounceCb(msg) {
  json = JSON.parse(uint8ArrayToString(msg.data))

  if (ipfsID.id === msg.from) { return } // ignore our own announcements

  console.log(msg.from, "republished", json.name)

  const {name, version} = splitKey(json.name)

  try {
    exists = await db.get(name)
  } catch (e) {
    exists = false
  }

  if (exists) {
    // known project

    try {
      cid = await db.get(json.name)
    } catch (e) {
      cid = false
    }

    if(cid){
      // already downloaded
      if (cid == json.cid) {
        // matching IPFS cid
        console.log(json.name, 'as', json.cid, 'matches existing local copy')
      } else {
        console.log('WARNING', json.name, 'as', json.cid, 'does not match existing local copy')
      }
    } else {
      // download via IPFS
      await downloadPackageFromIPFS(name, version, json.cid)
      // TODO fallback to http download if ipfs download fails
    }
  }
}

async function subscribePackageAnnoucements(receiveMsg = defaultAnnounceCb) {
  await ipfs.pubsub.subscribe(packageAnnoucementsTopic, receiveMsg)
  console.log(`Subscribed to '${packageAnnoucementsTopic}' pubsub topic`)
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
      return parts[1] + '/' + parts[2] + '@' + version
    } else {
      return parts[1] + '@' + version
    }
  } else {
    return false;
  }
}

async function returnTarballEarly(path) {
  name = isTarballRequest(path)

  try {
    cached = await db.get(name)
  } catch (e) {
    cached = false
  }

  if (name && cached) { return name }
}

async function downloadPackageFromRegistry(name, version){
  const metadata = await loadMetadata(name)
  const versionData = metadata.versions[version]

  if(versionData == null){
    console.log('Reloading metadata for', name, version)
    const metadata = await loadMetadataFromRegistry(name)
    let versionData = metadata.versions[version]

    if(versionData == null){
      // no known version in registy
      console.log("Can't find", version, "for", name)
      return false
    }
  }

  const url = versionData.dist.tarball
  await addUrltoIPFS(name+'@'+version, url)
}

async function addUrltoIPFS(name, url){
  try {
    exists = await db.get(name)
  } catch (e) {
    exists = false
  }

  if (exists) { return exists }
  // TODO maybe use the response body we just downloaded rather than downloading again (when used in proxy)

  try {
    for await (const file of ipfs.addAll(urlSource(url))) {
      console.log('IPFS add:', file.path, file.cid.toString())

      // TODO extract into announce method
      await db.put(name, file.cid.toString())
      ipfs.pubsub.publish('forest', JSON.stringify({ // TODO seperate out name and version here
        url: url,
        name: name,
        path: file.path,
        cid: file.cid.toString()
      }))
      return file.cid.toString()
    }
  } catch(e) {
    console.log('error in ipfs add')
    console.error(e)
    return false
  }
}

function listPackages() {
  var packages = new Promise((resolve, reject) => {
    var keys = []
    db.createKeyStream()
      .on('data', function (data) {
        if (/.@/.test(data)) {
          keys.push(data)
        }
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
    var keys = []
    db.createKeyStream()
      .on('data', function (data) {
        if (!/.@/.test(data)) {
          keys.push(data)
        }
      })
      .on('end', function () {
        resolve(keys.sort())
      })
  })
}

function listVersions(packageName) {
  var versionNames = []
  for (const element of store) {

    const {name, version} = splitKey(element[0])

    if (name === packageName && version) {
      versionNames.push(version)
    }
  }
  return [...new Set(versionNames)].sort()
}

async function downloadPackageFromIPFS(name, version, cid) {
  try {
    existing_cid = await db.get(name+'@'+version)
  } catch (e) {
    existing_cid = false
  }

  if (await existing_cid === cid){
    console.log('Already downloaded', name+'@'+version, 'from IPFS')
    return
  }
  const metadata = await loadMetadata(name)
  const versionData = metadata.versions[version]

  if (versionData == null) {
    console.log('Reloading metadata for', name, version)
    const metadata = await loadMetadataFromRegistry(name)
    let versionData = metadata.versions[version]
  }

  if (versionData) {
    if(versionData.dist.integrity){
      var integrity = versionData.dist.integrity
    } else {
      var integrity = ssri.fromHex(versionData.dist.shasum, 'sha1').toString()
    }
    const res = await checkIntegrity(cid, integrity)
    if (res){
      console.log('Downloaded', name+'@'+version, 'from IPFS')
      await db.put(name+'@'+version, cid)
      // TODO announce on pubsub (maybe?)
    } else {
      console.log('Failed to download', name+'@'+version, 'from IPFS', cid)
    }
  } else {
    console.log('Unknown version', name, version)
  }
}

async function loadMetadata(name) {
    try {
      json = await db.get(name)
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
    await db.put(name, JSON.stringify(json))
    return json
  } catch(e) {
    return console.error("loadMetadataFromRegistry error", name, e)
  }
}

async function updateMetadata(name) {
  try{
    const json = await fetchMetadata(name);

    try {
      var existingJson = await db.get(name)
    } catch(e) {
      var existingJson = ''
    }

    if (JSON.stringify(json) !== existingJson) {
      console.log('Updating', name)
      await db.put(name, JSON.stringify(json))
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
    for await (const chunk of ipfs.cat(cid)) {
      yield chunk.slice()
    }
  })())

  var sri = await ssri.fromStream(responseStream, {algorithms: ['sha1', 'sha512']})
  return !!sri.match(sha)
}

async function tarballHandler(name, req, res) {
  var cid = await db.get(name) // no try catch as this shouldn't be called if name isn't in db

  const { size } = await ipfs.files.stat(`/ipfs/${cid}`)
  const { source, contentType } = await detectContentType(name+'.tgz', ipfs.cat(cid))
  const responseStream = toStream.readable((async function * () {
    for await (const chunk of source) {
      yield chunk.slice()
    }
  })())
  res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': size });
  responseStream.pipe(res)
}

async function validate(name, version) {
  const metadata = await loadMetadata(name)
  let versionData = metadata.versions[version]

  if(versionData == null){
    console.log('Reloading metadata for', name, version)
    const metadata = await loadMetadataFromRegistry(name)
    let versionData = metadata.versions[version]

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
    const cid = await db.get(name + '@' + version)
    return await checkIntegrity(cid, integrity)
  } catch {
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
  let latest = Object.entries(doc.time).filter(([key, value]) => ["created", "modified"].indexOf(key) < 0).sort(function(a, b) { return new Date(b[1]) - new Date(a[1]) })[0]
  return latest[0]
}

async function watchImporter(change) {
  let versionNumber = getLatestVersion(change.doc)
  let version = change.doc.versions[versionNumber]
  let key = change.doc.name+'@'+versionNumber

  try {
    exists = await db.get(key)
  } catch (e) {
    exists = false
  }

  if(exists) {
    // duplicate change from stream
  } else {
    console.log('New release:', change.doc.name, versionNumber)
    addUrltoIPFS(key, version.dist.tarball)
    loadMetadata(change.doc.name)
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
        var known = await db.get(name)
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
  await db.del(name + '@' + version)
}

function setConfig() {
  require('child_process').exec("npm config set proxy=http://0.0.0.0:8005/ https-proxy=http://0.0.0.0:8005/ registry=http://registry.npmjs.org/ strict-ssl=false")
}

function removeConfig() {
  require('child_process').exec("npm config delete proxy https-proxy registry strict-ssl")
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
  listVersions,
  checkIntegrity,
  loadMetadata,
  splitKey,
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
  version
}
