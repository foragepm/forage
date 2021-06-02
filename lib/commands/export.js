// forage export
// Export all packages as a single IPFS directory

const forage = require('../forage');

async function export(argv) {
  var db = forage.connectDB()
  await forage.connectIPFS(db);

  var stats = await forage.core.exportPackages(db)
  console.log(stats)
  await db.close()
  process.exit(0)
}

module.exports = export
