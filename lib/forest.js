const validateNpmPackageName = require("validate-npm-package-name")
const uint8ArrayToString = require('uint8arrays/to-string')
const IpfsHttpClient = require('ipfs-http-client')
const { urlSource } = IpfsHttpClient
const ipfs = IpfsHttpClient()
const toStream = require('it-to-stream')
const fetch = require('node-fetch')

const Conf = require('conf');
const store = new Conf({accessPropertiesByDotNotation: false, projectName: 'forest'});

const ssri = require('ssri')

const packageAnnoucementsTopic = 'forest'

function defaultAnnounceCb(msg) {
  json = JSON.parse(uint8ArrayToString(msg.data))

  console.log(msg.from, "republished", json.name)

  parts = json.name.split('@')
  if (json.name.startsWith('@')) {
    name = '@'+parts[1]
    version = parts[2]
  } else {
    name = parts[0]
    version = parts[1]
  }

  if (store.get(name)) {
    // known project
    if(cid = store.get(json.name)){
      // already downloaded
      if (cid == json.cid) {
        // matching IPFS cid
        console.log(json.name, 'as', json.cid, 'matches existing local copy')
      } else {
        console.log('WARNING', json.name, 'as', json.cid, 'does not match existing local copy')
      }
    } else {
      // download via IPFS
      forest.downloadPackageFromIPFS(name, version, json.cid)
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

function returnTarballEarly(path) {
  name = isTarballRequest(path)
  if (name && store.get(name)) { return name }
}

async function addUrltoIPFS(name, url){
  if (store.get(name)) { return }
  // TODO maybe use the response body we just downloaded rather than downloading again (when used in proxy)
  for await (const file of ipfs.addAll(urlSource(url))) {
    console.log('IPFS add: ', file.path, file.cid.toString())

    // TODO extract into announce method
    store.set(name, file.cid.toString())
    ipfs.pubsub.publish('forest', JSON.stringify({ // TODO seperate out name and version here
      url: url,
      name: name,
      path: file.path,
      cid: file.cid.toString()
    }))

  }
}

function listPackages() {
  var packageNames = []
  for (const element of store) {
    parts = element[0].split('@')
    if (element[0].startsWith('@')) {
      name = '@'+parts[1]
    } else {
      name = parts[0]
    }

    packageNames.push(name)
  }
  return [...new Set(packageNames)].sort()
}

function listVersions(packageName) {
  var versionNames = []
  for (const element of store) {
    parts = element[0].split('@')
    if (element[0].startsWith('@')) {
      name = '@'+parts[1]
      version = parts[2]
    } else {
      name = parts[0]
      version = parts[1]
    }
    if (name === packageName && version) {
      versionNames.push(version)
    }
  }
  return [...new Set(versionNames)].sort()
}

function getVersion(name, version) {
  return store.get(name+'@'+version)
}

async function downloadPackageFromIPFS(name, version, cid) {
  if (store.get(name+'@'+version) === cid){
    console.log('Already downloaded', name+'@'+version, 'from IPFS')
    return
  }
  const metadata = await loadMetadata(name)
  const verionData = metadata.versions[version]
  const integrity = verionData.dist.integrity
  const res = await checkIntegrity(cid, integrity)
  if (res){
    console.log('Downloaded', name+'@'+version, 'from IPFS')
    store.set(name+'@'+version, cid)
    // TODO announce on pubsub (maybe?)
  } else {
    console.log('Failed to download', name+'@'+version, 'from IPFS')
  }
}

async function loadMetadata(name) {
  // TODO use same shared metadata cache as proxy server (once implemented)
  url = "http://registry.npmjs.org/" + name
  const response = await fetch(url);
  const json = await response.json();
  return json
}

async function checkIntegrity(cid, integrity) {
  const responseStream = toStream.readable((async function * () {
    for await (const chunk of ipfs.cat(cid)) {
      yield chunk.slice()
    }
  })())

  return ssri.fromStream(responseStream).then(sri => {
    return sri.toString() === integrity
  })
}

module.exports = {
  subscribePackageAnnoucements,
  unsubscribePackageAnnoucements,
  isMetadataRequest,
  isTarballRequest,
  returnTarballEarly,
  addUrltoIPFS,
  downloadPackageFromIPFS,
  listPackages,
  listVersions,
  getVersion,
  checkIntegrity,
  loadMetadata
}
