const forest = require('./forest')

var httpProxy = require('http-proxy');

var proxy = httpProxy.createProxy({secure: false});
var url = require('url');
var http = require('http')

async function serverHandler(req, res) {
  var path = req.url.replace('http://registry.npmjs.org', '')

  var tarball = await forest.returnTarballEarly(path)

  var metadataName = forest.isMetadataRequest(path)

  if(req.method == 'GET' && tarball.name) {
    console.log(tarball.name, 'Available in IPFS', tarball.cid)
    forest.tarballHandler(tarball.name, tarball.cid, req, res)
  } else if (req.method == 'GET' && metadataName){
    metadataHandler(metadataName, req, res)
  } else if (/^\/\~\/api/.test(path)) {
    // http api
    if (/^\/\~\/api\/packages$/.test(path)) {
      res.writeHead(200, {"Content-Type": "application/json"});
      json = await forest.listPackages()
      res.end(JSON.stringify(json));
    }
  } else {
    proxy.web(req, res, {
      target: 'http://registry.npmjs.org/',
      changeOrigin: true
    })
  }
}

var server = http.createServer(serverHandler);

async function metadataHandler(name, req, res) {
  // TODO handle etags and 304 requests
  // TODO handle npm minimal metadata requests
  // TODO should probably move saving metadata from res in ProxyRes so it handles private modules
  const json = await forest.loadMetadata(name)

  res.writeHead(200, {"Content-Type": "application/json"});
  res.end(JSON.stringify(json));
}

proxy.on('error', function (err, req, res) {
  console.log('ERROR', err)
});

proxy.on('proxyRes', function (proxyRes, req, res) {
  path = req.url.replace('http://registry.npmjs.org', '')

  if (name = forest.isMetadataRequest(path)) {
    // cache metadata and send on response i.e. store/update json for package
    // store.set(name, true) // TODO only store if response is successful
  } else if(name = forest.isTarballRequest(path)) {
    // cache tarball and send on response i.e. add to ipfs and store the CID
    forest.addUrltoIPFS(name, req.url)
  }
});

module.exports = server
