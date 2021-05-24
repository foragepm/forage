// forage rotate
// generate a new public+private key pair

const forage = require('../forage');

async function rotate(argv) {
  var db = forage.connectDB()
  var newKey = await forage.signing.initPrivateKey(db)
  console.log('Private key rotated')
  await db.close()
  process.exit(0)
}

module.exports = rotate
