const tmp = require('tmp-promise');
const fetch = require('node-fetch')
const fs = require('fs-extra');
const path = require('path')

const pipe = require('it-pipe')
const toIterable = require('stream-to-it')
const IpfsHttpClient = require('ipfs-http-client')
const { urlSource } = IpfsHttpClient
const ipfs = IpfsHttpClient()

const ssri = require('ssri')

const StreamZip = require('node-stream-zip');
const {zipDigest, zipManifest} = require('../zip_digest');

const core = require('./core')

async function serverHandler(db, req, res) {
  var path = req.url

  if (/@v\/list$/.test(path)){
    var name = parseName(path)
    console.log('go list', name)

    var body = await loadVersionsList(db, name)

    if(body){
      res.writeHead(200, {"Content-Type": "text/plain"});
      res.end(body);
    } else {
      res.writeHead(404);
      res.end();
    }
  }

  if (/@v\/(.+)\.info$/.test(path)){
    var name = parseName(path)
    var version = parseVersion(path)
    console.log('go info', name, version)

    var body = await loadInfo(db, name, version)

    if(body){
      res.writeHead(200, {"Content-Type": "application/json"});
      res.end(JSON.stringify(body));
    } else {
      res.writeHead(404);
      res.end();
    }
  }

  if (/@v\/(.+)\.mod$/.test(path)){
    var name = parseName(path)
    var version = parseVersion(path)
    console.log('go mod', name, version)

    var body = await loadMod(db, name, version)

    if(body){
      res.writeHead(200, {"Content-Type": "text/plain"});
      res.end(body);
    } else {
      res.writeHead(404);
      res.end();
    }
  }

  if (/@v\/(.+)\.zip$/.test(path)){
    var name = parseName(path)
    var version = parseVersion(path)
    console.log('go source', name, version)

    var tarball = await returnTarballEarly(db, name, version)

    if(tarball.cid){
      core.tarballHandler(version+'.zip', 'application/zip', tarball.cid, req, res)
    } else {
      downloadPackageFromRegistry(db, name, version)
      var url = `https://proxy.golang.org/${name}/@v/${version}.zip`
      // TODO reuse the zip we just downloaded into ipfs
      fetch(url).then(resp => new Promise((resolve, reject) => {
          res.writeHead(resp.status, { 'Content-Type': 'application/zip' });
          resp.body.pipe(res);
      }));
    }
  }

  if (/@latest$/.test(path)){
    var name = parseName(path)
    console.log('go latest', name)

    var body = await loadLatest(name)

    if(body){
      res.writeHead(200, {"Content-Type": "application/json"});
      res.end(JSON.stringify(body));
    } else {
      res.writeHead(404);
      res.end();
    }
  }

  if(/^\/sumdb/.test(path)){
    console.log('go sumdb', path)
    var url = "https://proxy.golang.org"+path
    const response = await fetch(url);
    const body = await response.text();

    // TODO handle being offline

    res.writeHead(response.status, {"Content-Type": "text/plain"});
    res.end(body);
  }
}

