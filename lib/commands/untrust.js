// forage untrust publickey
// stop trusting a public key

const forage = require('../forage');

async function untrust(argv) {
  var db = forage.connectDB()

  var publickey = argv.publickey
  var json = forage.signing.decode(publickey)

  await forage.signing.removePublicKey(db, json.kid)

  console.log('Public key untrusted')

  await db.close()
  process.exit(0)
}

module.exports = untrust
