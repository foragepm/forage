const forage = require('./forage')
const api = require('./api')
const fs = require('fs')
const http = require('http')
const path = require('path')
const serve = require('serve-handler');

const uiDirectory = path.join(__dirname, '..', 'assets', 'ui', 'dashboard')

function createServer(db) {
  var server = http.createServer(async function(req, res) {
    if (/^\/\~\/api/.test(req.url)) {
      await api.serverHandler(db, req, res)
      return
    }

    for (const [name, manager] of Object.entries(forage.managers)) {
      if(manager.matchesUseragent(req)){
        await manager.serverHandler(db, req, res)
        return
      }
    }

    await serve(req, res, {
      cleanUrls: true,
      public: uiDirectory
    });
  });

  return server
}

module.exports = createServer
