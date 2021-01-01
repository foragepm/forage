const proxy = require('./proxy')
const forest = require('./lib/forest')

proxy.listen(8005)
forest.subscribePackageAnnoucements()
