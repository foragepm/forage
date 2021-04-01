var assert = require('assert');
const forest = require('../lib/forest');
const createServer = require('../lib/server');

let chai = require('chai');
let chaiHttp = require('chai-http');
let should = chai.should();
chai.use(chaiHttp);

describe('importPackage', async () => {
  it('should import go packages', async () => {
    manager = 'go'
    name = 'github.com/stretchr/testify'
    version = 'v1.6.1'
    url = "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.6.1.zip"

    var pkg = await forest.go.importPackage(db, manager, name, version, url)

    var cid = pkg.cid.toString()

    assert.equal(cid, 'bafkreia4pesx6qj2mi77eqkfe4pommjukwf3lomgmczwnytqz6xy4gf7ae');
  });
})

describe('parseGoSum', async function() {
  it('should parse a go.sum file', async () => {
    var filepath = "./test/fixtures/go.sum"
    var pkgs = forest.go.parseGoSum(filepath)
    assert.equal(pkgs.length, 139)
    assert.deepEqual(pkgs[0], {
      manager: 'go',
      name: 'github.com/!burnt!sushi/toml',
      version: 'v0.3.1',
      resolved: 'https://proxy.golang.org/github.com/!burnt!sushi/toml/@v/v0.3.1.zip',
      integrity: 'h1:WXkYYl6Yr3qBf1K79EBnL4mak0OimBfB0XUf9Vl28OQ='
    })
  })
})

describe('escape', async function() {
  it('should replace capital letters with !lower', async () => {
    var url = 'github.com/BurntSushi/toml'
    var res = forest.go.escape(url)
    assert.equal(res, 'github.com/!burnt!sushi/toml')
  })
})

describe('verify', async function() {
  it('should download version from ipfs and verify the integrity', async () => {
    var name = 'github.com/stretchr/testify'
    var version = 'v1.6.1'
    var cid = 'bafkreia4pesx6qj2mi77eqkfe4pommjukwf3lomgmczwnytqz6xy4gf7ae'
    var res = await forest.go.verify(db, name, version, cid)
    assert.equal(res, true)
  })
})

describe('fetchVersionsList', async function() {
  it('should do the thing', async () => {
    var name = 'github.com/stretchr/testify'
    var res = await forest.go.fetchVersionsList(db, name)
    assert.equal(res, `v1.3.0
v1.7.0
v1.5.1
v1.6.0
v1.1.1
v1.5.0
v1.1.3
v1.1.2
v1.2.1
v1.4.0
v1.1.4
v1.2.0
v1.2.2
v1.6.1
`)
  })
})

describe('getLatestVersion', async function() {
  it('should fetch latest version for a module', async () => {
    var name = 'github.com/stretchr/testify'
    var res = await forest.go.getLatestVersion(db, name)
    assert.equal(res, 'v1.7.0')
  })
})

describe('serverHandler', async function() {

  let server

  before(async () => {
    server = await createServer(db)
    server.listen(8005)
  })

  it('respond to list requests', async () => {
    var name = 'github.com/stretchr/testify'
    var path = `/${name}/@v/list`

    chai.request(server)
            .get(path)
            .end((err, res) => {

                  res.should.have.status(200);
                  res.text.length.should.be.eql(98);
                  res.text.should.be.eql(`v1.3.0
v1.7.0
v1.5.1
v1.6.0
v1.1.1
v1.5.0
v1.1.3
v1.1.2
v1.2.1
v1.4.0
v1.1.4
v1.2.0
v1.2.2
v1.6.1
`);
                })
  })

  it('respond to latest requests', (done) => {
    var name = 'github.com/stretchr/testify'
    var path = `/${name}/@latest`
    chai.request(server)
            .get(path)
            .end((err, res) => {
                  chai.expect(err).to.not.exist;
                  res.should.have.status(200);
                  res.text.should.be.eql('{"Version":"v1.7.0","Time":"2021-01-13T09:54:11Z"}');
                  done()
                })
  })

  it('respond to info requests', (done) => {
    var name = 'github.com/stretchr/testify'
    var version = 'v1.7.0'
    var path = `/${name}/@v/${version}.info`
    chai.request(server)
            .get(path)
            .end((err, res) => {
                  chai.expect(err).to.not.exist;
                  res.should.have.status(200);
                  res.body.should.be.eql({"Version":"v1.7.0","Time":"2021-01-13T09:54:11Z"});
                  done()
                })
  })

  it('respond to mod requests', (done) => {
    var name = 'github.com/stretchr/testify'
    var version = 'v1.7.0'
    var path = `/${name}/@v/${version}.mod`
    chai.request(server)
            .get(path)
            .end((err, res) => {
                  chai.expect(err).to.not.exist;
                  res.should.have.status(200);
                  res.text.should.be.eql(`module github.com/stretchr/testify

go 1.13

require (
	github.com/davecgh/go-spew v1.1.0
	github.com/pmezard/go-difflib v1.0.0
	github.com/stretchr/objx v0.1.0
	gopkg.in/yaml.v3 v3.0.0-20200313102051-9f266ea9e77c
)
`);
                done()
                })
  })

  it('respond to zip requests', (done) => {
    var name = 'github.com/stretchr/testify'
    var version = 'v1.7.0'
    var path = `/${name}/@v/${version}.zip`
    chai.request(server)
            .get(path)
            .end((err, res) => {
                  chai.expect(err).to.not.exist;
                  res.should.have.status(200);
                  done()
                })
  })

  it('respond to sumdb requests', (done) => {
    var name = 'github.com/stretchr/testify'
    var version = 'v1.7.0'
    var path = `/sumdb/sum.golang.org/lookup/${name}@${version}`
    chai.request(server)
            .get(path)
            .end((err, res) => {
                  chai.expect(err).to.not.exist;
                  res.should.have.status(200);
                  res.text.length.should.be.eql(367);
                  done()
                })
  })
})
