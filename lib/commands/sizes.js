// forage packages
// List sizes of all imported packages

const forage = require('../forage');

function bytesToSize(bytes) {
  var sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes == 0) return '0 Byte';
  var i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
  return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
}

async function sizes(argv) {
  var total = 0

  var db = forage.connectDB()
  forage.core.filteredReadStream(db, 'size:').on('data', function (data) {
    parts = data.key.split(':')
    console.log(parts[1], `${parts[2]}@${parts[3]}:`, bytesToSize(data.value))
    total += parseInt(data.value)
  }).on('end', async function () {

    console.log('Total:', bytesToSize(total))
    await db.close()
    process.exit(0)
  })
}

module.exports = sizes
