// forest republish
// Import all packages from a package-lock.json file and import and record in a forest.lock file

const fs = require('fs');
const packageLock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8')); // TODO accept file argument
const forest = require('../forest');

(async () => {
  var cids = {}

  await Promise.all(Object.entries(packageLock.dependencies).map(async (arr) => {
      const name = arr[0]
      const pkg = arr[1]
      const key = name+'@'+pkg.version
      console.log("Importing", key)
      if(pkg.resolved){
        await forest.addUrltoIPFS(key, pkg.resolved)
        cids[key] = await forest.getVersion(name, pkg.version)
      } else {
        console.log("URL missing for", key)
      }
      await forest.addUrltoIPFS(key, pkg.resolved)
      cids[key] = await forest.getVersion(name, pkg.version)
  }));

  JSON.stringify(cids, Object.keys(cids).sort(), 2);

  fs.writeFileSync('forest.lock',JSON.stringify(cids, Object.keys(cids).sort(), 2), 'utf8')
  console.log(Object.keys(cids).length, 'Package CIDs written to forest.lock')
})()
