// forage install
// read forage.lock, package-lock.json and go.sum files and fetch and install all packages

const forage = require('../forage');
const createServer = require('../server');

module.exports = async (argv) => {
  var db = forage.connectDB()
  await forage.connectIPFS(db, argv.topic);

  var server = createServer(db)
  server.listen(argv.port)

  await forage.importLock(db, 'forage.lock')  // TODO accept file argument

  for (const [name, manager] of Object.entries(forage.managers)) {
    if(manager.lockfileExists()){
      var keys = []
      const pkgs = await manager.readLockfile(manager.lockfileName())

      var existingCids = await forage.core.loadPkgKeys(db)

      pkgs.forEach(function(pkg) {
        var key = `${pkg.manager}:${pkg.name}:${pkg.version}`
        if(!existingCids.includes(key)){
          keys.push(key);
        }
      });

      console.log(pkgs.length, 'packages in', manager.lockfileName())

      console.log(keys.length, 'cids to find')

      if(keys.length > 0){
        var json = await forage.core.lookup(keys)

        console.log(Object.keys(json).length, 'cids found')

        for (const [string, cid] of Object.entries(json)) {
          await db.put(`cid:${string}`, cid)
        }
      }
    }

    if(manager.manifestExists()){
      await manager.installCommand(argv.port)
    }
  }

  var cids = await forage.republish('forage.lock')

  console.log(Object.keys(cids).length, 'Package CIDs written to forage.lock')

  await db.close()
  process.exit(0)
}
