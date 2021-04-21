const forest = require('../lib/forest');
const createServer = require('../lib/server');

exports.mochaHooks = {
  beforeAll: async function(){
    db = forest.connectDB('forest-test')
    await forest.connectIPFS(db)
    server = await createServer(db)
    server.listen(8006)
  },
  afterAll: async function(){
    server.close();
    await db.clear()
    await db.close()
  }
};
