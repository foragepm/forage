const forage = require('./forage')
const api = require('./api')
const fs = require('fs')
const http = require('http')
const path = require('path')
const uiDirectory = path.join(__dirname, '..', 'assets', 'ui')

function createServer(db) {
  var server = http.createServer(async function(req, res) {
    var requestPath = req.url

    if(requestPath == '/'){
      res.writeHead(200, { 'content-type': 'text/html' })
      fs.createReadStream(path.join(uiDirectory, 'dashboard', 'index.html')).pipe(res)
      return
    }

    if (/^\/\~\/api/.test(requestPath)) {
      await api.serverHandler(db, req, res)
      return
    }

    for (const [name, manager] of Object.entries(forage.managers)) {
      if(manager.matchesUseragent(req)){
        await manager.serverHandler(db, req, res)
        return
      }
    }

    // nothing else
    res.writeHead(404);
    return res.end();
  });

  return server
}

module.exports = createServer
