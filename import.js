// forest import
// read a forest.lock file and fetch+verify each package contained within it

const fs = require('fs');
const forestLock = JSON.parse(fs.readFileSync('forest.lock', 'utf8')); // TODO accept file argument
const forest = require('./lib/forest');

(async () => {
  var cids = {}

  for (const key in forestLock) {
    const cid = forestLock[key]

    parts = key.split('@')
    if (key.startsWith('@')) {
      name = '@'+parts[1]
      version = parts[2]
    } else {
      name = parts[0]
      version = parts[1]
    }

    await forest.downloadPackageFromIPFS(name, version, cid) // TODO do it async (faster)
  }

  console.log('Imported', Object.keys(forestLock).length, 'packages from IPFS')
})()
