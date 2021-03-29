// forest id
// find your IPFS peer ID

const forest = require('../forest');

(async () => {
  var db = forest.connectDB()
  var ipfsID = await forest.connectIPFS(db);
  console.log('Peer ID:',ipfsID.id)
  await db.close()
})()