async function importPackage(db, manager, name, version, url) {
  var hashAlg = 'sha2-256'
  var possibleCID
  var cid
  var loaded = false

  var integrity = await fetchChecksum(name, version)
  possibleCID = core.guessCID(`sha256-${integrity}`)

  if(possibleCID){
    // attempt to load possibleCID via ipfs
    var file = await core.attemptIPFSLoad(possibleCID)

    if(file){
      // guessed CID was correct and loaded from ipfs
      metafileContent = file

      var lines = metafileContent.toString().trim().split("\n")

      // TODO this needs to be async
      // guess and load all the cids inside the metafile
      var subfiles = []

      for (var i in lines) {
        // console.log('enqueing', lines[i])
        var res = await addMetalineToIPFS(lines[i])
        if(res){
          subfiles.push(res)
        }
      }

      if (subfiles.length === lines.length){
        // zip up all the files and add zip to ipfs, plus record cid of zip in db
        var zip = new JSZip();

        for (var i in subfiles) {
          var subfile = subfiles[i]
          zip.file(subfile.path, subfile.content);
        }

        // create zip
        var u8 = await zip.generateAsync({type: "uint8array", compression: "DEFLATE",compressionOptions: {level: 9}})

        // add zip to ipfs
        var zipcid = await core.ipfsAdd(u8)

        cid = zipcid
        loaded = true
      }
    }

    if(!loaded){
      // if files didn't load
      var zipCID = await core.addUrltoIPFS(db, manager, name, version, url, hashAlg)

      var dir = await tmp.dir()
      var zippath = dir.path + '/' + version + '.zip'

      // get zip file from ipfs via cid and write to disk
      await pipe(
        ipfs.cat(zipCID),
        toIterable.sink(fs.createWriteStream(zippath))
      )

      metafile = await zipManifest(zippath)
      var metafileCID = await core.ipfsAdd(metafile, hashAlg)
      var cids = await addZipContentsToIPFS(zippath)

      await fs.remove(zippath)
      cid = zipCID
    }

  } else {
    // regular url download (only old npms + other possible package managers)
    cid = await core.addUrltoIPFS(db, manager, name, version, url, hashAlg)
  }

  return cid
}

function parseName(path) {
  return path.match(/\/(.+)\/@/)[1]
}

function parseVersion(path) {
  v = path.match(/@v\/(.+)/)[1]
  return v.replace('.info', '').replace('.mod', '').replace('.zip', '')
}

