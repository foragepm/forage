const forage = require('../lib/forage');
const createServer = require('../lib/server');

exports.mochaHooks = {
  beforeAll: async function(){
    db = forage.connectDB('forage-test')
    ipfsID = await forage.connectIPFS(db)
    server = createServer(db)
    server.listen(8006)

    const log = require('electron-log');
    log.transports.console.level = false;
  },
  afterAll: async function(){
    server.close();
    await db.clear()
    await db.close()
  }
};
