const jose = require('node-jose');

async function createPrivateKey() {
  var keystore = await jose.JWK.createKeyStore()
  return await keystore.generate("EC", "P-256")
}

async function savePrivateKey(db, key) {
  return await saveKey(db, 'keys:private', key, true)
}

async function savePublicKey(db, key) {
  return await saveKey(db, `keys:public:${key.kid}`, key, false)
}

async function fetchPublicKey(db, kid) {
  try{
    var json = await db.get(`keys:public:${kid}`)
    return await jose.JWK.asKey(JSON.parse(json))
  } catch(e) {
    return false
  }
}

async function listPublicKeys(db) {
  var ids = new Promise((resolve, reject) => {
    key = 'keys:public:'
    var ids = []
    db.createKeyStream({gte: key, lt: key+'~'})
      .on('data', function (data) {
        var parts = data.split(':')
        ids.push(parts[2])
      })
      .on('end', function () {
        resolve(ids)
      })
  })
  return ids
}

async function publicKeyKnown(db, kid) {
  var list = await listPublicKeys(db)
  return list.indexOf(kid) > -1
}

async function removePublicKey(db, kid) {
  return await db.del(`keys:public:${kid}`)
}

async function saveKey(db, name, key, private = false) {
  return await db.put(name, JSON.stringify(key.toJSON(private)))
}

async function initPrivateKey(db){
  var key = await createPrivateKey()
  await savePrivateKey(db, key)
  return key
}

async function loadPrivateKey(db) {
  try{
    var json = await db.get('keys:private')
    return await jose.JWK.asKey(JSON.parse(json))
  } catch(e) {
    return false
  }
}

async function fetchPrivateKey(db){
  var key = await loadPrivateKey(db)
  if(key){
    return key
  } else {
    return await initPrivateKey(db)
  }
}

async function signWithPrivateKey(db, cid) {
  var key = await fetchPrivateKey(db)
  return await sign(key, cid)
}

async function sign(key, cid) {
  var input = Buffer.from(cid)
  return await jose.JWS.createSign(key).update(input).final()
}

async function verify(signature, key){
  try{
    return await jose.JWS.createVerify(key).verify(signature)
  } catch(e){
    return false
  }
}

async function keystore(db) {
  var keystore = await jose.JWK.createKeyStore()

  var key = await fetchPrivateKey(db)
  await keystore.add(key.toJSON(), 'json')

  var publicKeys = await listPublicKeys(db)

  for (const id of publicKeys) {
    var key = await db.get(`keys:public:${id}`)
    await keystore.add(key, 'json')
  }

  return keystore
}

async function trusted(db, signature){
  var keys = await keystore(db)
  return await verify(signature, keys)
}

function parseJsonPayload(string) {
  return JSON.parse(jose.util.base64url.decode(string).toString('utf8'))
}

module.exports = {
  fetchPrivateKey,
  savePublicKey,
  fetchPublicKey,
  removePublicKey,
  listPublicKeys,
  publicKeyKnown,
  sign,
  signWithPrivateKey,
  verify,
  trusted,
  parseJsonPayload
}
