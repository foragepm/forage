const forage = require('./forage')
const log = require('electron-log')

async function serverHandler(db, req, res) {
  var requestPath = req.url

  log.debug('api', requestPath)

  // list packages
  if (/^\/\~\/api\/packages$/.test(requestPath)) {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    });
    var json = await forage.listPackageNames()
    // TODO go module names should be unescaped (maybe this is the wrong place for that change)
    res.end(JSON.stringify(json));
    return
  }

  // individual package
  if (/^\/\~\/api\/packages\/\w+\/.+/.test(requestPath)) {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    });

    var match = requestPath.match(/api\/packages\/(\w+)\/(.+)/)
    var manager = match[1]
    var name = match[2]

    var json = await forage.packageAsJson(manager, name)
    res.end(JSON.stringify(json));
    return
  }
}

module.exports = {
  serverHandler
}
