// forest daemon
// start the http server and proxy

const server = require('../server');
const forest = require('../forest');

(async () => {
  var ipfsID = await forest.connectIPFS();
  if(ipfsID){
    server.listen(8005)
    forest.subscribePackageAnnoucements()
  }
})()
