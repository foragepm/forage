var assert = require('assert');
const forage = require('../lib/forage');
const signing = require('../lib/signing')
const uint8ArrayFromString = require('uint8arrays/from-string')

describe('forage', async function() {
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
    it('should send have pubsub message', async () => {
      var manager = 'npm'
      var name = '7zip-bin'
      var version = '5.1.1'
      var cid = 'bafybgqead4fgscx3ok377pgj32iaaixwoslj7m6o6db4wy7howckfgybzazezfuxsfiwgfvlghssj426joxg535d7pdltgg6r3kudlnithvji'
      var res = await forage.announceHave(manager, name, version, cid)

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

      var res = await forage.defaultAnnounceCb(msg)
      assert.equal(res, false)
    })
  })

  describe('downloadVersion', async () => {
    it('should download a specific version of a package', async () => {
      var manager = 'npm'
      var name = '7zip-bin'
      var version = '5.1.1'
      var cid = 'bafybgqead4fgscx3ok377pgj32iaaixwoslj7m6o6db4wy7howckfgybzazezfuxsfiwgfvlghssj426joxg535d7pdltgg6r3kudlnithvji'
      var res = await forage.downloadVersion(manager, name, version)

      assert.equal(res, cid)
    })
  })
})
