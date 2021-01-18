// forest packages
// List all packages republished in IPFS

const forest = require('../forest');

var total = 0

forest.filteredReadStream('size:').on('data', function (data) {
  console.log(data)
  total += parseInt(data.value)
}).on('end', function () {
  console.log(total)
  forest.closeDB()
})
