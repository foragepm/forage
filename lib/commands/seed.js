// forest seed
// listen for new packages announced on the IPFS DHT and republish them

const forest = require('../forest');

(async () => {
  var db = forest.connectDB()
  await forest.connectIPFS(db);

  forest.subscribePackageAnnoucements(forest.seed);
})();
