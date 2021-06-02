// forage reset
// Empty the forage database

const forage = require('../forage');

async function reset(argv) {
  await forage.reset()
  console.log('Forage has been reset')
}

module.exports = reset
