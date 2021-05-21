// forage trust publickey
// trust a public key

const forage = require('../forage');

async function trust(argv) {
  var db = forage.connectDB()

  var publickey = argv.publickey
  var json = forage.signing.decode(publickey)
  var key = await forage.signing.parseKey(json)

  await forage.signing.savePublicKey(db, key)

  console.log('Public key trusted')

  await db.close()
  process.exit(0)
}

module.exports = trust
