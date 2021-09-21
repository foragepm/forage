// forage import
// read a forage.lock file and fetch+verify each package contained within it

const forage = require('../forage');

module.exports = async (argv) => {
  var db = forage.connectDB()
  await forage.connectIPFS(db, argv.topic);

  var path = 'forage.lock' // TODO accept file argument

  var file = await forage.importLock(db, path)
  console.log('Imported', Object.keys(file).length, 'packages from IPFS')
  await db.close()
  process.exit(0)
}
