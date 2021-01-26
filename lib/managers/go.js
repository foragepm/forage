// returnTarballEarly

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

module.exports = {
  parseName,
  parseVersion,
  returnTarballEarly
}
