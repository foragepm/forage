var validateNpmPackageName = require("validate-npm-package-name")


const Conf = require('conf');
const store = new Conf({accessPropertiesByDotNotation: false, projectName: 'forest'});

const uint8ArrayToString = require('uint8arrays/to-string')

var httpProxy = require('http-proxy');

var proxy = httpProxy.createProxy({secure: false});
var url = require('url');
var http = require('http')
const toStream = require('it-to-stream')

const IpfsHttpClient = require('ipfs-http-client')
const { urlSource } = IpfsHttpClient
const ipfs = IpfsHttpClient()
const detectContentType = require('ipfs-http-response/src/utils/content-type')

var ipfsId;

async function loadIPFS() {
  const ipfsId = await ipfs.id()

  console.log("IPFS peer id:", ipfsId.id)
}

async function watchForPackages() {
  const topic = 'forest'
  const receiveMsg = function(msg){
    json = JSON.parse(uint8ArrayToString(msg.data))
    console.log(msg.from, "republished", json.name)
  }

  await ipfs.pubsub.subscribe(topic, receiveMsg)
  console.log(`subscribed to ${topic}`)
}

loadIPFS()
watchForPackages()

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

var server = http.createServer(function(req, res) {
  path = req.url.replace('http://registry.npmjs.org', '')

  if (name = isMetadataRequest(path)) {
    // request for metadata - check to see if we already have it and return if we do (low priority)
    console.log('metadata request:', name)
    if (store.get(name)) {
      console.log('  hit')
    } else {
      console.log('  miss')
    }
  } else if(name = isTarballRequest(path)) {
    // request for tarball - check to see if we already have it and return if we do
    console.log('tarball request:', name)
  }

  if(name = returnTarballEarly(path)) {
    console.log(name, 'Available in IPFS')
    tarballHandler(name, req, res)
  } else {
    proxy.web(req, res, {
      target: 'http://registry.npmjs.org/',
      changeOrigin: true
    })
  }
});

async function tarballHandler(name, req, res) {
  var cid = store.get(name)

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

proxy.on('error', function (err, req, res) {
  console.log('ERROR', err)
});

async function addUrltoIPFS(name, url){
  if (store.get(name)) { return }
  // TODO use the response body we just downloaded rather than downloading again
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

proxy.on('proxyRes', function (proxyRes, req, res) {
  path = req.url.replace('http://registry.npmjs.org', '')

  if (name = isMetadataRequest(path)) {
    // cache metadata and send on response i.e. store/update json for package
    console.log('metadata response:', name)
    store.set(name, true) // TODO only store if response is successful
  } else if(name = isTarballRequest(path)) {
    // cache tarball and send on response i.e. add to ipfs and store the CID
    console.log('tarball response:', name)

    addUrltoIPFS(name, req.url)
  }
});

module.exports = server
