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
const level = require('level')
const db = level(paths.data)

const ssri = require('ssri')

const packageAnnoucementsTopic = 'forest'

async function clear() {
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

  const ipfsID = await ipfs.id()

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
  console.log(`subscribed to ${packageAnnoucementsTopic}`)
}

async function unsubscribePackageAnnoucements() {
  await ipfs.pubsub.unsubscribe(packageAnnoucementsTopic)
  console.log(`unsubscribed from ${packageAnnoucementsTopic}`)
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
  const verionData = metadata.versions[version]
  const url = verionData.dist.tarball
  await addUrltoIPFS(name+'@'+version, url)
}

async function addUrltoIPFS(name, url){
  try {
    exists = await db.get(name)
  } catch (e) {
    exists = false
  }

  if (exists) { return }
  // TODO maybe use the response body we just downloaded rather than downloading again (when used in proxy)
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

  }
}

function listPackages() {
  return new Promise((resolve, reject) => {
    var keys = []
    db.createReadStream()
      .on('data', function (data) {
        if (/.@/.test(data.key)) {
          keys.push(data.key)
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

async function getVersion(name, version) {
  return await db.get(name+'@'+version)
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
  const verionData = metadata.versions[version]
  if (verionData) {
    if(verionData.dist.integrity){
      var integrity = verionData.dist.integrity
    } else {
      var integrity = ssri.fromHex(verionData.dist.shasum, 'sha1').toString()
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
    console.log('Loading metadata for', name, 'from cache')
    return JSON.parse(json)
  } else {
    console.log('Loading metadata for', name, 'from registry')
    return await loadMetadataFromRegistry(name)
  }
}

async function loadMetadataFromRegistry(name) {
  // TODO use same shared metadata cache as proxy server (once implemented)
  url = "http://registry.npmjs.org/" + name
  const response = await fetch(url);
  const json = await response.json();
  await db.put(name, JSON.stringify(json))
  return json
}

async function checkIntegrity(cid, integrity) {
  var sha = ssri.parse(integrity)
  const responseStream = toStream.readable((async function * () {
    for await (const chunk of ipfs.cat(cid)) {
      yield chunk.slice()
    }
  })())

  return ssri.fromStream(responseStream, {algorithms: ['sha1', 'sha512']}).then(sri => {
    return sri.match(sha)
  })
}

async function tarballHandler(name, req, res) {
  var cid = await db.get(name)

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
  const verionData = metadata.versions[version]
  if(verionData.dist.integrity){
    var integrity = verionData.dist.integrity
  } else {
    var integrity = ssri.fromHex(verionData.dist.shasum, 'sha1').toString()
  }

  const cid = await db.get(name + '@' + version)
  const res = await checkIntegrity(cid, integrity)
  return res
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
  listVersions,
  getVersion,
  checkIntegrity,
  loadMetadata,
  splitKey,
  clear,
  loadMetadataFromRegistry,
  tarballHandler,
  validate
}
