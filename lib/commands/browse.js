async function browse(argv) {
  require('open')(`http://localhost:${argv.port}`)
}

module.exports = browse
