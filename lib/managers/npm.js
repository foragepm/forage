const validateNpmPackageName = require("validate-npm-package-name")

function isTarballRequest(path) {
  if (path.match('\.tgz$')) {
    parts = path.split("/")
    vparts = path.split('-')
    version = vparts[vparts.length - 1].replace('.tgz', '')
    if (parts[1].startsWith('@')) {
      // return parts[1] + '/' + parts[2] + '@' + version
      return {name: parts[1] + '/' + parts[2], version: version}
    } else {
      // return parts[1] + '@' + version
      return {name: parts[1], version: version}
    }
  } else {
    return false;
  }
}

function isMetadataRequest(path) {
  parts = path.split("/")
  if(parts.length == 2){
    return validateNpmPackageName(parts[1]).validForOldPackages ? parts[1] : false
  } else if (parts.length == 3) {
    scopedName = parts[1] + '/' + parts[2]
    return validateNpmPackageName(scopedName).validForOldPackages ? scopedName : false
  } else {
    return false;
  }
}

async function returnTarballEarly(path) {
  var res = isTarballRequest(path)
  if(!res){ return false }
  var {name, version} = res

  try {
    var cid = await db.get(`cid:npm:${name}:${version}`)
  } catch (e) {
    var cid = false
  }

  if (name != null && cid != undefined) {
    return {name: name, cid: cid}
  } else {
    return false
  }
}

function setConfig() {
  require('child_process').exec("npm config set proxy=http://0.0.0.0:8005/ https-proxy=http://0.0.0.0:8005/ registry=http://registry.npmjs.org/ strict-ssl=false")
}

function removeConfig() {
  require('child_process').exec("npm config delete proxy https-proxy registry strict-ssl")
}

function getLatestVersion(doc) {
  var latest = Object.entries(doc.time).filter(([key, value]) => ["created", "modified"].indexOf(key) < 0).sort(function(a, b) { return new Date(b[1]) - new Date(a[1]) })[0]
  return latest[0]
}

module.exports = {
  getLatestVersion,
  isTarballRequest,
  isMetadataRequest,
  returnTarballEarly,
  setConfig,
  removeConfig
}
