const forest = require('./forest')
const goServerHandler = require('./go')

var httpProxy = require('http-proxy');

var proxy = httpProxy.createProxy({secure: false});
var url = require('url');
var http = require('http')

async function serverHandler(req, res) {
  var path = req.url

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

  if(req.headers['user-agent'].match(/npm/)){
    var tarball = await forest.npm.returnTarballEarly(path)
    var metadataName = forest.npm.isMetadataRequest(path)

    if(req.method == 'GET' && tarball.name && tarball.cid) {
      console.log(tarball.name, 'Available in IPFS', tarball.cid)
      forest.tarballHandler(tarball.name+'.tgz', 'application/gzip', tarball.cid, req, res)
    } else if (req.method == 'GET' && metadataName){
      forest.metadataHandler(metadataName, req, res)
    } else {
      proxy.web(req, res, {
        target: 'http://registry.npmjs.org/',
        changeOrigin: true
      })
    }
  }

  goServerHandler(req, res)
}

var server = http.createServer(serverHandler);

proxy.on('error', function (err, req, res) {
  console.log('ERROR', err)
});

proxy.on('proxyRes', function (proxyRes, req, res) {
  path = req.url.replace('http://registry.npmjs.org', '')

  if({name, version} = forest.npm.isTarballRequest(path)) {
    // cache tarball and send on response i.e. add to ipfs and store the CID
    forest.addUrltoIPFS('npm', name, version, req.url)
  }
});

module.exports = server
