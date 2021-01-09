// forest update
// check for updates to all cached packages

const forest = require('../forest');
const async = require('async');

(async () => {
  await forest.connectIPFS();

  var q = async.queue(async function(name, callback) {
    var update = await forest.updateMetadata(name)
    if (update) {
      var newestVersion = forest.getLatestVersion(update)
      await forest.downloadPackageFromRegistry(name, newestVersion)
    }
    callback()
  }, 8)

  forest.listPackageNames().then(function(packages) {
    packages.forEach(async function(name) {
      q.push(name);
    });

    q.drain = function() {
      console.log('Done')
    }
  })
})();
