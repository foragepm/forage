// forage verify
// validate cids of all existing cached packages

const forage = require('../forage');
const async = require('async');

(async () => {
  var db = forage.connectDB()
  await forage.connectIPFS(db);

  var q = async.queue(async function(pkg, callback) {
    var res = await forage.validate(pkg.manager, pkg.name, pkg.version)
    if(res){
      console.log('Verifying:', pkg.manager, pkg.name, pkg.version, '✅')
    } else {
      console.log('Verifying:', pkg.manager, pkg.name, pkg.version, '❌')
      await forage.removePackage(pkg.manager, pkg.name, pkg.version)
    }

    callback()
  }, forage.concurrency())

  // TODO allow passing in a manager via cli --manager=go
  forage.listPackages().then(async function(packages) {
    packages.forEach(function(pkg) {
      q.push(pkg);
    });

    q.drain(async function() {
      console.log('Verification complete!')
      await db.close()
      process.exit(0)
    })
  })
})();
