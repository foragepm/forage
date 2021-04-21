// forage update
// check for updates to all cached packages

const forage = require('../forage');
const async = require('async');

(async () => {
  var db = forage.connectDB()
  await forage.connectIPFS(db);

  var q = async.queue(async function(pkg, callback) {
    console.log('Checking:', pkg.name)
    await forage.update(pkg.manager, pkg.name)

    callback()
  }, forage.concurrency())

  forage.listPackageNames().then(function(packages) {
    packages.forEach(async function(pkg) {
      q.push(pkg);
    });

    q.drain(async function() {
      console.log('Done')
      await db.close()
      process.exit(0)
    })
  })
})();
