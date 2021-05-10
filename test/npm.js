var assert = require('assert');
const npm = require('../lib/managers/npm');

let chai = require('chai');
let chaiHttp = require('chai-http');
let should = chai.should();
chai.use(chaiHttp);

describe('importLatest', async () => {
  it('should import latest version of a package', async () => {
    var name = '@babel/code-frame'
    var res = await npm.importLatest(db, name)
    assert.equal(res.version, '7.12.13');
    assert.equal(res.cid, 'bafkrgqa5lvbjwrbxm25eer655wiwhgek4yeibpczlwivkg3fmav6gak2guvgko5ho3vfw7y5tjo2vv53bzfkhfumoi5utanuvtrpkbqffzx6u');
  })
})

describe('importPackage', async function() {
  it('should import npm packages larger than 1mb', async () => {
    var name = '7zip-bin'
    var version = '5.0.3'
    var url = "https://registry.npmjs.org/7zip-bin/-/7zip-bin-5.0.3.tgz"

    var cid = await npm.importPackage(db, name, version, url)

    assert.equal(cid, 'bafybgqde7kfgk4ub2rcr3nyukuy3q5b35nb4bxwvgwlg42uu7cyqv2ihryzurlwt2ozhyly3auysnl4idwnt5ii3jzgul7vb5756nzxuqg2c6');
  });

  it('should import npm packages smaller than 1mb', async () => {
    var name = '@babel/code-frame'
    var version = '7.8.3'
    var url = 'https://registry.npmjs.org/@babel/code-frame/-/code-frame-7.8.3.tgz'

    var cid = await npm.importPackage(db, name, version, url)

    assert.equal(cid, 'bafkrgqdl3ay2mz2xwwiqrhsasioueqzmozkqmbxviewshbwlhbyph7o4iw53h24c4w4kiej5vxaec5zjl652ynxfexey3pjupnkjpi5j3wbnu');
  });
})

describe('getLatestVersion', async function() {
  it('should do the thing', async () => {
    var change = {time:
      {modified:"2019-03-06T15:06:44.330Z",
      created:"2012-02-24T18:04:05.588Z",
      "0.1.0":"2012-02-24T18:04:06.916Z",
      "0.1.1":"2012-12-09T05:11:27.662Z",
      "0.1.2":"2014-07-15T21:24:45.597Z",
      "1.0.0":"2014-10-11T07:22:23.512Z",
      "1.1.0":"2015-02-23T09:52:54.646Z",
      "1.1.1":"2016-04-14T21:55:22.812Z",
      "2.0.1":"2019-03-06T15:06:40.387Z"}
    }
    var res = await npm.getLatestVersion(change)
    assert.equal(res, '2.0.1')
  })
})

describe('verify', async function() {
  it('should do the thing', async () => {
    var name = '@babel/code-frame'
    var version = '7.8.3'
    var cid = 'bafkrgqdl3ay2mz2xwwiqrhsasioueqzmozkqmbxviewshbwlhbyph7o4iw53h24c4w4kiej5vxaec5zjl652ynxfexey3pjupnkjpi5j3wbnu'
    var res = await npm.verify(db, name, version, cid)
    assert.equal(res, true)
  })
})

describe('serverHandler', async function() {
  it('respond to tarball requests', (done) => {
    var name = '@babel/code-frame'
    var version = '7.8.3'
    var path = `/${name}/-/code-frame-${version}.tgz`
    chai.request(server)
            .get(path)
            .set('user-agent', 'npm')
            .end((err, res) => {
                  chai.expect(err).to.not.exist;
                  res.should.have.status(200);
                  done()
                })
  })

  it('respond to metadata requests', (done) => {
    var name = '@babel/code-frame'
    var path = `/${name}`
    chai.request(server)
            .get(path)
            .set('user-agent', 'npm')
            .end((err, res) => {
                  chai.expect(err).to.not.exist;
                  res.should.have.status(200);
                  done()
                })
  })
})

describe('updatePackage', async function() {
  it('should do the thing', async () => {
    var name = 'base62'
    var res = await npm.updatePackage(db, name)
    assert.equal(res, true)
  })
})

