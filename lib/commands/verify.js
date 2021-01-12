// forest verify
// validate cids of all existing cached packages

const forest = require('../forest');
const async = require('async');

(async () => {
  await forest.connectIPFS();

  var q = async.queue(async function(key, callback) {
    var {name, version} = forest.splitKey(key)
    var res = await forest.validate(name, version)

    if(res){
      console.log('Verifying:', key, '✅')
    } else {
      console.log('Verifying:', key, '❌')
      await forest.removePackage(name, version)
    }

    callback()
  }, 20)

  forest.listPackages().then(async function(packages) {
    packages.forEach(async function(key) {
      q.push(key);
    });

    q.drain = async function() {
      console.log('Verification complete!')
      await forest.closeDB()
    }
  })
})();
