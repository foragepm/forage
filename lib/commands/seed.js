// forage seed
// reseed any packages announced on IPFS

const forage = require('../forage');

async function seed(argv) {
  var db = forage.connectDB()
  await forage.connectIPFS(db);

  forage.seed()
}

module.exports = seed
