var assert = require('assert');
const forage = require('../lib/forage');
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
