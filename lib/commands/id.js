// forage id
// find your IPFS peer ID

const forage = require('../forage');

(async () => {
  var db = forage.connectDB()
  var ipfsID = await forage.connectIPFS(db);
  var key = await forage.signing.fetchPrivateKey(db)

  var jose = require('node-jose');

  var string = forage.signing.encode(key)

  console.log('Public Key:', string)
  console.log('IPFS Peer ID:',ipfsID.id)
  await db.close()
  process.exit(0)
})()
