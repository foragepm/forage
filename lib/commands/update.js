// forest update
// check for updates to all cached packages

const forest = require('../forest');
const async = require('async');

(async () => {
  forest.connectDB()
  await forest.connectIPFS();

  var q = async.queue(async function(name, callback) {
    console.log('Checking:', name)
    var update = await forest.updateMetadata('npm', name)
    if (update) {
      var newestVersion = forest.npm.getLatestVersion(update)
      await forest.downloadPackageFromRegistry('npm', name, newestVersion)
    }
    callback()
  }, 20)

  forest.listPackageNames('npm').then(function(packages) {
    packages.forEach(async function(pkg) {
      q.push(pkg.name);
    });

    q.drain = async function() {
      console.log('Done')
      await forest.closeDB()
    }
  })
})();
