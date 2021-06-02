// forage daemon
// start the http server and proxy

const createServer = require('../server');
const forage = require('../forage');

(async () => {

})()

async function server(argv) {
  var db = forage.connectDB()
  var ipfsID = await forage.connectIPFS(db);
  if(ipfsID){
    var server = createServer(db)
    server.listen(argv.port)
    forage.watchKnown()
    forage.periodicUpdate()
  }
}

module.exports = server
