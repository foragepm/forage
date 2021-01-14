// forest reset
// Empty the forest database

const forest = require('../forest');

(async () => {
  await forest.reset()
  console.log('Forest has been reset')
})()
