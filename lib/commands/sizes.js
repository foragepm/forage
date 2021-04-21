// forage packages
// List all packages republished in IPFS

const forage = require('../forage');

var total = 0

var db = forage.connectDB()
forage.core.filteredReadStream(db, 'size:').on('data', function (data) {
  console.log(data)
  total += parseInt(data.value)
}).on('end', function () {
  console.log(total)
  db.close()
  process.exit(0)
})
