// forest republish
// Import all packages from a package-lock.json file and record in a forest.lock file

const fs = require('fs');
const packageLock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8')); // TODO accept file argument
const forest = require('../forest');
const async = require('async');

(async () => {
  await forest.connectIPFS();

  var cids = {}

  var q = async.queue(async function(task, callback) {
    const name = task.name
    const pkg = task.pkg
    const key = name+'@'+pkg.version
    console.log("Importing", key)
    if(pkg.resolved){
      var res = await forest.addUrltoIPFS(key, pkg.resolved)
      if(res) { cids[key] = res }
    } else {
      console.log("URL missing for", key)
    }
    callback()
  }, 20)

  await Promise.all(Object.entries(packageLock.dependencies).map(async (arr) => {
    q.push({name: arr[0], pkg: arr[1]});
  }));

  q.drain = function() {
    JSON.stringify(cids, Object.keys(cids).sort(), 2);
    fs.writeFileSync('forest.lock',JSON.stringify(cids, Object.keys(cids).sort(), 2), 'utf8')
    console.log(Object.keys(cids).length, 'Package CIDs written to forest.lock')
  }
})();
