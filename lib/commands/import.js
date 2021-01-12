// forest import
// read a forest.lock file and fetch+verify each package contained within it

const fs = require('fs');
const forestLock = JSON.parse(fs.readFileSync('forest.lock', 'utf8')); // TODO accept file argument
const forest = require('../forest');
const async = require('async');

(async () => {
  await forest.connectIPFS();

  var q = async.queue(async function(task, callback) {
    const key = task.key
    const cid = task.cid
    const {name, version} = forest.splitKey(key)
    await forest.downloadPackageFromIPFS(name, version, cid)
    callback()
  }, 20)

  await Promise.all(Object.entries(forestLock).map(async (arr) => {
    q.push({key: arr[0], cid: arr[1]});
  }));

  q.drain = function() {
    console.log('Imported', Object.keys(forestLock).length, 'packages from IPFS')
  }
})();
