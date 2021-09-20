// forage import
// read a forage.lock file and fetch+verify each package contained within it

const fs = require('fs');
const forage = require('../forage');
const async = require('async');

module.exports = async (argv) => {
  var db = forage.connectDB()
  await forage.connectIPFS(db, argv.topic);

  path = 'forage.lock' // TODO accept file argument

  file = await forage.importLock(db, path)
  console.log('Imported', Object.keys(file).length, 'packages from IPFS')
  await db.close()
  process.exit(0)
}
