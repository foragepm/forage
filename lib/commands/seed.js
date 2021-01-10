// forest seed
// listen for new packages announced on the IPFS DHT and republish them

const forest = require('../forest');
const uint8ArrayToString = require('uint8arrays/to-string');

(async () => {
  const receiveMsg = function(msg){
    var string = uint8ArrayToString(msg.data)
    var json = JSON.parse(string);
    console.log(msg.from, "republished", json.name, "... seeding");

    const {name, version} = forest.splitKey(json.name);

    // TODO fallback to http if download from IPFS fails or times out
    forest.downloadPackageFromIPFS(name, version, json.cid);
    // forest.addUrltoIPFS(json.name, json.url)
  }

  await forest.connectIPFS();
  forest.subscribePackageAnnoucements(receiveMsg);
})();
