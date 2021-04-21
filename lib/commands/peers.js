// forage peers
// list peers sharing similar packages to you

const forage = require('../forage');

(async () => {
  var db = forage.connectDB()
  await forage.connectIPFS(db)

  var peerIds = await forage.core.activePeers()

  forage.core.listPeers(db).then(async function(peers) {
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
