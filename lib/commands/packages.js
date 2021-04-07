// forest packages
// List all packages republished in IPFS

const forest = require('../forest');

(async () => {
  var db = forest.connectDB()
  forest.listPackages().then(async function(packages) {
    packages.forEach(pkg => console.log(pkg.manager, pkg.name, pkg.version));
    console.log('Total: ' + packages.length, 'packages')
    await db.close()
    process.exit(0)
  })
})()
