const tmp = require('tmp-promise');
const fs = require('fs-extra');
const path = require('path')
const async = require('async');
const all = require('it-all')
const toString = require('uint8arrays/to-string')

const pipe = require('it-pipe')
const toIterable = require('stream-to-it')
const { create } = require('ipfs-http-client')
const ipfs = create()

const ssri = require('ssri')

const StreamZip = require('node-stream-zip');
const {zipDigest, zipManifest} = require('zipdigest');
var JSZip = require("jszip");

const core = require('../core')

const log = require('electron-log')

async function packageAsJson(db, name) {
  var versions = await fetchVersionsList(db, name)
  var latest = await fetchLatest(db, name)

  var versionNumbers = versions.split('\n')

  try{
    var versionsCID = await db.get(`response:go:versions:${name}`)
  } catch {
    var versionsCID = null
  }

  try{
    var latestCID = await db.get(`response:go:latest:${name}`)
  } catch {
    var latestCID = null
  }

  var versionsJson = {}

  for (const version of versionNumbers) {
    if(version){
      versionsJson[version] = await versionAsJson(db, name, version)
    }
  }

  var json = {
    manager: 'go',
    registry: 'https://proxy.golang.org/',
    name: name,
    versions: versionsJson,
    responses: {
      versions: {
        url: `https://proxy.golang.org/${escape(name)}/@v/list`,
        body: versionsCID
      },
      latest: {
        url: `https://proxy.golang.org/${escape(name)}/@latest`,
        body: latestCID
      }
    }
  }

  return json
}

async function versionAsJson(db, name, version) {
  try{
    var cid = await db.get(`cid:go:${name}:${version}`)
  } catch {
    var cid = null
  }

  var url = `https://proxy.golang.org/${escape(name)}/@v/${version}.zip`

  var integrity = await fetchChecksum(db, name, version)

  try{
    var infoCID = await db.get(`response:go:info:${name}:${version}`)
  } catch {
    var infoCID = null
  }

  try{
    var modCID = await db.get(`response:go:mod:${name}:${version}`)
  } catch {
    var modCID = null
  }

  return {
    manager: 'go',
    registry: 'https://proxy.golang.org/',
    name: name,
    number: version,
    url: url,
    integrity: integrity,
    cid: cid,
    responses: {
      info: {
        url: `https://proxy.golang.org/${escape(name)}/@v/${version}.info`,
        body: infoCID
      },
      mod: {
        url: `https://proxy.golang.org/${escape(name)}/@v/${version}.mod`,
        body: modCID
      }
    }
  }
}

async function importLatest(db, name) {
  var version = await getLatestVersion(db, name)
  if(!version) { return false }
  log.info(`Latest version for ${name}: ${version}`)

  try{
    var cid = await db.get(`cid:go:${name}:${version}`)
    log.info(name, version, 'already imported')
    return {
      version: version,
      cid: cid
    }
  } catch {}

  var url = `https://proxy.golang.org/${escape(name)}/@v/${version}.zip`
  var wantedCid = await core.announceWant(db, 'go', name, version, url)
  var cid = await importPackage(db, name, version, url, wantedCid)
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
    var versions = await db.get(`response:go:versions:${name}`)
  } catch {
    var versions = ''
  }

  var newversions = await fetchVersionsList(db, name, true)

  var match = versions === newversions
  if (match){
    log.info('No new versions of', name)
    return
  } else {
    log.info('Found new versions of', name)
    var version = await getLatestVersion(db, name)
    var url = `https://proxy.golang.org/${escape(name)}/@v/${version}.zip`
    var wantedCid = await core.announceWant(db, 'go', name, version, url)
    await importPackage(db, name, version, url, wantedCid)
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

function matchesUseragent(req) {
  return req.headers['user-agent'].match(/Go-http-client/)
}

async function serverHandler(db, req, res) {
  var path = req.url
  log.info('proxy', path)

  if (/@v\/list$/.test(path)){
    var name = parseName(path)

    var body = await fetchVersionsList(db, name)

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
      res.end(body);
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
      var cid = tarball.cid
    } else {
      var cid = await downloadPackageFromRegistry(db, name, version)
    }
    core.tarballHandler(version+'.zip', 'application/zip', cid, req, res)
  }

  if (/@latest$/.test(path)){
    var name = parseName(path)
    var body = await fetchLatest(db, name)

    if(body){
      res.writeHead(200, {"Content-Type": "application/json"});
      res.end(JSON.stringify(body));
    } else {
      res.writeHead(404);
      res.end();
    }
  }

  if(/\/supported$/.test(path)){
    res.writeHead(404);
    return res.end();
  }

  if(/^\/sumdb/.test(path)){
    var url = `https://${path.substring(7)}`
    const response = await core.fetchWithTimeout(url); // TODO cache this response
    const body = await response.text();

    // TODO handle being offline

    res.writeHead(response.status, {"Content-Type": "text/plain; charset=UTF-8"});
    res.end(body);
  }
  // either 404 or proxy anything else to proxy.golang.org
}

