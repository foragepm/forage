// forage config
// remove config in package managers to stop using forage

const forage = require('../forage');

async function unconfig(argv) {
  await forage.unsetConfig()
  console.log('Removed forage config')
}

module.exports = unconfig
