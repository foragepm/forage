// forest config
// set config in package managers to use forest

const forest = require('../forest');

forest.npm.setConfig()
console.log('Updated .npmrc with forest config')
