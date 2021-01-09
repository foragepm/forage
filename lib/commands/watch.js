// forest watch
// watch for releases from npm registry and republish each one to IPFS

const forest = require('../forest');

(async () => {
  var ipfsID = await forest.connectIPFS();
  if(ipfsID){
    forest.watchAll();
  }
})()
