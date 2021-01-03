// forest import
// read a forest.lock file and fetch+verify each package contained within it

const fs = require('fs');
const forestLock = JSON.parse(fs.readFileSync('forest.lock', 'utf8')); // TODO accept file argument
const forest = require('./lib/forest');

(async () => {
  var cids = {}

  for (const key in forestLock) {
    const cid = forestLock[key]

    const {name, version} = forest.splitKey(key)

    await forest.downloadPackageFromIPFS(name, version, cid) // TODO do it async (faster)
  }

  console.log('Imported', Object.keys(forestLock).length, 'packages from IPFS')
})()
