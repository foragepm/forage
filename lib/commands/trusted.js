// forage trusted
// list trusted public keys

const forage = require('../forage');

async function trust(argv) {
  var db = forage.connectDB()
  var keys = await forage.signing.listPublicKeys(db)

  keys.forEach((key, i) => {
    console.log(forage.signing.encode(JSON.parse(key.value)))
  });

  await db.close()
  process.exit(0)
}

module.exports = trust
