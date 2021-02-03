// forest search
// search packages by name

const forest = require('../forest');

async function search(argv) {
  var query = argv.query
  forest.connectDB()
  forest.search(query).then(async function(packages) {
    packages.forEach(function(pkg) {
      console.log(pkg.manager, pkg.name)
    });
    await forest.closeDB()
  })
}

module.exports = search
