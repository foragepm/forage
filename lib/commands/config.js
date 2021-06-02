// forage config
// set config in package managers to use forage

const forage = require('../forage');

async function config(argv) {
  forage.setConfig(argv.port)
  console.log('Set forage configs')
}

module.exports = config