describe('versionAsJson', async function() {
  it('should return a json representation of a version', async () => {
    var name = 'base62'
    var version = '2.0.1'
    var json = await npm.versionAsJson(db, name, version)

    assert.deepEqual(json, {
      manager: 'npm',
      registry: 'https://registry.npmjs.org/',
      name: 'base62',
      number: '2.0.1',
      url: "https://registry.npmjs.org/base62/-/base62-2.0.1.tgz",
      integrity: 'sha512-4t4WQK7mdbcWzqEBiq6tfo2qDCeIZGXvjifJZyxHIVcjQkZJxpFtu/pa2Va69OouCkg6izZ08hKnPxroeDyzew==',
      cid: 'bafkrgqhc3yleblxgow3rntvbagfk5ll6rwvayj4imrs67drhzftsyrzbk4ruersjy2iw3o72llmvnoxu5ixausb2rm3hj4qsu47rv2dyhszxw',
      responses: {}
    })
  })
})

describe('packageAsJson', async function() {
  it('should return a json representation of a package', async () => {
    var name = 'base62'
    var json = await npm.packageAsJson(db, name)

    assert.deepEqual(json, {
        "manager": "npm",
        "registry": "https://registry.npmjs.org/",
        "name": "base62",
        "versions": {
            "0.1.0": {
                "manager": "npm",
                "registry": "https://registry.npmjs.org/",
                "name": "base62",
                "number": "0.1.0",
                "url": "https://registry.npmjs.org/base62/-/base62-0.1.0.tgz",
                "integrity": "sha1-A7i95xR38JXf80VczV+OD9a/kfo=",
                "cid": null,
                "responses": {}
            },
            "0.1.1": {
                "manager": "npm",
                "registry": "https://registry.npmjs.org/",
                "name": "base62",
                "number": "0.1.1",
                "url": "https://registry.npmjs.org/base62/-/base62-0.1.1.tgz",
                "integrity": "sha1-e0F0wvlESXU7EcJlHAg9qEGnsIQ=",
                "cid": null,
                "responses": {}
            },
            "0.1.2": {
                "manager": "npm",
                "registry": "https://registry.npmjs.org/",
                "name": "base62",
                "number": "0.1.2",
                "url": "https://registry.npmjs.org/base62/-/base62-0.1.2.tgz",
                "integrity": "sha1-bw0bcdfLwYI0+m+GkowI05I/VHs=",
                "cid": null,
                "responses": {}
            },
            "1.0.0": {
                "manager": "npm",
                "registry": "https://registry.npmjs.org/",
                "name": "base62",
                "number": "1.0.0",
                "url": "https://registry.npmjs.org/base62/-/base62-1.0.0.tgz",
                "integrity": "sha1-R+JeQOhBWXh3gHo6RZprHz+KiKE=",
                "cid": null,
                "responses": {}
            },
            "1.1.0": {
                "manager": "npm",
                "registry": "https://registry.npmjs.org/",
                "name": "base62",
                "number": "1.1.0",
                "url": "https://registry.npmjs.org/base62/-/base62-1.1.0.tgz",
                "integrity": "sha1-RlnehmVYkG1D/sYeB6vUOX2nTBk=",
                "cid": null,
                "responses": {}
            },
            "1.1.1": {
                "manager": "npm",
                "registry": "https://registry.npmjs.org/",
                "name": "base62",
                "number": "1.1.1",
                "url": "https://registry.npmjs.org/base62/-/base62-1.1.1.tgz",
                "integrity": "sha1-l06CwRvV4AgWtQin7Zx7kIbJ22s=",
                "cid": null,
                "responses": {}
            },
            "1.1.2": {
                "manager": "npm",
                "registry": "https://registry.npmjs.org/",
                "name": "base62",
                "number": "1.1.2",
                "url": "https://registry.npmjs.org/base62/-/base62-1.1.2.tgz",
                "integrity": "sha1-Is7WpJkTVlvAuNmhFWOkZcCEEkw=",
                "cid": null,
                "responses": {}
            },
            "1.2.0": {
                "manager": "npm",
                "registry": "https://registry.npmjs.org/",
                "name": "base62",
                "number": "1.2.0",
                "url": "https://registry.npmjs.org/base62/-/base62-1.2.0.tgz",
                "integrity": "sha1-MeflYNyEbJ9EwaUx32UU2jVHQVc=",
                "cid": null,
                "responses": {}
            },
            "1.2.1": {
                "manager": "npm",
                "registry": "https://registry.npmjs.org/",
                "name": "base62",
                "number": "1.2.1",
                "url": "https://registry.npmjs.org/base62/-/base62-1.2.1.tgz",
                "integrity": "sha512-xVtfFHNPUzpCNHygpXFGMlDk3saxXLQcOOQzAAk6ibvlAHgT6WKXLv9rMFhcyEK1n9LuDmp/LxyGW/Fm9L8++g==",
                "cid": null,
                "responses": {}
            },
            "1.2.4": {
                "manager": "npm",
                "registry": "https://registry.npmjs.org/",
                "name": "base62",
                "number": "1.2.4",
                "url": "https://registry.npmjs.org/base62/-/base62-1.2.4.tgz",
                "integrity": "sha512-O4pCb20Z0YXcVWCQbna/q6P9Dq86OOCfXRveyL7ECiKKvProrPUIt4aXG6SUzdsbJa69WGKKzFEotTLaum7nbg==",
                "cid": null,
                "responses": {}
            },
            "1.2.5": {
                "manager": "npm",
                "registry": "https://registry.npmjs.org/",
                "name": "base62",
                "number": "1.2.5",
                "url": "https://registry.npmjs.org/base62/-/base62-1.2.5.tgz",
                "integrity": "sha512-Dq8/KtIxvQmU0Wml7DFNx/04f0g3wtFaKmUwhDjdKUSuHkftP4PWZo5WdWpVgIPjZsfZwtDGQ24m52koq8dtjA==",
                "cid": null,
                "responses": {}
            },
            "1.2.6": {
                "manager": "npm",
                "registry": "https://registry.npmjs.org/",
                "name": "base62",
                "number": "1.2.6",
                "url": "https://registry.npmjs.org/base62/-/base62-1.2.6.tgz",
                "integrity": "sha512-HxRh87vRHaLnPkeNMsj3x4qbil8Hm0sG6h2PCeDOT0+5cmEX59z1Eu9WyzE9dOplH91QQl09Ram/f+cygm8mSA==",
                "cid": null,
                "responses": {}
            },
            "1.2.7": {
                "manager": "npm",
                "registry": "https://registry.npmjs.org/",
                "name": "base62",
                "number": "1.2.7",
                "url": "https://registry.npmjs.org/base62/-/base62-1.2.7.tgz",
                "integrity": "sha512-ck0nDbXLEq2nD5jIcEzdpk07sYQ5P6z4NMTIgeQCFr5CCRZzmgUPlOes4o0k5pvEUQJnKO/D079ybzjpjIKf2Q==",
                "cid": null,
                "responses": {}
            },
            "1.2.8": {
                "manager": "npm",
                "registry": "https://registry.npmjs.org/",
                "name": "base62",
                "number": "1.2.8",
                "url": "https://registry.npmjs.org/base62/-/base62-1.2.8.tgz",
                "integrity": "sha512-V6YHUbjLxN1ymqNLb1DPHoU1CpfdL7d2YTIp5W3U4hhoG4hhxNmsFDs66M9EXxBiSEke5Bt5dwdfMwwZF70iLA==",
                "cid": null,
                "responses": {}
            },
            "2.0.0": {
                "manager": "npm",
                "registry": "https://registry.npmjs.org/",
                "name": "base62",
                "number": "2.0.0",
                "url": "https://registry.npmjs.org/base62/-/base62-2.0.0.tgz",
                "integrity": "sha512-s3DXUcvJVW9vd9L/iahft3cxsrBQsXfG0ktX/uzkKOO7ZHHE8Lw3mP+rSXb7YzVavX+fB1jX1GFHDfI/NX8/SQ==",
                "cid": null,
                "responses": {}
            },
            "2.0.1": {
                "manager": "npm",
                "registry": "https://registry.npmjs.org/",
                "name": "base62",
                "number": "2.0.1",
                "url": "https://registry.npmjs.org/base62/-/base62-2.0.1.tgz",
                "integrity": "sha512-4t4WQK7mdbcWzqEBiq6tfo2qDCeIZGXvjifJZyxHIVcjQkZJxpFtu/pa2Va69OouCkg6izZ08hKnPxroeDyzew==",
                "cid": "bafkrgqhc3yleblxgow3rntvbagfk5ll6rwvayj4imrs67drhzftsyrzbk4ruersjy2iw3o72llmvnoxu5ixausb2rm3hj4qsu47rv2dyhszxw",
                "responses": {}
            }
        },
        "responses": {
            "versions": {
                "url": "https://registry.npmjs.org/base62",
                "body": "bafkreihemsz2zf3gkfkz3yigbj4b7pryc4nl7e4ekygdtoyzqpotvrwmbe"
            }
        }
    })
  })
})
