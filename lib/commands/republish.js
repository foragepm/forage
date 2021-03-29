// forest republish
// Import all packages from a package-lock.json file and record in a forest.lock file

const fs = require('fs');
const forest = require('../forest');
const async = require('async');

(async () => {
  var db = forest.connectDB()
  await forest.connectIPFS(db);

  var cids = {}

  var q = async.queue(async function(task, callback) {
    const name = task.name
    const pkg = task.pkg
    var manager = task.manager

    console.log()
    console.log(manager, name, pkg.version)

    var possibleCID = await forest.fetchAndAddtoIPFS(manager, name, pkg.version, pkg.resolved)
    console.log('possibleCID', possibleCID)
    console.log('Integrity:', pkg.integrity)
    if(possibleCID){
      console.log(`Expected CID to load from IPFS: ${possibleCID}`)
      var hashAlg = 'sha2-512'
    } else {
      var hashAlg = 'sha2-256'
    }

    if(pkg.resolved){
      var res = await forest.core.addUrltoIPFS(db, manager, name, pkg.version, pkg.resolved, hashAlg)
      console.log('Actual CID from adding to IPFS:', res)
      if(res) { cids[`${manager}:${name}:${pkg.version}`] = res }
    } else {
      console.log("URL missing for", manager, name, pkg.version)
    }
    callback()
  }, 10)

  // TODO accept file argument

  q.drain(async function() {
    if(Object.keys(cids).length > 0){
      JSON.stringify(cids, Object.keys(cids).sort(), 2);
      fs.writeFileSync('forest.lock', JSON.stringify(cids, Object.keys(cids).sort(), 2), 'utf8')
      console.log(Object.keys(cids).length, 'Package CIDs written to forest.lock')
    }
    await db.close()
  })

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
      const gosum = forest.go.parseGoSum('go.sum')
      gosum.forEach(function(pkg) {
        q.push({manager: pkg.manager, name: pkg.name, pkg: pkg});
      });
    }
  });

})();
