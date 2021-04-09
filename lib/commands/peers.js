// forest peers
// list peers sharing similar packages to you

const forest = require('../forest');

(async () => {
  var db = forest.connectDB()
  await forest.connectIPFS(db)

  var peerIds = await forest.core.activePeers()

  forest.core.listPeers(db).then(async function(peers) {
    peers.forEach(peer => {
      if(peerIds.includes(peer)){
        console.log(`${peer} (online)`)
      } else {
        console.log(peer)
      }
    });
    console.log('Total: ' + peers.length, 'peers')
    await db.close()
    process.exit(0)
  })
})();
