// forage daemon
// start the http server and proxy

const createServer = require('../server');
const forage = require('../forage');

(async () => {
  var db = forage.connectDB()
  var ipfsID = await forage.connectIPFS(db);
  if(ipfsID){
    var server = await createServer(db)
    server.listen(8005)
    forage.subscribePackageAnnoucements()
    forage.watchKnown()
  }
})()
