// forage id
// find your IPFS peer ID

const forage = require('../forage');

(async () => {
  var db = forage.connectDB()
  var ipfsID = await forage.connectIPFS(db);
  console.log('Peer ID:',ipfsID.id)
  await db.close()
  process.exit(0)
})()
