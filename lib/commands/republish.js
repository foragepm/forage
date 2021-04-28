// forage republish
// Import all packages from a package-lock.json file and record in a forage.lock file

const fs = require('fs');
const forage = require('../forage');
const async = require('async');

(async () => {
  var db = forage.connectDB()
  await forage.connectIPFS(db);

  var cids = {}

  var q = async.queue(async function(task) {
    const name = task.name
    const pkg = task.pkg
    var manager = task.manager

    console.log('Republishing', manager, name, pkg.version)

    if(pkg.resolved){
      var cid = await forage.importPackage(manager, name, pkg.version, pkg.resolved)
      if(cid) { cids[`${manager}:${name}:${pkg.version}`] = cid }
    } else {
      console.log("URL missing for", manager, name, pkg.version)
    }
  }, forage.concurrency())

  q.error(function(err, task) {
      console.error("Failed to import", task, err);
  });

  // TODO accept file argument

  for (const [name, manager] of Object.entries(forage.managers)) {
    if(manager.lockfileExists()){
      const pkgs = await manager.readLockfile(manager.lockfileName())
      pkgs.forEach(function(pkg) {
        q.push({manager: pkg.manager, name: pkg.name, pkg: pkg});
      });
    }
  }

  await q.drain()

  if(Object.keys(cids).length > 0){
    JSON.stringify(cids, Object.keys(cids).sort(), 2);
    fs.writeFileSync('forage.lock', JSON.stringify(cids, Object.keys(cids).sort(), 2), 'utf8')
    console.log(Object.keys(cids).length, 'Package CIDs written to forage.lock')
  }

  await db.close()
  process.exit(0)
})();
