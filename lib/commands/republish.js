// forest republish
// Import all packages from a package-lock.json file and record in a forest.lock file

const fs = require('fs');
const forest = require('../forest');
const async = require('async');

(async () => {
  var db = forest.connectDB()
  await forest.connectIPFS(db);

  var cids = {}

  var q = async.queue(async function(task) {
    const name = task.name
    const pkg = task.pkg
    var manager = task.manager

    console.log('Republishing', manager, name, pkg.version)

    if(pkg.resolved){
      var cid = await forest.importPackage(manager, name, pkg.version, pkg.resolved)
      if(cid) { cids[`${manager}:${name}:${pkg.version}`] = cid }
    } else {
      console.log("URL missing for", manager, name, pkg.version)
    }
  }, forest.concurrency())

  q.error(function(err, task) {
      console.error('task experienced an error');
  });

  // TODO accept file argument

  if (fs.existsSync('package-lock.json')) {
    console.log('Reading package-lock.json')
    const packageLock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'))
    await Promise.all(Object.entries(packageLock.dependencies).map(async (arr) => {
      q.push({manager: 'npm', name: arr[0], pkg: arr[1]});
    }));
  }

  if (fs.existsSync('go.sum')) {
    console.log('Reading go.sum')
    const gosum = forest.go.parseGoSum('go.sum')
    gosum.forEach(function(pkg) {
      q.push({manager: pkg.manager, name: pkg.name, pkg: pkg});
    });
  }

  await q.drain()

  if(Object.keys(cids).length > 0){
    JSON.stringify(cids, Object.keys(cids).sort(), 2);
    fs.writeFileSync('forest.lock', JSON.stringify(cids, Object.keys(cids).sort(), 2), 'utf8')
    console.log(Object.keys(cids).length, 'Package CIDs written to forest.lock')
  }

  await db.close()
  process.exit(0)
})();
