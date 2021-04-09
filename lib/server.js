const forest = require('./forest')
const fs = require('fs')
var http = require('http')

async function createServer(db) {
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

    for (const [name, manager] of Object.entries(forest.managers)) {
      manager.serverHandler(db, req, res)
    }
  });

  return server
}

module.exports = createServer
