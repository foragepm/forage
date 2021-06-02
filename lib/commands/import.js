// forage import
// read a forage.lock file and fetch+verify each package contained within it

const fs = require('fs');
const forageLock = JSON.parse(fs.readFileSync('forage.lock', 'utf8')); // TODO accept file argument
const forage = require('../forage');
const async = require('async');

async function import(argv) {
  var db = forage.connectDB()
  await forage.connectIPFS(db, argv.topic);

  var q = async.queue(async function(task) {
    var parts = task.pkg.split(':')
    await forage.downloadPackageFromIPFS(parts[0], parts[1], parts[2], task.cid)
  }, forage.concurrency())

  await Promise.all(Object.entries(forageLock).map(async (arr) => {
    q.push({pkg: arr[0], cid: arr[1]});
  }));

  q.drain(async function() {
    console.log('Imported', Object.keys(forageLock).length, 'packages from IPFS')
    await db.close()
    process.exit(0)
  })
}

module.exports = import
