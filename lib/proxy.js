const forest = require('./forest')

const Conf = require('conf');
const store = new Conf({accessPropertiesByDotNotation: false, projectName: 'forest'});

var httpProxy = require('http-proxy');

var proxy = httpProxy.createProxy({secure: false});
var url = require('url');
var http = require('http')
const toStream = require('it-to-stream')

const IpfsHttpClient = require('ipfs-http-client')
const ipfs = IpfsHttpClient()
const detectContentType = require('ipfs-http-response/src/utils/content-type')

var server = http.createServer(function(req, res) {
  path = req.url.replace('http://registry.npmjs.org', '')

  if (name = forest.isMetadataRequest(path)) {
    // request for metadata - check to see if we already have it and return if we do (low priority)
    if (store.get(name)) {
      console.log('metadata request:', name, '(hit)')
    } else {
      console.log('metadata request:', name, '(miss)')
    }
  } else if(name = forest.isTarballRequest(path)) {
    // request for tarball - check to see if we already have it and return if we do
    console.log('tarball request:', name)
  }

  if(name = forest.returnTarballEarly(path)) {
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

proxy.on('proxyRes', function (proxyRes, req, res) {
  path = req.url.replace('http://registry.npmjs.org', '')

  if (name = forest.isMetadataRequest(path)) {
    // cache metadata and send on response i.e. store/update json for package
    console.log('metadata response:', name)
    store.set(name, true) // TODO only store if response is successful
  } else if(name = forest.isTarballRequest(path)) {
    // cache tarball and send on response i.e. add to ipfs and store the CID
    console.log('tarball response:', name)
    forest.addUrltoIPFS(name, req.url)
  }
});

module.exports = server
