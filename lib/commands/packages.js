// forest packages
// List all packages republished in IPFS

const forest = require('../forest');

forest.listPackages().then(function(packages) {
  packages.forEach(element => console.log(element));
})
