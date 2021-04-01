const forest = require('../lib/forest');

exports.mochaHooks = {
  beforeAll: async function(){
    db = forest.connectDB()
    await forest.connectIPFS(db)
  }
};
