// forest seed
// listen for new packages announced on the IPFS DHT and republish them

const forest = require('../forest');
const uint8ArrayToString = require('uint8arrays/to-string');

(async () => {
  forest.connectDB()
  await forest.connectIPFS();

  forest.subscribePackageAnnoucements(forest.seed);
})();
