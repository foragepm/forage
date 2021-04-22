const tmp = require('tmp-promise');
const fs = require('fs-extra');
const path = require('path')
const async = require('async');

const all = require('it-all')

const pipe = require('it-pipe')
const toIterable = require('stream-to-it')
const IpfsHttpClient = require('ipfs-http-client')
const ipfs = IpfsHttpClient()

const ssri = require('ssri')

const StreamZip = require('node-stream-zip');
const {zipDigest, zipManifest} = require('zipdigest');
var JSZip = require("jszip");

const core = require('../core')

var debug = require('debug')('forage-go')

async function importLatest(db, name) {
  var version = await getLatestVersion(db, name)
  if(!version) { return false }
  debug(`Latest version for ${name}: ${version}`)
  var url = `https://proxy.golang.org/${name}/@v/${version}.zip`
  var cid = await importPackage(db, name, version, url)
  return {
    version: version,
    cid: cid
  }
}

function setConfig() {
  require('child_process').exec("export GOPROXY=http://localhost:8005")
}

function unsetConfig() {
  require('child_process').exec("unset GOPROXY")
}

async function updatePackage(db, name) {
  try{
    var versions = await db.get(`pkg:go:${name}`)
  } catch {
    var versions = ''
  }

  var newversions = await fetchVersionsList(db, name)

  var match = versions === newversions
  if (match){
    debug('No new versions of', name)
    return
  } else {
    debug('Found new versions of', name)
    var version = await getLatestVersion(db, name)
    var url = `https://proxy.golang.org/${name}/@v/${version}.zip`
    await importPackage(db, name, version, url)
    return true
  }
}

function isLockfilepath(filepath) {
  return filepath.match(/go\.sum$/)
}

function lockfileExists(filepath) {
  return fs.existsSync('go.sum')
}

function lockfileName() {
  return 'go.sum'
}

async function readLockfile(filepath) {
  return parseGoSum(filepath)
}

async function serverHandler(db, req, res) {
  var path = req.url
  debug('proxy', path)

  if (/@v\/list$/.test(path)){
    var name = parseName(path)

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

    var tarball = await returnTarballEarly(db, name, version)

    if(tarball.cid){
      core.tarballHandler(version+'.zip', 'application/zip', tarball.cid, req, res)
    } else {
      downloadPackageFromRegistry(db, name, version)
      var url = `https://proxy.golang.org/${name}/@v/${version}.zip`
      // TODO reuse the zip we just downloaded into ipfs
      core.fetchWithTimeout(url).then(resp => new Promise((resolve, reject) => {
          res.writeHead(resp.status, { 'Content-Type': 'application/zip' });
          resp.body.pipe(res);
      }));
    }
  }

  if (/@latest$/.test(path)){
    var name = parseName(path)
    var body = await loadLatest(db, name)

    if(body){
      res.writeHead(200, {"Content-Type": "application/json"});
      res.end(JSON.stringify(body));
    } else {
      res.writeHead(404);
      res.end();
    }
  }

  if(/^\/sumdb/.test(path)){
    var url = `https://${path.substring(7)}`
    const response = await core.fetchWithTimeout(url);
    const body = await response.text();

    // TODO handle being offline

    res.writeHead(response.status, {"Content-Type": "text/plain; charset=UTF-8"});
    res.end(body);
  }
}

async function importPackage(db, name, version, url) {
  var hashAlg = 'sha2-256'
  var cid
  var loaded = false

  try {
    var exists = await db.get(`cid:go:${name}:${version}`)
    debug(name, version, 'already imported')
    return exists
  } catch (e) {
    var exists = false
  }

  var integrity = await fetchChecksum(name, version)
  var possibleCID = core.guessCID(`sha256-${integrity}`)

  debug('Attempting to load', name, version, 'via IPFS')
  // attempt to load possibleCID via ipfs
  var file = await core.attemptIPFSLoad(possibleCID)

  if(file){
    debug(`Metafile loaded from IPFS (${possibleCID})`)
    // guessed CID was correct and loaded from ipfs
    var metafile = file

    zipcid = await recreateZip(metafile)
    if(zipcid){
      cid = zipcid
      loaded = true
    }
  }

  if(!loaded){
    debug('Failed to load', name, version, 'from IPFS')
    debug('Loading', name, version, 'from url', url)

    var dir = await tmp.dir()
    var zippath = dir.path + '/' + version + '.zip'

    const res = await core.fetchWithTimeout(url); // TODO error handling
    const fileStream = fs.createWriteStream(zippath);
    debug('Writing zip to', zippath)
    await new Promise((resolve, reject) => {
        res.body.pipe(fileStream);
        res.body.on("error", reject);
        fileStream.on("finish", resolve);
      });

    debug('Extracting zip and generating metafile')
    var metafile = await zipManifest(zippath)

    var metafileCID = await core.ipfsAdd(metafile, hashAlg)
    debug(`Adding metafile to IPFS (${metafileCID})`)

    await addZipContentsToIPFS(zippath)

    // zip all those bits back up and add to ipfs
    zipcid = await recreateZip(metafile)
    await fs.remove(zippath)
    if(zipcid){
      cid = zipcid
    }
  }

  if(cid){
    await core.saveVersion(db, 'go', name, version, url, cid)
    return cid
  } else {
    return false
  }
}

