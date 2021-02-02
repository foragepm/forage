// forest id
// find your IPFS peer ID

const forest = require('../forest');

(async () => {
  forest.connectDB()
  var ipfsID = await forest.connectIPFS();
  console.log('Peer ID:',ipfsID.id)
})()
