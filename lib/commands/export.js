// forest export
// Export all packages as a single IPFS directory

const forest = require('../forest');
const async = require('async');

(async () => {
  var db = forest.connectDB()
  await forest.connectIPFS(db);

  var stats = await forest.core.exportPackages(db)
  console.log(stats)
  await db.close()
})();
