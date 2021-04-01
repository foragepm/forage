var assert = require('assert');
const forest = require('../lib/forest');

describe('importPackage', async function() {
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
  it('should do the thing', async () => {

  })
})

describe('fetchVersionsList', async function() {
  it('should do the thing', async () => {

  })
})

describe('checkPackages', async function() {
  it('should do the thing', async () => {

  })
})

describe('setupWatcher', async function() {
  it('should do the thing', async () => {

  })
})

describe('watchImporter', async function() {
  it('should do the thing', async () => {

  })
})

describe('serverHandler', async function() {
  it('should do the thing', async () => {

  })
})

describe('getLatestVersion', async function() {
  it('should do the thing', async () => {

  })
})
