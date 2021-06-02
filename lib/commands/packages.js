// forage packages
// List all packages republished in IPFS

const forage = require('../forage');

async function packages(argv) {
  var db = forage.connectDB()
  forage.listPackages().then(async function(packages) {
    packages.forEach(pkg => console.log(pkg.manager, pkg.name, pkg.version));
    console.log('Total: ' + packages.length, 'packages')
    await db.close()
    process.exit(0)
  })
}

module.exports = packages
