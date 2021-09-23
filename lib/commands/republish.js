// forage republish
// Import all packages from a package-lock.json file and record in a forage.lock file

const fs = require('fs');
const forage = require('../forage');
const async = require('async');

async function republish(argv) {
  var db = forage.connectDB()
  await forage.connectIPFS(db, argv.topic);

  var cids = await forage.republish('forage.lock')

  console.log(Object.keys(cids).length, 'Package CIDs written to forage.lock')

  await db.close()
  process.exit(0)
}

module.exports = republish
