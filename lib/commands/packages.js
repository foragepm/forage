// forest packages
// List all packages republished in IPFS

const forest = require('../forest');

(async () => {
  forest.listPackages().then(async function(packages) {
    packages.forEach(element => console.log(element));
    console.log('Total: ' + packages.length, 'packages')
    await forest.closeDB()
  })
})()
