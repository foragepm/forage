// forest config
// remove config in package managers to stop using forest

const forest = require('../forest');

forest.npm.removeConfig()
console.log('Updated .npmrc removing forest config')
