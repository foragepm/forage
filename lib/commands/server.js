// forest daemon
// start the http server and proxy

const createServer = require('../server');
const forest = require('../forest');

(async () => {
  var db = forest.connectDB()
  var ipfsID = await forest.connectIPFS(db);
  if(ipfsID){
    server = await createServer(db)
    server.listen(8005)
    forest.subscribePackageAnnoucements()
    forest.watchKnown()
  }
})()
