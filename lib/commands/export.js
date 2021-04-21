// forage export
// Export all packages as a single IPFS directory

const forage = require('../forage');
const async = require('async');

(async () => {
  var db = forage.connectDB()
  await forage.connectIPFS(db);

  var stats = await forage.core.exportPackages(db)
  console.log(stats)
  await db.close()
  process.exit(0)
})();
