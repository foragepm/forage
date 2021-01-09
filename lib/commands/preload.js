// forest preload
// Import all packages from all package-lock.json files into forest

const fs = require('fs');
const forest = require('../forest');
const path = require("path");

(async () => {
  await forest.connectIPFS();

  console.log('Searching for package-lock.json files...')

  const child = require('child_process').exec("find . -name 'package-lock.json'")

  child.stdout.on('data', function(data) {
    var filepaths = data.toString().trim().split("\n");

    filepaths.forEach(function(filepath) {
      console.log("Importing", filepath);
      const packageLock = JSON.parse(fs.readFileSync(path.resolve(filepath), 'utf8'));

      if(packageLock.dependencies) {
        Promise.all(Object.entries(packageLock.dependencies).map(async (arr) => {
            const name = arr[0]
            const pkg = arr[1]
            const key = name+'@'+pkg.version
            console.log("Importing", key)
            if(pkg.resolved){
              forest.addUrltoIPFS(key, pkg.resolved)
              forest.loadMetadata(name)
            } else {
              console.log("URL missing for", key)
            }
        }));
      }
    })
  });
})()
