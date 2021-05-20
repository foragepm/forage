var assert = require('assert');
const signing = require('../lib/signing');
const jose = require('node-jose');

async function createKey() {
  var keystore = await jose.JWK.createKeyStore()
  return await keystore.generate("EC", "P-256")
}

describe('fetchKey', async function() {
  it('should return a new key if none already saved', async () => {
    var key = await signing.fetchPrivateKey(db)
    assert.equal(key.length, 256)
    assert.equal(key.kty, "EC")
  })

  it('should return an existing key if already saved', async () => {
    var existingKey = await signing.fetchPrivateKey(db)
    var key = await signing.fetchPrivateKey(db)
    assert.equal(key.kid, existingKey.kid)
  })
})

describe('savePublicKey', async function() {
  it('should record a public key to the db', async () => {
    var newKey = await createKey()

    await signing.savePublicKey(db, newKey)

    var res = await db.get(`keys:public:${newKey.kid}`)
    var json = JSON.parse(res)

    assert.equal(json.kid, newKey.kid)
    assert.equal(json.d, undefined)
  })
})

describe('fetchPublicKey', async function() {
  it('should return a saved public key by its kid', async () => {
    var newKey = await createKey()

    await signing.savePublicKey(db, newKey)

    var res = await signing.fetchPublicKey(db, newKey.kid)
    assert.deepEqual(res, newKey)
  })

  it('should return false for unknown keys', async () => {
    var res = await signing.fetchPublicKey(db, '4dGlogCAUotSiJsmhrsxNJqAsrzkUMTU8f6n0-Wdy7Y')
    assert.equal(res, false)
  })
})

describe('removePublicKey', async function() {
  it('should delete a saved public key by its kid', async () => {
    var newKey = await createKey()

    await signing.savePublicKey(db, newKey)

    await signing.removePublicKey(db, newKey.kid)

    var res = await signing.fetchPublicKey(db, newKey.kid)
    assert.deepEqual(res, false)
  })

  it('should not error for unknown keys', async () => {
    var res = await signing.removePublicKey(db, '4dGlogCAUotSiJsmhrsxNJqAsrzkUMTU8f6n0-Wdy7Y')
    assert.equal(res, undefined)
  })
})

describe('listPublicKeys', async () => {
  it('should list array of trusted public key ids', async () => {
    var key1 = await createKey()

    await signing.savePublicKey(db, key1)

    var key2 = await createKey()

    await signing.savePublicKey(db, key2)

    var list = await signing.listPublicKeys(db)

    assert.notEqual(-1, list.indexOf(key1.kid))
    assert.notEqual(-1, list.indexOf(key2.kid))
  })
})

describe('publicKeyKnown', async () => {
  it('should return true if public key saved', async () => {
    var key = await createKey()

    await signing.savePublicKey(db, key)

    var res = await signing.publicKeyKnown(db, key.kid)
    assert.equal(res, true)
  })

  it('should return false if public key not saved', async () => {
    var key = await createKey()

    var res = await signing.publicKeyKnown(db, key.kid)
    assert.equal(res, false)
  })
})


describe('signWithPrivateKey', async () => {
  it('should sign a cid with the private key', async () => {
    var cid = 'bafyreiejkvsvdq4smz44yuwhfymcuvqzavveoj2at3utujwqlllspsqr6q'

    var signature = await signing.signWithPrivateKey(db, cid)

    assert.equal(signature.payload, "YmFmeXJlaWVqa3ZzdmRxNHNtejQ0eXV3aGZ5bWN1dnF6YXZ2ZW9qMmF0M3V0dWp3cWxsbHNwc3FyNnE")
    assert.equal(signature.signatures.length, 1)
  })
})

describe('sign', async () => {
  it('should sign a cid with a key', async () => {
    var cid = 'bafyreiejkvsvdq4smz44yuwhfymcuvqzavveoj2at3utujwqlllspsqr6q'

    var key = await createKey()

    var signature = await signing.sign(key, cid)

    assert.equal(signature.payload, "YmFmeXJlaWVqa3ZzdmRxNHNtejQ0eXV3aGZ5bWN1dnF6YXZ2ZW9qMmF0M3V0dWp3cWxsbHNwc3FyNnE")
    assert.equal(signature.signatures.length, 1)
  })
})

describe('verify', async () => {
  it('should verify a signature signed by private key', async () => {
    var cid = 'bafyreiejkvsvdq4smz44yuwhfymcuvqzavveoj2at3utujwqlllspsqr6q'

    var key = await signing.fetchPrivateKey(db)

    var signature = await signing.signWithPrivateKey(db, cid)

    var res = await signing.verify(signature, key)

    assert.deepEqual(res.header, {
      alg: 'ES256',
      kid: key.kid
    })
  })

  it('should not verify a signature with an incorrect key', async () => {
    var cid = 'bafyreiejkvsvdq4smz44yuwhfymcuvqzavveoj2at3utujwqlllspsqr6q'

    var wrongKey = await createKey()

    var signature = await signing.signWithPrivateKey(db, cid)

    var res = await signing.verify(signature, wrongKey)

    assert.equal(res, false)
  })
})

describe('trusted', async () => {
  it('should return true if a trusted key has signed the signature', async () => {
    var publicKey = await createKey()

    await signing.savePublicKey(db, publicKey)

    var cid = 'bafyreiejkvsvdq4smz44yuwhfymcuvqzavveoj2at3utujwqlllspsqr6q'

    var signature = await signing.sign(publicKey, cid)

    var res = await signing.trusted(db, signature)

    assert.deepEqual(res.header, {
      alg: 'ES256',
      kid: publicKey.kid
    })
  })

  it('should return true if a private key has signed the signature', async () => {
    var privateKey = await signing.fetchPrivateKey(db)

    var cid = 'bafyreiejkvsvdq4smz44yuwhfymcuvqzavveoj2at3utujwqlllspsqr6q'

    var signature = await signing.sign(privateKey, cid)

    var res = await signing.trusted(db, signature)

    assert.deepEqual(res.header, {
      alg: 'ES256',
      kid: privateKey.kid
    })
  })

  it('should return false if no trusted key has signed the signature', async () => {
    var publicKey = await createKey()

    var cid = 'bafyreiejkvsvdq4smz44yuwhfymcuvqzavveoj2at3utujwqlllspsqr6q'

    var signature = await signing.sign(publicKey, cid)

    var res = await signing.trusted(db, signature)

    assert.equal(res, false)
  })
})
