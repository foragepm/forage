// forage reset
// Empty the forage database

const forage = require('../forage');

(async () => {
  await forage.reset()
  console.log('Forage has been reset')
})()
