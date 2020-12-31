const forest = require('./forest')
const uint8ArrayToString = require('uint8arrays/to-string')

const receiveMsg = function(msg){
  json = JSON.parse(uint8ArrayToString(msg.data))
  console.log(msg.from, "republished", json.name, "... seeding")
  // TODO attempt to load (and verify) from ipfs before downloading via http
  forest.addUrltoIPFS(json.name, json.url)
}

forest.subscribePackageAnnoucements(receiveMsg)
