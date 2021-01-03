// forest import
// read a forest.lock file and fetch+verify each package contained within it

const fs = require('fs');
const forestLock = JSON.parse(fs.readFileSync('forest.lock', 'utf8')); // TODO accept file argument
const forest = require('../forest');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  await Promise.all(Object.entries(forestLock).map(async (arr) => {
    const {name, version} = forest.splitKey(arr[0])
    await forest.downloadPackageFromIPFS(name, version, arr[1])
  }));

  console.log('Imported', Object.keys(forestLock).length, 'packages from IPFS')
})()
