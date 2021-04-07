// forest update
// check for updates to all cached packages

const forest = require('../forest');
const async = require('async');

(async () => {
  var db = forest.connectDB()
  await forest.connectIPFS(db);

  var q = async.queue(async function(pkg, callback) {
    console.log('Checking:', pkg.name)
    await forest.update(pkg.manager, pkg.name)

    callback()
  }, 20)

  forest.listPackageNames().then(function(packages) {
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
