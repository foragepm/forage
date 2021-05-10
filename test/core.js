var assert = require('assert');
const core = require('../lib/core');

describe('guessCID', async function() {
  it('should return a cid for a sha2-256', async () => {
    var integrity = 'sha256-hDPOHmpOpP40lSULcqw7IrRb/u7w6RpDC9399XyoNd0='
    var cid = core.guessCID(integrity)
    assert.equal(cid, 'bafkreieegphb42sout7djfjfbnzkyozcwrn753xq5enegc657x2xzkbv3u')
  })

  it('should return a cid for a sha2-512', async () => {
    var integrity = 'sha512-a9gxpmdXtZEInkCSHUJDLHZVBgb1QS0jhss4cPP93EW7s+uC5bikET2twEF3KV+7rDblJcmNvTR7VJejqd2C2g=='
    var cid = core.guessCID(integrity)
    assert.equal(cid, 'bafkrgqdl3ay2mz2xwwiqrhsasioueqzmozkqmbxviewshbwlhbyph7o4iw53h24c4w4kiej5vxaec5zjl652ynxfexey3pjupnkjpi5j3wbnu')
  })
})

describe('writeResponse', async function() {
  it('download and save response to ipfs and cid to db', async () => {
    key = "response:go:versions:github.com/mr-tron/base58"
    var url = 'https://proxy.golang.org/github.com/mr-tron/base58/@v/list'
    var cid = await core.writeResponse(db, key, url)
    assert.equal(cid, 'bafkreia6szlojrud3zbjdiekcycnm7ofyb4rzwikdjjilotbgddpv7cefu')
    var record = await db.get(key)
    assert.equal(cid, record)
  })

  it('not response to ipfs and cid to db', async () => {
    key = "response:go:versions:github.com/mr-tron/base58"
    var url = 'https://proxy.golang.org/github.com/mr-tron/base58/@v/bloop'
    var cid = await core.writeResponse(db, key, url)
    assert.equal(cid, false)
  })
})

describe('getResponse', async function() {
  it('return a response cached in ipfs by cid', async () => {
    key = "response:go:versions:github.com/mr-tron/base58"
    var url = 'https://proxy.golang.org/github.com/mr-tron/base58/@v/list'
    var cid = await core.writeResponse(db, key, url)

    var body = await core.getResponse(db, key)
    assert.equal(body, 'v1.0.0\nv1.1.1\nv1.1.3\nv1.1.2\nv1.2.0\nv1.1.0\n')
  })

  it('return nothing from an uncached response', async () => {
    key = "response:go:versions:bloop"
    var body = await core.getResponse(db, key)
    assert.equal(body, false)
  })
})

describe('fetchResponse', async function() {
  it('download, cache and return a response by key+url', async () => {
    key = "response:go:versions:github.com/mr-tron/base58"
    var url = 'https://proxy.golang.org/github.com/mr-tron/base58/@v/list'
    var body = await core.fetchResponse(db, key, url)
    assert.equal(body, 'v1.0.0\nv1.1.1\nv1.1.3\nv1.1.2\nv1.2.0\nv1.1.0\n')
  })

  it('return nothing from a broken url', async () => {
    key = "response:go:versions:blorg"
    var url = 'https://proxy.golang.org/github.com/mr-tron/base58/@v/blorg'
    var body = await core.fetchResponse(db, key, url)
    assert.equal(body, false)
  })
})
