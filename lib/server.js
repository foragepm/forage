const forest = require('./forest')
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
        var json = await forest.listPackages()
        res.end(JSON.stringify(json));
      }
    }

    for (const [name, manager] of Object.entries(forest.managers)) {
      manager.serverHandler(db, req, res)
    }
  });

  return server
}

module.exports = createServer
