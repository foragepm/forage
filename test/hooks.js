const forest = require('../lib/forest');
const createServer = require('../lib/server');

exports.mochaHooks = {
  beforeAll: async function(){
    db = forest.connectDB()
    await forest.connectIPFS(db)
    server = await createServer(db)
    server.listen(8005)
  }
};