async function importPackage(db, name, version, url, wantedCid) {
  var loaded = false
  var cid

  if(wantedCid){
    log.info('Attempting to load zip', name, version, 'via IPFS')
    try{
      var dir = await tmp.dir()
      var zippath = dir.path + '/' + version + '.zip'

      await pipe(
        ipfs.cat(cid, {timeout: 1000}),
        toIterable.sink(fs.createWriteStream(zippath))
      )

      await extractZip(zippath)
      await fs.remove(zippath)
      loaded = true
      cid = wantedCid
    } catch(e){
      log.info('Failed to load zip', name, version, 'from IPFS')
    }
  }

  if(!loaded){
    var integrity = await fetchChecksum(db, name, version)
    var possibleCID = core.guessCID(`sha256-${integrity}`)

    log.info('Attempting to load', name, version, 'via IPFS')
    // attempt to load possibleCID via ipfs
    var file = await core.attemptIPFSLoad(possibleCID)

    if(file){
      log.info(`Metafile loaded from IPFS (${possibleCID})`)
      // guessed CID was correct and loaded from ipfs
      var metafile = toString(file)

      zipcid = await recreateZip(metafile)
      if(zipcid){
        cid = zipcid
        loaded = true
      }
    }
  }

  if(!loaded){
    log.info('Failed to load', name, version, 'from IPFS')
    log.info('Loading', name, version, 'from url', url)

    var dir = await tmp.dir()
    var zippath = dir.path + '/' + version + '.zip'

    const res = await core.fetchWithTimeout(url); // TODO error handling
    const fileStream = fs.createWriteStream(zippath);
    log.info('Writing zip to', zippath)
    await new Promise((resolve, reject) => {
        res.body.pipe(fileStream);
        res.body.on("error", reject);
        fileStream.on("finish", resolve);
      });

    var metafile = await extractZip(zippath)

    // zip all those bits back up and add to ipfs
    zipcid = await recreateZip(metafile)

    // if recreateZip fails, add the original zip to ipfs
    if(!zipcid){
      zipcid = await core.addUrltoIPFS(db, 'go', name, version, url) // TODO use existing zip on disk
    }

    await fs.remove(zippath)
    if(zipcid){
      cid = zipcid
    }
  }

  // TODO should verify against integrity somewhere here

  if(cid){
    await core.saveVersion(db, 'go', name, version, url, cid)
    return cid
  } else {
    return false
  }
}

async function extractZip(zippath) {
  log.info('Extracting zip and generating metafile')
  var metafile = await zipManifest(zippath)

  var metafileCID = await core.ipfsAdd(metafile, 'sha2-256')
  log.info(`Adding metafile to IPFS (${metafileCID})`)

  await addZipContentsToIPFS(zippath)
  return metafile
}

