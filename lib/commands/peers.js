// forest peers
// list peers sharing similar packages to you

const forest = require('../forest');

(async () => {
  forest.connectDB()

  forest.listPeers().then(async function(peers) {
    peers.forEach(peer => console.log(peer));
    console.log('Total: ' + peers.length, 'peers')
    await forest.closeDB()
  })
})();
