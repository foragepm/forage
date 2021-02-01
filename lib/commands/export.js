// forest export
// Export all packages as a single IPFS directory

const forest = require('../forest');
const async = require('async');

(async () => {
  forest.connectDB()
  await forest.connectIPFS();

  var stats = await forest.exportPackages()
  console.log(stats)
})();
