const forage = require('./forage')

async function serverHandler(db, req, res) {
  var requestPath = req.url

  if (/^\/\~\/api\/packages$/.test(requestPath)) {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    });
    var json = await forage.listPackages()
    // TODO go module names should be unescaped (maybe this is the wrong place for that change)
    res.end(JSON.stringify(json));
    return
  }
}

module.exports = {
  serverHandler
}
