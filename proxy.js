var validateNpmPackageName = require("validate-npm-package-name")

const Store = require('electron-store');

const store = new Store({accessPropertiesByDotNotation: false});

var httpProxy = require('http-proxy');

var proxy = httpProxy.createServer({
  target: 'https://registry.npmjs.org/'
});

proxy.on('error', function (err, req, res) {
  console.log('ERROR', err)
});

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

function isTarballRequest(path) {
  if (path.match('\.tgz$')) {
    parts = path.split("/")
    vparts = path.split('-')
    version = vparts[vparts.length - 1].replace('.tgz', '')
    if (parts[1].startsWith('@')) {
      return parts[1] + '/' + parts[2] + '@' + version
    } else {
      return parts[1] + '@' + version
    }
  } else {
    return false;
  }
}

// TODO replace with selfHandleResponse
proxy.on('proxyReq', function (proxyReq, req, res) {
  if (name = isMetadataRequest(proxyReq.path)) {
    // request for metadata - check to see if we already have it and return if we do (low priority)
    console.log('metadata request:', name)
    if (store.get(name)) {
      console.log('  hit')
    } else {
      console.log('  miss')
    }
  } else if(name = isTarballRequest(proxyReq.path)) {
    // request for tarball - check to see if we already have it and return if we do
    console.log('tarball request:', name)
    if (store.get(name)) {
      console.log('  hit')
    } else {
      console.log('  miss')
    }
  }
});

proxy.on('proxyRes', function (proxyRes, req, res) {
  path = req.url.replace('http://registry.npmjs.org', '')

  if (name = isMetadataRequest(path)) {
    // cache metadata and send on response i.e. store/update json for package
    console.log('metadata response:', name)
    store.set(name, true)
  } else if(name = isTarballRequest(path)) {
    // cache tarball and send on response i.e. add to ipfs and store the CID
    console.log('tarball response:', name)
    store.set(name, true)
  }
});

module.exports = proxy
