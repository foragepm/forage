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
