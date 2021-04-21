const forage = require('./forage')
const fs = require('fs')
const http = require('http')
const path = require('path')
const uiDirectory = path.join(__dirname, '..', 'assets', 'ui')

async function createServer(db) {
  var server = http.createServer(async function(req, res) {
    var requestPath = req.url

    if(requestPath == '/'){
      res.writeHead(200, { 'content-type': 'text/html' })
      fs.createReadStream(path.join(uiDirectory, 'dashboard', 'index.html')).pipe(res)
    }

    if (/^\/\~\/api/.test(requestPath)) {
      // http api
      if (/^\/\~\/api\/packages$/.test(requestPath)) {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        });
        var json = await forage.listPackages()
        // TODO go module names should be unescaped (maybe this is the wrong place for that change)
        res.end(JSON.stringify(json));
      }
    }

    for (const [name, manager] of Object.entries(forage.managers)) {
      manager.serverHandler(db, req, res)
    }
  });

  return server
}

module.exports = createServer
