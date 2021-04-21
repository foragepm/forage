// forage watch
// watch for releases from npm registry and republish each one to IPFS

const forage = require('../forage');

(async () => {
  var db = forage.connectDB()
  var ipfsID = await forage.connectIPFS(db);
  if(ipfsID){
    forage.watchAll();
  }
})()
