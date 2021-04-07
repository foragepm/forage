// forest search
// search packages by name

const forest = require('../forest');

async function search(argv) {
  var query = argv.query
  var db = forest.connectDB()
  forest.search(query).then(async function(packages) {
    packages.forEach(function(pkg) {
      console.log(pkg.manager, pkg.name)
    });
    await db.close()
    process.exit(0)
  })
}

module.exports = search