async function recreateZip(metafile){
  var lines = metafile.toString().trim().split("\n")

  // guess and load all the cids inside the metafile
  debug('Loading files from IPFS')
  var subfiles = await addMetalinesToIPFS(lines)

  if (subfiles.length === lines.length){
    debug('Loaded all', subfiles.length, 'files from IPFS')
    // zip up all the files and add zip to ipfs, plus record cid of zip in db
    var zip = new JSZip();

    for (var i in subfiles) {
      var subfile = subfiles[i]
      zip.file(subfile.path, subfile.content, {
        date: new Date('Nov 30 00:00:00 1979'),
        unixPermissions: 0,
        createFolders: false
      });
    }

    // create zip
    debug('Adding files to zip')
    var u8 = await zip.generateAsync({type: "uint8array", compression: "DEFLATE", compressionOptions: {level: 8}})

    // add zip to ipfs
    var zipcid = await core.ipfsAdd(u8)
    debug(`Adding zip to IPFS (${zipcid})`)
    return zipcid
  } else {
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

async function verify(db, name, version, cid) {
  // fetch checksum from sumdb
  var checksum = await fetchChecksum(name, version)

  if(!checksum){
    debug('Unknown version', name, version)
    return false
  }

  // calculate checksum of cid
  var integrity = await digest(version, cid)

  // compare integrity with checksum
  if(checksum === integrity){
    await core.saveCid(db, 'go', name, version, cid)
    return true
  } else {
    debug('Failed to download', name, version, 'from IPFS', cid)
    return false
  }
}

async function fetchVersionsList(db, name) {
  var url = `https://proxy.golang.org/${name}/@v/list`
  const response = await core.fetchWithTimeout(url);
  if(response.ok){
    const body = await response.text();
    await db.put(`pkg:go:${name}`, body)
    return body
  } else {
    return false
  }
}

async function setupWatcher(callback) {
  checkPackages(callback)
  setInterval(async function(){
    checkPackages(callback)
  }, 60000)
}

async function getLatestVersion(db, name) {
  var latest = await fetchLatest(db, name)
  if(latest){
    var version = latest.Version
    await loadInfo(db, name, version)
    await loadMod(db, name, version)
    return version
  } else {
    debug('Failed to download latest version of', name)
    return false
  }
}

async function watchImporter(db, change) {
  try{
    var name = escape(change.Path)
    var version = escape(change.Version)
  } catch(e){
    debug('invalid go change', change)
    return false
  }

  try {
    var exists = await db.get(`cid:go:${name}:${version}`)
  } catch (e) {
    var exists = false
  }

  if(exists) {
    // duplicate change from stream
  } else {
    debug('New release:', name, version)
    fetchVersionsList(db, name)
    fetchLatest(db, name)
    loadInfo(db, name, version)
    loadMod(db, name, version)
    downloadPackageFromRegistry(db, name, version)
  }
}

async function watchKnown(db, change) {
  var name = escape(change.Path)
  try {
    var known = await db.get(`pkg:go:${name}`)
    if(known){
      watchImporter(db, change)
    }
  } catch(e){
    // ignore packages we haven't already downloaded
  }
}

// internal

async function addMetalinesToIPFS(lines) {
  var subfiles = []

  var q = async.queue(async function(line) {
    var res = await addMetalineToIPFS(line)
    if(res){
      subfiles.push(res)
    }
  }, core.concurrency)

  lines.forEach(async function(line) {
    q.push(line);
  });

  q.error(function(err, task) {
    debug('adding metaline failed', err);
  });

  await q.drain()

  return subfiles.sort(function(a,b) {
    if (a.path > b.path) {
      return 1;
    }
    if (a.path < b.path) {
      return -1;
    }
    return 0;
  })
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

   if (individualFileContent !== false){
     debug('Loaded', f.path, 'from IPFS')
     f.cid = maybeFileCID
     f.content = individualFileContent.toString()
     return f
   } else {
     debug('Failed to load', f.path, 'from IPFS')
     return false
   }
 } catch(e) {
   return false;
 }
}

async function addZipContentsToIPFS(filePath) {
  return new Promise((resolve, reject) => {
    var zip = new StreamZip({storeEntries: true, file: filePath});
    zip.on('ready', async  () => {
      await addEntriesToIPFS(zip)
       // TODO closing the zip causes errors but will likely increase memory usage if not used
      // zip.close()
      resolve()
    })
    zip.on('error', e => {
      debug('zip error', e)
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

async function addEntriesToIPFS(zip){
  var files = []

  for (const entry of Object.values(zip.entries()).sort()) {
    if(!entry.isDirectory){
      try{
        debug('Adding', entry.name, 'to IPFS')
        files.push({
          path: entry.name,
          content: zip.entryDataSync(entry.name)
        })
      } catch(e){
        debug('error loading file from zip', entry.name, e)
      }
    }
  }

  try{
    if(files.length > 0){
      var res = await all(ipfs.addAll(files, {chunker: 'size-1048576', rawLeaves: true, hashAlg: 'sha2-256', cidVersion: 1}))
    }
  } catch (e){
    debug(e)
  }

  return
}

async function downloadPackageFromRegistry(db, name, version) {
  var url = `https://proxy.golang.org/${name}/@v/${version}.zip`
  return await importPackage(db, name, version, url)
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
    var response = await core.fetchWithTimeout(url);
    if(response.ok){
      var body = await response.text();
      await db.put(`mod:go:${name}:${version}`, body)
      return body
    } else {
      return false
    }
  }
}

async function fetchLatest(db, name) {
  var url = `https://proxy.golang.org/${name}/@latest`
  var response = await core.fetchWithTimeout(url);
  if(response.ok){
    var body = await response.json();
    await db.put(`latest:go:${name}`, JSON.stringify(body))
    return body
  } else {
    return false
  }
}

async function loadLatest(db, name) {
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
    var response = await core.fetchWithTimeout(url);
    if(response.ok){
      var body = await response.json();
      await db.put(`info:go:${name}:${version}`, JSON.stringify(body))
      return body
    } else {
      return false
    }
  }
}

async function checkPackages(callback) {
  try{
    var currentDate = new Date();
    var date = new Date(currentDate.getTime() - 60000).toISOString();
    var res = await core.fetchWithTimeout(`https://index.golang.org/index?since=${date}`)
    var text = await res.text()
    var lines = text.trim().split("\n")
    lines.forEach((line) => {
      if(line.length > 0){
        callback('go', JSON.parse(line))
      }
    });
  } catch(e){
    debug("Failed to connect to the changes feed")
  }
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

function unescape(string) {
  // replace %21${lowercase} letters with upper case
  return string.replace(/!(.)/g, function(match, p1, offset, string) {
    return p1.toUpperCase();
  })
}

async function fetchChecksum(name, version) {
  try{
    var res = await core.fetchWithTimeout(`https://sum.golang.org/lookup/${name}@${version}`)
    var body = await res.text()
    return body.split("\n")[1].split(' ')[2].split(':')[1]
  } catch(e){
    debug('Failed to download checksum for', name, version, e)
    return false
  }
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

function parseVersion(path) {
  var v = path.match(/@v\/(.+)/)[1]
  return v.replace('.info', '').replace('.mod', '').replace('.zip', '')
}

function parseName(path) {
  return path.match(/\/(.+)\/@/)[1]
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

module.exports = {
  parseGoSum,
  escape, // should be internal
  verify,
  fetchVersionsList,
  setupWatcher,
  watchImporter,
  watchKnown,
  serverHandler,
  importPackage,
  getLatestVersion,
  importLatest,
  updatePackage,
  readLockfile,
  isLockfilepath,
  lockfileExists,
  lockfileName,
  setConfig,
  unsetConfig
}
