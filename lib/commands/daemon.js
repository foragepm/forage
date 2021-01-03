// forest daemon
// run the proxy server

const proxy = require('../proxy')
const forest = require('../forest')

proxy.listen(8005)
forest.subscribePackageAnnoucements()
