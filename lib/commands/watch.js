// forest watch
// watch for releases from npm registry and republish each one to IPFS

const forest = require('../forest');

(async () => {
  var db = forest.connectDB()
  var ipfsID = await forest.connectIPFS(db);
  if(ipfsID){
    forest.watchAll();
  }
})()
