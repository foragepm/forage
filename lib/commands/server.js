// forest daemon
// start the http server and proxy

const server = require('../server')
const forest = require('../forest')

server.listen(8005)
forest.subscribePackageAnnoucements()
