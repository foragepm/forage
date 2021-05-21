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
    return await parseKey(JSON.parse(json))
  } catch(e) {
    return false
  }
}

async function listPublicKeysIds(db) {
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

async function listPublicKeys(db) {
  var keys = new Promise((resolve, reject) => {
    key = 'keys:public:'
    var keys = []
    db.createReadStream({gte: key, lt: key+'~'})
      .on('data', function (data) {
        keys.push(data)
      })
      .on('end', function () {
        resolve(keys)
      })
  })
  return keys
}

async function publicKeyKnown(db, kid) {
  var list = await listPublicKeysIds(db)
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

async function parseKey(json) {
  return await jose.JWK.asKey(json)
}

async function loadPrivateKey(db) {
  try{
    var json = await db.get('keys:private')
    return await parseKey(JSON.parse(json))
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

  for (const key of publicKeys) {
    await keystore.add(key.value, 'json')
  }

  return keystore
}

async function trusted(db, signature){
  var keys = await keystore(db)
  return await verify(signature, keys)
}

function encode(object) {
  return jose.util.base64url.encode(JSON.stringify(object))
}

function decode(string) {
  return JSON.parse(jose.util.base64url.decode(string).toString('utf8'))
}

module.exports = {
  fetchPrivateKey,
  initPrivateKey,
  savePublicKey,
  fetchPublicKey,
  removePublicKey,
  listPublicKeysIds,
  listPublicKeys,
  publicKeyKnown,
  sign,
  signWithPrivateKey,
  verify,
  trusted,
  decode,
  encode,
  parseKey
}
