// forest reset
// Empty the forest database

const forest = require('../forest');

(async () => {
  forest.connectDB()
  await forest.reset()
  await forest.closeDB()
  console.log('Forest has been reset')
})()
