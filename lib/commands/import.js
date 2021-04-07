// forest import
// read a forest.lock file and fetch+verify each package contained within it

const fs = require('fs');
const forestLock = JSON.parse(fs.readFileSync('forest.lock', 'utf8')); // TODO accept file argument
const forest = require('../forest');
const async = require('async');

(async () => {
  var db = forest.connectDB()
  await forest.connectIPFS(db);

  var q = async.queue(async function(task, callback) {
    var parts = task.pkg.split(':')
    await forest.downloadPackageFromIPFS(parts[0], parts[1], parts[2], task.cid)
    callback()
  }, forest.concurrency)

  await Promise.all(Object.entries(forestLock).map(async (arr) => {
    q.push({pkg: arr[0], cid: arr[1]});
  }));

  q.drain(async function() {
    console.log('Imported', Object.keys(forestLock).length, 'packages from IPFS')
    await db.close()
    process.exit(0)
  })
})();
