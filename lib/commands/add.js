// forage add
// add a package to forage

const forage = require('../forage');

async function add(argv) {
  var manager = argv.manager
  var name = argv.name
  var db = forage.connectDB()
  await forage.connectIPFS(db);

  var {version, cid} = await forage.importLatest(manager, name)

  if(version && cid){
    console.log('Added', manager, name, version, `(${cid})`)
  } else {
    console.log('Failed to add', manager, name, version)
  }

  await db.close()
  process.exit(0)
}

module.exports = add