async function returnTarballEarly(db, name, version) {
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

async function digest(version, cid) {
  var dir = await tmp.dir()

  var zippath = dir.path + '/' + version + '.zip'

  // get file from ipfs via cid and write to disk
  await pipe(
    ipfs.cat(cid),
    toIterable.sink(fs.createWriteStream(zippath))
  )

  // digest zip
  var digest = await zipDigest(zippath)

  // remove tmp directory and zip
  await fs.remove(zippath)

  return digest
}

async function verify(db, name, version, cid) {
  var manager = 'go'
  // fetch checksum from sumdb
  var checksum = await fetchChecksum(name, version)

  if(!checksum){
    console.log('Unknown version', manager, name, version)
    return false
  }

  // calculate checksum of cid
  var integrity = await digest(version, cid)

  // compare integrity with checksum
  if(checksum === integrity){
    await db.put(`cid:${manager}:${name}:${version}`, cid)
    return true
  } else {
    console.log('Failed to download', manager, name, version, 'from IPFS', cid)
    return false
  }
}

async function fetchVersionsList(db, name) {
  var url = `https://proxy.golang.org/${name}/@v/list`
  const response = await fetch(url);
  if(response.ok){
    const body = await response.text();
    await db.put(`pkg:go:${name}`, body)
    return body
  } else {
    return false
  }
}

async function checkPackages(callback) {
  try{
    var currentDate = new Date();
    var date = new Date(currentDate.getTime() - 60000).toISOString();
    var res = await fetch(`https://index.golang.org/index?since=${date}`)
    var text = await res.text()
    var lines = text.trim().split("\n")
    lines.forEach((line) => {
      if(line.length > 0){
        callback('go', JSON.parse(line))
      }
    });
  } catch(e){
    console.error("Failed to connect to the go changes feed")
  }
}

async function setupWatcher(callback) {
  checkPackages(callback)
  setInterval(async function(){
    checkPackages(callback)
  }, 60000)
}

async function loadVersionsList(db, name) {
  try {
    var versions = await db.get(`pkg:go:${name}`)
  } catch (e) {
    var versions = false
  }

  if(versions){
    return versions
  } else {
    return await fetchVersionsList(db, name)
  }
}

async function loadInfo(db, name, version) {
  var versionList = await loadVersionsList(db, name)
  // TODO if version not included in versionList then reload

  try {
    var info = await db.get(`info:go:${name}:${version}`)
  } catch (e) {
    var info = false
  }

  if(info){
    return JSON.parse(info)
  } else {
    var url = `https://proxy.golang.org/${name}/@v/${version}.info`
    var response = await fetch(url);
    if(response.ok){
      var body = await response.json();
      await db.put(`info:go:${name}:${version}`, JSON.stringify(body))
      return body
    } else {
      return false
    }
  }
}

async function loadMod(db, name, version) {
  var versionList = await loadVersionsList(db, name)
  // TODO if version not included in versionList then reload

  try {
    var versions = await db.get(`mod:go:${name}:${version}`)
  } catch (e) {
    var versions = false
  }

  if(versions){
    return versions
  } else {
    var url = `https://proxy.golang.org/${name}/@v/${version}.mod`
    var response = await fetch(url);
    if(response.ok){
      var body = await response.text();
      await db.put(`mod:go:${name}:${version}`, body)
      return body
    } else {
      return false
    }
  }
}

async function loadLatest(name) {
  var versionList = await loadVersionsList(db, name)
  // TODO return the latest from versionList

  try {
    var info = await db.get(`latest:go:${name}`)
  } catch (e) {
    var info = false
  }

  if(info){
    return JSON.parse(info)
  } else {
    return await fetchLatest(db, name)
  }
}

async function fetchLatest(db, name) {
  var url = `https://proxy.golang.org/${name}/@latest`
  var response = await fetch(url);
  if(response.ok){
    var body = await response.json();
    await db.put(`latest:go:${name}`, JSON.stringify(body))
    return body
  } else {
    return false
  }
}

async function downloadPackageFromRegistry(db, name, version) {
  var url = `https://proxy.golang.org/${name}/@v/${version}.zip`
  return await importPackage(db, 'go', name, version, url)
}

async function watchImporter(db, change) {
  try{
    var name = escape(change.Path)
    var version = escape(change.Version)
  } catch(e){
    console.log('invalid go change', change)
    console.error(e)
    return false
  }

  try {
    exists = await db.get(`cid:go:${name}:${version}`)
  } catch (e) {
    exists = false
  }

  if(exists) {
    // duplicate change from stream
  } else {
    console.log('New release:', 'go', name, version)
    fetchVersionsList(db, name)
    fetchLatest(db, name)
    loadInfo(db, name, version)
    loadMod(db, name, version)
    downloadPackageFromRegistry(db, name, version)
  }
}

async function addMetalineToIPFS(line){
  try{
    var parts = line.split('  ')
    var f = {
      sha256: parts[0],
      path: parts[1],
    }
   var digest = ssri.fromHex(parts[0], 'sha256', {single: true})
   var maybeFileCID = core.guessCID(digest)

   var individualFileContent = await core.attemptIPFSLoad(maybeFileCID)

   if (individualFileContent){
     f.cid = maybeFileCID
     f.content = individualFileContent.toString()
     return f
   } else {
     return false
   }
 } catch(e) {
   return false;
 }
}

async function addZipContentsToIPFS(filePath) {
  // TODO needs to be async
  return new Promise((resolve, reject) => {
  zip = new StreamZip({storeEntries: true, file: filePath});
  zip.on('ready', async  () => {
    cids = []
    for (const entry of Object.values(zip.entries()).sort()) {
        if(!entry.isDirectory){

          const data = zip.entryDataSync(entry.name);
          var cid = await core.ipfsAdd(data, 'sha2-256')
          cids.push(cid)
          console.log('Adding', entry.name, 'to ipfs', cid.cid.toString())
        }
    }
    zip.close()
    resolve(cids)
  })
  zip.on('error', e => {
    try {
      if (zip) {
        zip.close()
      }
    } catch (e) {
      // ignore
    }
    reject(e)
    })
  });
}

module.exports = {
  parseName,
  parseVersion,
  returnTarballEarly,
  fetchChecksum,
  parseGoSum,
  escape,
  unescape,
  digest,
  verify,
  fetchVersionsList,
  checkPackages,
  setupWatcher,
  loadVersionsList,
  loadInfo,
  loadMod,
  loadLatest,
  fetchLatest,
  watchImporter,
  serverHandler,
  addMetalineToIPFS,
  addZipContentsToIPFS,
  importPackage
}
