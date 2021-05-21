var assert = require('assert');
const forage = require('../lib/forage');
const signing = require('../lib/signing')
const uint8ArrayFromString = require('uint8arrays/from-string')

describe('seed', async function() {
  it('should seed a republish pubsub message', async () => {

    var cid = 'bafybgqde7kfgk4ub2rcr3nyukuy3q5b35nb4bxwvgwlg42uu7cyqv2ihryzurlwt2ozhyly3auysnl4idwnt5ii3jzgul7vb5756nzxuqg2c6'

    var json = {
      action: 'have',
      forage: forage.core.forageVersion(),
      package: {
        url: "https://registry.npmjs.org/7zip-bin/-/7zip-bin-5.0.3.tgz",
        manager: 'npm',
        name: '7zip-bin',
        version: '5.0.3',
        cid: cid
      }
    }

    var msg = {
      from: 'somepeerid',
      data: uint8ArrayFromString(JSON.stringify(json))
    }

    var res = await forage.seed(msg)
    assert.equal(res, cid)
  })

  it('should skip a non-republish pubsub message', async () => {
    var json = {
      action: 'want',
      forage: forage.core.forageVersion(),
      package: {
        url: "https://registry.npmjs.org/7zip-bin/-/7zip-bin-5.0.3.tgz",
        manager: 'npm',
        name: '7zip-bin',
        version: '5.0.3'
      }
    }

    var msg = {
      from: 'somepeerid',
      data: uint8ArrayFromString(JSON.stringify(json))
    }

    var res = await forage.seed(msg)
    assert.equal(res, false)
  })

  it('should skip a pubsub messages from itself', async () => {
    var json = {
      action: 'have',
      forage: forage.core.forageVersion(),
      package: {
        url: "https://registry.npmjs.org/7zip-bin/-/7zip-bin-5.0.3.tgz",
        manager: 'npm',
        name: '7zip-bin',
        version: '5.0.3',
        cid: 'bafffy'
      }
    }

    var msg = {
      from: ipfsID.id,
      data: uint8ArrayFromString(JSON.stringify(json))
    }

    var res = await forage.seed(msg)
    assert.equal(res, false)
  })
})

describe('packageAsJson', async () => {
  it('should return a go package as json', async () => {
    var res = await forage.packageAsJson('go', 'github.com/stretchr/testify')
    assert.equal(res.manager, 'go')
    assert.equal(res.name, 'github.com/stretchr/testify')
    assert.equal(res.registry, 'https://proxy.golang.org/')
    assert.equal(Object.keys(res.versions).length, 14)
  })

  it('should return a npm package as json', async () => {
    var res = await forage.packageAsJson('npm', '7zip-bin')
    assert.equal(res.manager, 'npm')
    assert.equal(res.name, '7zip-bin')
    assert.equal(res.registry, 'https://registry.npmjs.org/')
    assert.equal(Object.keys(res.versions).length, 44)
  })
})

describe('announceHave', async () => {
  it('should do a thing', async () => {
    var manager = 'npm'
    var name = '7zip-bin'
    var res = await forage.announceHave(manager, name)

    assert.equal(res.action, 'have')
    assert.equal(res.metadata.signatures.length, 1)
  })
})

describe('defaultAnnounceCb', async () => {
  it('should verify and trust msgs signed by itself', async () => {
    var manager = 'npm'
    var name = '7zip-bin'

    var payload = await forage.packageAsJson(manager, name)

    var signature = await signing.signWithPrivateKey(db, JSON.stringify(payload))

    var json = {
      action: 'have',
      forage: forage.core.forageVersion(),
      metadata: signature,
      package: {
        url: "https://registry.npmjs.org/7zip-bin/-/7zip-bin-5.0.3.tgz",
        manager: 'npm',
        name: '7zip-bin',
        version: '5.0.3',
        cid: 'bafffy'
      }
    }

    var msg = {
      from: 'somepeerid',
      data: uint8ArrayFromString(JSON.stringify(json))
    }

    var res = await forage.defaultAnnounceCb(msg)
    assert.equal(res, 'have')
  })
})
