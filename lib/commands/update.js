// forage update
// check for updates to all cached packages

const forage = require('../forage');

async function update(argv) {
  var db = forage.connectDB()
  await forage.connectIPFS(db, argv.topic);

  await forage.updateAll(function(pkg, res) {
    if(res){
      console.log(pkg.manager, pkg.name, 'updated')
    } else {
      console.log(pkg.manager, pkg.name, 'up to date')
    }
  })

  await db.close()
  process.exit(0)
}

module.exports = update
