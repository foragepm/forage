// forage seed
// reseed any packages announced on IPFS

const forage = require('../forage');

(async () => {
  var db = forage.connectDB()
  await forage.connectIPFS(db);

  forage.subscribePackageAnnoucements(forage.seed);
})();
