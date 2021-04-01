var assert = require('assert');
const forest = require('../lib/forest');

describe('importPackage', async function() {
  it('should import npm packages larger than 1mb', async () => {
    var manager = 'npm'
    var name = '7zip-bin'
    var version = '5.0.3'
    var url = "https://registry.npmjs.org/7zip-bin/-/7zip-bin-5.0.3.tgz"

    var cid = await forest.npm.importPackage(db, manager, name, version, url)

    assert.equal(cid, 'bafybgqde7kfgk4ub2rcr3nyukuy3q5b35nb4bxwvgwlg42uu7cyqv2ihryzurlwt2ozhyly3auysnl4idwnt5ii3jzgul7vb5756nzxuqg2c6');
  });

  it('should import npm packages smaller than 1mb', async () => {
    var manager = 'npm'
    var name = '@babel/code-frame'
    var version = '7.8.3'
    var url = 'https://registry.npmjs.org/@babel/code-frame/-/code-frame-7.8.3.tgz'

    var cid = await forest.npm.importPackage(db, manager, name, version, url)

    assert.equal(cid, 'bafkrgqdl3ay2mz2xwwiqrhsasioueqzmozkqmbxviewshbwlhbyph7o4iw53h24c4w4kiej5vxaec5zjl652ynxfexey3pjupnkjpi5j3wbnu');
  });
})
