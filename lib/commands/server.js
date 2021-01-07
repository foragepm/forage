// forest daemon
// start the http server and proxy

const server = require('../server');
const forest = require('../forest');

(async () => {
  await forest.connectIPFS();
  server.listen(8005)
  forest.subscribePackageAnnoucements()
})()
