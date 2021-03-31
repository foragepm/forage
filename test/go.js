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

    var cid = await forest.go.importPackage(db, manager, name, version, url)

    assert.equal(cid, 'bafybgqde7kfgk4ub2rcr3nyukuy3q5b35nb4bxwvgwlg42uu7cyqv2ihryzurlwt2ozhyly3auysnl4idwnt5ii3jzgul7vb5756nzxuqg2c6');
  });
})
