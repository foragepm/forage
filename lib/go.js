const forest = require('./forest')
const http = require('http')
const fetch = require('node-fetch')

async function serverHandler(req, res) {
  path = req.url
  console.log(path)

  // list
  if (/@v\/list$/.test(path)){
    console.log('list')
    var url = "https://proxy.golang.org"+path
    const response = await fetch(url);
    const body = await response.text();

    // TODO store the list of versions

    res.writeHead(response.status, {"Content-Type": "text/plain"});
    res.end(body);
  }

  // info
  if (/@v\/(.+)\.info$/.test(path)){
    console.log('info')

    var url = "https://proxy.golang.org"+path
    const response = await fetch(url);
    const json = await response.json();

    var name = forest.go.parseName(path)
    var version = forest.go.parseVersion(path)
    console.log(name, version)

    // TODO store the info

    res.writeHead(response.status, {"Content-Type": "application/json"});
    res.end(JSON.stringify(json));
  }

  // mod
  if (/@v\/(.+)\.mod$/.test(path)){
    console.log('mod')
    var url = "https://proxy.golang.org"+path
    const response = await fetch(url);
    const body = await response.text();

    // TODO store the mod file

    res.writeHead(response.status, {"Content-Type": "text/plain"});
    res.end(body);
  }

  // source
  if (/@v\/(.+)\.zip$/.test(path)){
    console.log('source')
    var url = "https://proxy.golang.org"+path

    var name = forest.go.parseName(path)
    var version = forest.go.parseVersion(path)

    var tarball = await forest.go.returnTarballEarly(path)
    if(tarball.cid){
      forest.tarballHandler(version+'.zip', 'application/zip', tarball.cid, req, res)
    } else {
      forest.addUrltoIPFS('go', name, version, url)
      fetch(url).then(resp => new Promise((resolve, reject) => {
          res.writeHead(resp.status, { 'Content-Type': 'application/zip' });
          resp.body.pipe(res);
      }));
    }
  }

  // latest
  if (/@latest$/.test(path)){
    var url = "https://proxy.golang.org"+path
    const response = await fetch(url);
    const json = await response.json();

    // TODO store the latest

    res.writeHead(response.status, {"Content-Type": "application/json"});
    res.end(JSON.stringify(json));
  }

  if(/^\/sumdb/.test(path)){
    console.log('sumdb')
    var url = "https://proxy.golang.org"+path
    const response = await fetch(url);
    const body = await response.text();

    // TODO store the mod file

    res.writeHead(response.status, {"Content-Type": "text/plain"});
    res.end(body);
  }
}

var server = http.createServer(serverHandler);

module.exports = server
