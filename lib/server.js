const forest = require('./forest')
const fs = require('fs')

var httpProxy = require('http-proxy');

var url = require('url');
var http = require('http')

async function createServer(db) {
  var proxy = httpProxy.createProxy({secure: false});
  var server = http.createServer(async function(req, res) {
    var path = req.url

    if(path == '/'){
      res.writeHead(200, { 'content-type': 'text/html' })
      fs.createReadStream('ui/dashboard/index.html').pipe(res)
    }

    if (/^\/\~\/api/.test(path)) {
      // http api
      if (/^\/\~\/api\/packages$/.test(path)) {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        });
        json = await forest.listPackages()
        res.end(JSON.stringify(json));
      }
    }

    // should be moved to npm lib as serverHandler
    if(req.headers['user-agent'].match(/npm/)){
      var tarball = await forest.npm.returnTarballEarly(path)
      var metadataName = forest.npm.isMetadataRequest(path)

      if(req.method == 'GET' && tarball.name && tarball.cid) {
        console.log(tarball.name, 'Available in IPFS', tarball.cid)
        forest.core.tarballHandler(tarball.name+'.tgz', 'application/gzip', tarball.cid, req, res)
      } else if (req.method == 'GET' && metadataName){
        forest.npm.metadataHandler(db, metadataName, req, res)
      } else {
        proxy.web(req, res, {
          target: 'http://registry.npmjs.org/',
          changeOrigin: true
        })
      }
    }

    forest.go.serverHandler(db, req, res)
  });

  proxy.on('error', function (err, req, res) {
    console.log('ERROR', err)
  });

  proxy.on('proxyRes', function (proxyRes, req, res) {
    path = req.url.replace('http://registry.npmjs.org', '')

    if({name, version} = forest.npm.isTarballRequest(path)) {
      // cache tarball and send on response i.e. add to ipfs and store the CID
      // if we have metadata and sha512 available, hashAlg = sha2-512
      forest.core.addUrltoIPFS(db, 'npm', name, version, req.url)
    }
  });

  return server
}

module.exports = createServer
