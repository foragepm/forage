// forest verify
// validate cids of all existing cached packages

const forest = require('../forest');
const async = require('async');

(async () => {
  forest.connectDB()
  await forest.connectIPFS();

  var q = async.queue(async function(pkg, callback) {
    var res = await forest.validate(pkg.manager, pkg.name, pkg.version)
    if(res){
      console.log('Verifying:', pkg.manager, pkg.name, pkg.version, '✅')
    } else {
      console.log('Verifying:', pkg.manager, pkg.name, pkg.version, '❌')
      await forest.removePackage(pkg.manager, pkg.name, pkg.version)
    }

    callback()
  }, 20)

  // TODO allow passing in a manager via cli --manager=go 
  forest.listPackages().then(async function(packages) {
    packages.forEach(function(pkg) {
      q.push(pkg);
    });

    q.drain = async function() {
      console.log('Verification complete!')
      await forest.closeDB()
    }
  })
})();
