const forest = require('./lib/forest')
const uint8ArrayToString = require('uint8arrays/to-string')

const receiveMsg = function(msg){
  json = JSON.parse(uint8ArrayToString(msg.data))
  console.log(msg.from, "republished", json.name, "... seeding")

  const {name, version} = forest.splitKey(json.name)

  // TODO fallback to http if download from IPFS fails or times out
  forest.downloadPackageFromIPFS(name, version, json.cid)
  // forest.addUrltoIPFS(json.name, json.url)
}

forest.subscribePackageAnnoucements(receiveMsg)
