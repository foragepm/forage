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

  var pkgs = []

  gosum.forEach(function(str) {
    if(str.length > 0){
      var parts = str.split(' ')

      // only return the final versions used, not all modules considered in resolution
      if(!parts[1].match(/\/go.mod$/)){

        var name = escape(parts[0])
        var version = escape(parts[1].split('/')[0])
        var integrity = parts[2]

        var pkg = {
          manager: 'go',
          name: name,
          version: version,
          resolved: `https://proxy.golang.org/${name}/@v/${version}.zip`,
          integrity: integrity
        }
        
        pkgs.push(pkg)
      }
    }
  })

  return pkgs
}

function escape(string) {
  // replace upper case letters with %21${lowercase}
  return string.replace(/[A-Z]/g, function(match, offset, string) {
    return '!' + match.toLowerCase();
  })
}

function unescape(string) {
  // replace %21${lowercase} letters with upper case
  return string.replace(/!(.)/g, function(match, p1, offset, string) {
    return p1.toUpperCase();
  })
}

module.exports = {
  parseName,
  parseVersion,
  returnTarballEarly,
  fetchChecksum,
  parseGoSum,
  escape,
  unescape
}
