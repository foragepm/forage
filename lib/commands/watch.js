// forage watch
// watch for releases from npm registry and republish each one to IPFS

const forage = require('../forage');

async function watch(argv) {
  var db = forage.connectDB()
  var ipfsID = await forage.connectIPFS(db);
  if(ipfsID){
    forage.watchAll();
  }
}

module.exports = watch
