const forest = require('./forest')
const http = require('http')
const fetch = require('node-fetch')

async function serverHandler(req, res) {
  path = req.url

  if (/@v\/list$/.test(path)){
    var name = forest.go.parseName(path)
    console.log('go list', name)

    var body = await forest.loadGoVersionsList(path)

    if(body){
      res.writeHead(200, {"Content-Type": "text/plain"});
      res.end(body);
    } else {
      res.writeHead(404);
      res.end();
    }
  }

  if (/@v\/(.+)\.info$/.test(path)){
    console.log(path)
    var name = forest.go.parseName(path)
    var version = forest.go.parseVersion(path)
    console.log('go info', name, version)

    var body = await forest.loadGoInfo(path)

    if(body){
      res.writeHead(200, {"Content-Type": "application/json"});
      res.end(JSON.stringify(body));
    } else {
      res.writeHead(404);
      res.end();
    }
  }

  if (/@v\/(.+)\.mod$/.test(path)){
    var name = forest.go.parseName(path)
    var version = forest.go.parseVersion(path)
    console.log('go mod', name, version)

    var url = "https://proxy.golang.org"+path
    const response = await fetch(url);
    const body = await response.text();

    // TODO store the mod file

    res.writeHead(response.status, {"Content-Type": "text/plain"});
    res.end(body);
  }

  if (/@v\/(.+)\.zip$/.test(path)){
    var name = forest.go.parseName(path)
    var version = forest.go.parseVersion(path)
    console.log('go source', name, version)

    var tarball = await forest.go.returnTarballEarly(path)

    if(tarball.cid){
      forest.tarballHandler(version+'.zip', 'application/zip', tarball.cid, req, res)
    } else {
      var url = "https://proxy.golang.org"+path
      forest.addUrltoIPFS('go', name, version, url)
      fetch(url).then(resp => new Promise((resolve, reject) => {
          res.writeHead(resp.status, { 'Content-Type': 'application/zip' });
          resp.body.pipe(res);
      }));
    }
  }

  if (/@latest$/.test(path)){
    var name = forest.go.parseName(path)
    console.log('go latest', name)

    var url = "https://proxy.golang.org"+path
    const response = await fetch(url);
    const json = await response.json();

    // TODO store the latest

    res.writeHead(response.status, {"Content-Type": "application/json"});
    res.end(JSON.stringify(json));
  }

  if(/^\/sumdb/.test(path)){
    console.log('go sumdb', path)
    var url = "https://proxy.golang.org"+path
    const response = await fetch(url);
    const body = await response.text();

    // TODO handle being offline

    res.writeHead(response.status, {"Content-Type": "text/plain"});
    res.end(body);
  }
}

var server = http.createServer(serverHandler);

module.exports = server
