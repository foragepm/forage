// forage seed
// listen for new packages announced on the IPFS DHT and republish them

const forage = require('../forage');

(async () => {
  var db = forage.connectDB()
  await forage.connectIPFS(db);

  forage.subscribePackageAnnoucements(forage.seed);
})();
