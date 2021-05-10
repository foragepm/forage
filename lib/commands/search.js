// forage search
// search packages by name

const forage = require('../forage');

async function search(argv) {
  var query = argv.query
  var db = forage.connectDB()
  forage.search(query).then(async function(packages) {
    packages.forEach(function(pkg) {
      console.log(pkg.manager, pkg.name, pkg.version)
    });
    await db.close()
    process.exit(0)
  })
}

module.exports = search
