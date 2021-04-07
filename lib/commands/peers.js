// forest peers
// list peers sharing similar packages to you

const forest = require('../forest');

(async () => {
  var db = forest.connectDB()

  forest.core.listPeers(db).then(async function(peers) {
    peers.forEach(peer => console.log(peer));
    console.log('Total: ' + peers.length, 'peers')
    await db.close()
    process.exit(0)
  })
})();
