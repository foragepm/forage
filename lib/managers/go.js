const fetch = require('node-fetch')
const fs = require('fs')
const path = require('path')

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

function parseGoSum(filepath) {
  var gosum = fs.readFileSync(path.resolve(filepath), 'utf8').split("\n")

  var lines = []

  gosum.forEach(function(str) {
    if(str.length > 0){
      var parts = str.split(' ')
      var name = parts[0].toLowerCase() // TODO proper %21 replace
      var version = parts[1].split('/')[0].toLowerCase() // TODO proper %21 replace

      lines.push(`${name}:${version}`)
    }
  })

  var uniqueLines = [...new Set(lines)]
  var pkgs = []

  uniqueLines.forEach(function(str) {
    var parts = str.split(':')
    var name = parts[0]
    var version = parts[1]

    var pkg = {
      manager: 'go',
      name: name,
      version: version,
      resolved: `https://proxy.golang.org/${name}/@v/${version}.zip`
    }
    pkgs.push(pkg)
  })

  return pkgs
}

module.exports = {
  parseName,
  parseVersion,
  returnTarballEarly,
  fetchChecksum,
  parseGoSum
}
