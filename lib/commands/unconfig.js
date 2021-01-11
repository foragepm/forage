// forest config
// remove config in package managers to stop using forest

const forest = require('../forest');

forest.removeConfig()
console.log('Updated .npmrc removing forest config')