async function recreateZip(metafile){
  // TODO use existing files on disk if available
  var lines = metafile.toString().trim().split("\n")

  // guess and load all the cids inside the metafile
  log.info('Loading files from IPFS')
  var subfiles = await addMetalinesToIPFS(lines)

  if (subfiles.length === lines.length){
    log.info('Loaded all', subfiles.length, 'files from IPFS')
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
    log.info('Adding files to zip')
    var u8 = await zip.generateAsync({type: "uint8array", compression: "DEFLATE", compressionOptions: {level: 8}})

    // add zip to ipfs
    var zipcid = await core.ipfsAdd(u8)
    log.info(`Adding zip to IPFS (${zipcid})`)
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
          resolved: `https://proxy.golang.org/${escape(name)}/@v/${version}.zip`,
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
  var checksum = await fetchChecksum(db, name, version)

  if(!checksum){
    log.info('Unknown version', name, version)
    return false
  }

  // calculate checksum of cid
  var integrity = await digest(version, cid)

  // compare integrity with checksum
  if(checksum === integrity){
    await core.saveCid(db, 'go', name, version, cid)
    return true
  } else {
    log.info('Failed to download', name, version, 'from IPFS', cid)
    return false
  }
}

async function fetchVersionsList(db, name, force = false) {
  var url = `https://proxy.golang.org/${escape(name)}/@v/list`
  return await core.fetchResponse(db, `response:go:versions:${name}`, url, force)
}

async function setupWatcher(callback) {
  checkPackages(callback)
  setInterval(async function(){
    checkPackages(callback)
  }, 60000)
}

async function getLatestVersion(db, name) {
  var latest = await fetchLatest(db, name, true)
  if(latest){
    var version = latest.Version
    await loadInfo(db, name, version)
    await loadMod(db, name, version)
    return version
  } else {
    log.info('Failed to download latest version of', name)
    return false
  }
}

async function watchImporter(db, change) {
  try{
    var name = escape(change.Path)
    var version = escape(change.Version)
  } catch(e){
    log.info('invalid go change', change)
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
    log.info('New release:', name, version)
    // TODO load these all at the same time with async parallel
    await fetchVersionsList(db, name, true)
    await fetchLatest(db, name, true)
    await loadInfo(db, name, version)
    await loadMod(db, name, version)
    await downloadPackageFromRegistry(db, name, version)
  }
}

async function watchKnown(db, change) {
  var name = escape(change.Path)
  try {
    var known = await db.get(`response:go:versions:${name}`) // cached checked
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
    log.info('adding metaline failed', err);
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
     log.info('Loaded', f.path, 'from IPFS')
     f.cid = maybeFileCID
     f.content = individualFileContent

     return f
   } else {
     log.error('Failed to load', f.path, 'from IPFS')
     return false
   }
 } catch(e) {
   console.log(e)
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
      log.info('zip error', e)
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
        log.info('Adding', entry.name, 'to IPFS')
        files.push({
          path: entry.name,
          content: zip.entryDataSync(entry.name)
        })
      } catch(e){
        log.info('error loading file from zip', entry.name, e)
      }
    }
  }

  try{
    if(files.length > 0){
      var res = await all(ipfs.addAll(files, {chunker: 'size-1048576', rawLeaves: true, hashAlg: 'sha2-256', cidVersion: 1}))
    }
  } catch (e){
    log.info(e)
  }

  return
}

async function downloadPackageFromRegistry(db, name, version) {
  var url = `https://proxy.golang.org/${escape(name)}/@v/${version}.zip`
  var wantedCid = await core.announceWant(db, 'go', name, version, url)
  return await importPackage(db, name, version, url, wantedCid)
}

async function loadMod(db, name, version) {
  var url = `https://proxy.golang.org/${escape(name)}/@v/${version}.mod`
  return await core.fetchResponse(db, `response:go:mod:${name}:${version}`, url)
}

async function fetchLatest(db, name, force = false) {
  var url = `https://proxy.golang.org/${escape(name)}/@latest`
  var body = await core.fetchResponse(db, `response:go:latest:${name}`, url, force)
  if(body){
    return JSON.parse(body)
  } else {
    return false
  }
}

async function loadInfo(db, name, version) {
  var url = `https://proxy.golang.org/${escape(name)}/@v/${version}.info`
  return await core.fetchResponse(db, `response:go:info:${name}:${version}`, url)
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
    log.info("Failed to connect to the changes feed")
  }
}

async function digest(version, cid) {
  var dir = await tmp.dir()

  var zippath = dir.path + '/' + version + '.zip'

  // get file from ipfs via cid and write to disk
  await pipe(
    ipfs.cat(cid, {timeout: 1000}),
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

async function fetchChecksum(db, name, version) {
  var url = `https://sum.golang.org/lookup/${escape(name)}@${version}`
  var body = await core.fetchResponse(db, `response:go:sum:${name}:${version}`, url)
  if(body) {
    return body.split("\n")[1].split(' ')[2].split(':')[1]
  } else {
    log.error('Failed to download checksum for', name, version)
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

module.exports = {
  verify,
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
  unsetConfig,
  matchesUseragent,
  versionAsJson,
  packageAsJson,

  fetchVersionsList,
  parseGoSum,
  escape
}
