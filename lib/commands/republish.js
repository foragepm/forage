// forest republish
// Import all packages from a package-lock.json file and record in a forest.lock file

const fs = require('fs');
const forest = require('../forest');
const async = require('async');

(async () => {
  forest.connectDB()
  await forest.connectIPFS();

  var cids = {}

  var q = async.queue(async function(task, callback) {
    const name = task.name
    const pkg = task.pkg
    var manager = task.manager
    console.log("Importing", manager, name, pkg.version)
    if(pkg.resolved){
      var res = await forest.addUrltoIPFS(manager, name, pkg.version, pkg.resolved)
      if(res) { cids[`${manager}:${name}:${pkg.version}`] = res }
    } else {
      console.log("URL missing for", manager, name, pkg.version)
    }
    callback()
  }, 20)

  // TODO accept file argument

  fs.exists('package-lock.json', async (exists) => {
    if (exists) {
      console.log('Reading package-lock.json')
      const packageLock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'))
      await Promise.all(Object.entries(packageLock.dependencies).map(async (arr) => {
        q.push({manager: 'npm', name: arr[0], pkg: arr[1]});
      }));
    }
  });

  fs.exists('go.sum', async (exists) => {
    if (exists) {
      console.log('Reading go.sum')
      const gosum = fs.readFileSync('go.sum', 'utf8').split("\n")
      gosum.forEach(function(str) {
        if(str.length > 0){
          var parts = str.split(' ')
          var name = parts[0].toLowerCase()
          var version = parts[1].split('/')[0].toLowerCase()
          var pkg = {
            version: version,
            resolved: `https://proxy.golang.org/${name}/@v/${version}.zip`
          }
          q.push({manager: 'go', name: name, pkg: pkg});
        }
      });
    }
  });

  q.drain = async function() {
    if(cids.length > 0){
      JSON.stringify(cids, Object.keys(cids).sort(), 2);
      fs.writeFileSync('forest.lock', JSON.stringify(cids, Object.keys(cids).sort(), 2), 'utf8')
      console.log(Object.keys(cids).length, 'Package CIDs written to forest.lock')
    }

    await forest.closeDB()
  }
})();
