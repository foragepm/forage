const forest = require('./forest')
const uint8ArrayToString = require('uint8arrays/to-string')

const receiveMsg = function(msg){
  json = JSON.parse(uint8ArrayToString(msg.data))
  console.log(msg.from, "republished", json.name, "... seeding")

  parts = json.name.split('@')
  if (json.name.startsWith('@')) {
    name = '@'+parts[1]
    version = parts[2]
  } else {
    name = parts[0]
    version = parts[1]
  }

  // TODO fallback to http if download from IPFS fails or times out
  forest.downloadPackageFromIPFS(name, version, json.cid)
  // forest.addUrltoIPFS(json.name, json.url)
}

forest.subscribePackageAnnoucements(receiveMsg)
