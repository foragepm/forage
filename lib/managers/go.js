const fetch = require('node-fetch')

function parseName(path) {
  return path.match(/\/(.+)\/@/)[1]
}

function parseVersion(path) {
  v = path.match(/@v\/(.+)/)[1]
  return v.replace('.info', '').replace('.mod', '').replace('.zip', '')
}

async function returnTarballEarly(name, version) {
  try {
    var cid = await db.get(`cid:go:${name}:${version}`)
  } catch (e) {
    var cid = false
  }

  if (name != null && cid != undefined) {
    return {name: name, cid: cid}
  } else {
    return false
  }
}

async function fetchChecksum(name, version) {
  try{
    var res = await fetch(`https://sum.golang.org/lookup/${name}@${version}`)
    var body = await res.text()
    return body.split("\n")[1].split(' ')[2].split(':')[1]
  } catch(e){
    console.error('Failed to download checksum for', name, version)
    console.error(e)
    return false
  }
}

module.exports = {
  parseName,
  parseVersion,
  returnTarballEarly,
  fetchChecksum
}
