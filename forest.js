const validateNpmPackageName = require("validate-npm-package-name")
const uint8ArrayToString = require('uint8arrays/to-string')
const IpfsHttpClient = require('ipfs-http-client')
const { urlSource } = IpfsHttpClient
const ipfs = IpfsHttpClient()

const Conf = require('conf');
const store = new Conf({accessPropertiesByDotNotation: false, projectName: 'forest'});

const packageAnnoucementsTopic = 'forest'

async function subscribePackageAnnoucements() {
  const receiveMsg = function(msg){
    json = JSON.parse(uint8ArrayToString(msg.data))
    console.log(msg.from, "republished", json.name)
  }

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
    packageNames.push(element[0].split('@')[0])
  }
  return [...new Set(packageNames)].sort()
}

module.exports = {
  subscribePackageAnnoucements,
  unsubscribePackageAnnoucements,
  isMetadataRequest,
  isTarballRequest,
  returnTarballEarly,
  addUrltoIPFS,
  listPackages
}
