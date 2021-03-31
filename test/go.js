var assert = require('assert');
const forest = require('../lib/forest');

describe('importPackage', async function() {

  let db

  before(async () => {
    db = forest.connectDB()
    await forest.connectIPFS(db)
  })

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
