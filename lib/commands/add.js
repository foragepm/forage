// forest add
// add a package to forest

const forest = require('../forest');

async function add(argv) {
  var manager = argv.manager
  var name = argv.name
  var db = forest.connectDB()
  await forest.connectIPFS(db);

  var {version, cid} = await forest.importLatest(manager, name)

  if(version){
    console.log('Added', manager, name, version, cid)
  } else {
    console.log('Failed to add', manager, name, version, cid)
  }

  await db.close()
}

module.exports = add
