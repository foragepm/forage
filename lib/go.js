const forest = require('./forest')
const fetch = require('node-fetch')

async function goServerHandler(req, res) {
  path = req.url

  if (/@v\/list$/.test(path)){
    var name = forest.go.parseName(path)
    console.log('go list', name)

    var body = await forest.loadGoVersionsList(name)

    if(body){
      res.writeHead(200, {"Content-Type": "text/plain"});
      res.end(body);
    } else {
      res.writeHead(404);
      res.end();
    }
  }

  if (/@v\/(.+)\.info$/.test(path)){
    var name = forest.go.parseName(path)
    var version = forest.go.parseVersion(path)
    console.log('go info', name, version)

    var body = await forest.loadGoInfo(name, version)

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

    var body = await forest.loadGoMod(name, version)

    if(body){
      res.writeHead(200, {"Content-Type": "text/plain"});
      res.end(body);
    } else {
      res.writeHead(404);
      res.end();
    }
  }

  if (/@v\/(.+)\.zip$/.test(path)){
    var name = forest.go.parseName(path)
    var version = forest.go.parseVersion(path)
    console.log('go source', name, version)

    var tarball = await forest.go.returnTarballEarly(name, version)

    if(tarball.cid){
      forest.tarballHandler(version+'.zip', 'application/zip', tarball.cid, req, res)
    } else {
      forest.downloadGoPackageFromRegistry(name, version)
      var url = `https://proxy.golang.org/${name}/@v/${version}.zip`
      // TODO use the zip we just download to ipfs
      fetch(url).then(resp => new Promise((resolve, reject) => {
          res.writeHead(resp.status, { 'Content-Type': 'application/zip' });
          resp.body.pipe(res);
      }));
    }
  }

  if (/@latest$/.test(path)){
    var name = forest.go.parseName(path)
    console.log('go latest', name)

    var body = await forest.loadGoLatest(name)

    if(body){
      res.writeHead(200, {"Content-Type": "application/json"});
      res.end(JSON.stringify(body));
    } else {
      res.writeHead(404);
      res.end();
    }
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

module.exports = goServerHandler
