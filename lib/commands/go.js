// forest go
// experimental go proxy server

const goServer = require('../go');
const forest = require('../forest');

(async () => {
  forest.connectDB()
  var ipfsID = await forest.connectIPFS();
  if(ipfsID){
    goServer.listen(8006)
  }
})()
