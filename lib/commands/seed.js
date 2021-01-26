// forest seed
// listen for new packages announced on the IPFS DHT and republish them

const forest = require('../forest');
const uint8ArrayToString = require('uint8arrays/to-string');

(async () => {
  const receiveMsg = function(msg){
    var string = uint8ArrayToString(msg.data)
    var json = JSON.parse(string);
    console.log(msg.from, "republished", json.manager, json.name, json.version, "... seeding");

    // TODO fallback to http if download from IPFS fails or times out
    forest.downloadPackageFromIPFS(json.manager, json.name, json.version, json.cid);
    // forest.addUrltoIPFS(json.manager, json.name, json.version, json.url)
  }

  forest.connectDB()
  await forest.connectIPFS();
  forest.subscribePackageAnnoucements(receiveMsg);
})();
