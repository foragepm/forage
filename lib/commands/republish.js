// forest republish
// Import all packages from a package-lock.json file and import and record in a forest.lock file

const fs = require('fs');
const packageLock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8')); // TODO accept file argument
const forest = require('../forest');

(async () => {
  var cids = {}

  for (const name in packageLock.dependencies) {
    const pkg = packageLock.dependencies[name]
    const key = name+'@'+pkg.version
    console.log("Importing", key)
    await forest.addUrltoIPFS(key, pkg.resolved) // TODO do it async (faster)
    cids[key] = forest.getVersion(name, pkg.version)
  }

  fs.writeFileSync('forest.lock', JSON.stringify(cids, null, 2), 'utf8')
  console.log('Package CIDs written to forest.lock')
})()
