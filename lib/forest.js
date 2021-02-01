const uint8ArrayToString = require('uint8arrays/to-string')
const IpfsHttpClient = require('ipfs-http-client')
const { urlSource } = IpfsHttpClient
const ipfs = IpfsHttpClient()
const detectContentType = require('ipfs-http-response/src/utils/content-type')
const toStream = require('it-to-stream')
const pipe = require('it-pipe')
const toIterable = require('stream-to-it')
const fetch = require('node-fetch')
const fs = require('fs-extra');
const path = require('path');
var tmp = require('tmp-promise');
var zipDigest = require('./zip_digest');

const npm = require('./managers/npm')
const go = require('./managers/go')

const envPaths = require('env-paths');
const level = require('level-party')
const paths = envPaths('forest');
var db

var pjson = require('../package.json');

const ssri = require('ssri')

const packageAnnoucementsTopic = 'forest'

var ipfsID = undefined;
var ipfsd = undefined;

function connectDB() {
  return db = level(paths.data)
}

function version() {
  pjson.version
}

async function connectIPFS(){
  try{
    ipfsID = await ipfs.id()
    console.log('Connected to IPFS')
    return ipfsID;
  } catch {
    try{
      ipfsd = await startIPFS()
      ipfsID = await ipfsd.api.id()
      return ipfsID;
    } catch(e){
      console.log('ERROR', e)
      console.error('ERROR: Could not connect to or start IPFS')
      process.exit(1);
    }
  }
}

async function startIPFS() {
  console.log('Starting IPFS')

  const Ctl = require('ipfsd-ctl');

  const ipfsd = await Ctl.createController({
      disposable: false,
      args: '--enable-pubsub-experiment',
      ipfsHttpModule: require('ipfs-http-client'),
      ipfsBin: require('go-ipfs').path(),
      test: false,
      remote: false
  })

  fs.removeSync(path.join(ipfsd.path, 'api'))

  var started = await ipfsd.start()
  console.log('Started IPFS')
  const id = await ipfsd.api.id()

  return ipfsd
}

async function reset() {
  await db.clear()
}

async function defaultAnnounceCb(msg) {
  try{
    var json = JSON.parse(uint8ArrayToString(msg.data))
    // TODO more checking that json has correct fields
  } catch(e) {
    // invalid json
    return
  }

  if (ipfsID.id === msg.from) { return } // ignore our own announcements

  console.log(msg.from, "republished", json.manager, json.name, json.version)

  // record each republish
  const time = new Date().getTime()
  await db.put(`repub:${json.manager}:${json.name}:${json.version}:${msg.from}`, time)

  try {
    exists = await db.get(`pkg:${json.manager}:${json.name}`)
  } catch (e) {
    exists = false
  }

  if (exists) {
    // known project

    try {
      cid = await db.get(`cid:${json.manager}:${json.name}:${json.version}`)
    } catch (e) {
      cid = false
    }

    if(cid){
      // already downloaded
      if (cid == json.cid) {
        // matching IPFS cid
        console.log(json.manager, json.name, json.version, 'as', json.cid, 'matches existing local copy')
      } else {
        console.log('WARNING', json.manager, json.name, json.version, 'as', json.cid, 'does not match existing local copy')
      }
    } else {
      // download via IPFS
      await downloadPackageFromIPFS(json.manager, json.name, json.version, json.cid)
      // TODO fallback to http download if ipfs download fails
    }
  }
}

async function subscribePackageAnnoucements(receiveMsg = defaultAnnounceCb) {
  try {
    await ipfs.pubsub.subscribe(packageAnnoucementsTopic, receiveMsg)
    console.log(`Subscribed to '${packageAnnoucementsTopic}' pubsub topic`)
  } catch(e) {
    console.error(`Failed to subscribe to '${packageAnnoucementsTopic}' pubsub topic`)
    console.log("IPFS experimental pubsub feature not enabled. Run daemon with --enable-pubsub-experiment")
  }
}

async function unsubscribePackageAnnoucements() {
  await ipfs.pubsub.unsubscribe(packageAnnoucementsTopic)
  console.log(`Unsubscribed from '${packageAnnoucementsTopic}' pubsub topic`)
}

// has npm specific code
async function downloadPackageFromRegistry(manager, name, version){
  var metadata = await loadMetadata(manager, name)
  if(!metadata) {
    console.log("Failed to load metadata for", name)
    return false
  }

  var versionData = metadata.versions[version]

  if(versionData == null){
    console.log('Reloading metadata for', name, version)
    const metadata = await loadMetadataFromRegistry(manager, name)
    var versionData = metadata.versions[version]

    if(versionData == null){
      // no known version in registy
      console.log("Can't find", version, "for", name)
      return false
    }
  }

  var url = versionData.dist.tarball
  return await addUrltoIPFS(manager, name, version, url)
}

async function downloadGoPackageFromRegistry(name, version) {
  var url = `https://proxy.golang.org/${name}/@v/${version}.zip`
  return await addUrltoIPFS('go', name, version, url)
}

async function addUrltoIPFS(manager, name, version, url){
  try {
    exists = await db.get(`cid:${manager}:${name}:${version}`)
  } catch (e) {
    exists = false
  }

  if (exists) { return exists }

  try {
    const file = await ipfs.add(urlSource(url))
    console.log('IPFS add:', file.path, file.cid.toString())

    await db.put(`cid:${manager}:${name}:${version}`, file.cid.toString())
    var size = await setTarballSize(manager, name, version)

    try {
      ipfs.pubsub.publish('forest', JSON.stringify({
        url: url,
        manager: manager,
        name: name,
        version: version,
        path: file.path,
        cid: file.cid.toString(),
        forest: pjson.version,
        size: size
      }))
    } catch(e) {
      console.error('Failed to announce', manager, name, version, 'over pubsub')
    }

    return file.cid.toString()
  } catch(e) {
    console.log('error in ipfs add', url)
    console.error(e)
    return false
  }
}

function listPackages(manager) {
  if(manager){
    var key = `cid:${manager}:`
  } else {
    var key = `cid:`
  }

  var packages = new Promise((resolve, reject) => {
    var keys = []
    db.createKeyStream({gte: key, lt: key+'~'})
      .on('data', function (data) {
        var parts = data.split(':')
        keys.push({manager: parts[1], name: parts[2], version: parts[3]})
      })
      .on('end', function () {
        resolve(keys.sort())
      })
  })
  return packages
}

async function closeDB(){
  return await db.close()
}

function listPackageNames(manager) {
  if(manager){
    var key = `pkg:${manager}:`
  } else {
    var key = `pkg:`
  }

  return new Promise((resolve, reject) => {
    var names = []
    db.createKeyStream({gte: key, lt: key+'~'})
      .on('data', function (data) {
        var parts = data.split(':')
        names.push({manager: parts[1], name: parts[2]})
      })
      .on('end', function () {
        resolve(names.sort())
      })
  })
}

async function downloadPackageFromIPFS(manager, name, version, cid) {
  try {
    existing_cid = await db.get(`cid:${manager}:${name}:${version}`)
  } catch (e) {
    existing_cid = false
  }

  if (existing_cid === cid){
    console.log('Already downloaded', manager, name, version, 'from IPFS')
    return
  }

  if(manager === 'npm'){
    return await npmVerify(name, version, cid)
  } else if (manager === 'go'){
    return await goVerify(name, version, cid)
  } else {
    console.log('Unknown manager:', manager)
  }
}

async function npmVerify(name, version, cid) {
  var manager = 'npm'
  var metadata = await loadMetadata(manager, name)
  if(!metadata) {
    console.log("Failed to load metadata for", name)
    return false
  }
  var versionData = metadata.versions[version]

  if (versionData == null) {
    console.log('Reloading metadata for', name, version)
    var metadata = await loadMetadataFromRegistry(manager, name)
    var versionData = metadata.versions[version]
  }

  if (versionData) {
    if(versionData.dist.integrity){
      var integrity = versionData.dist.integrity
    } else {
      var integrity = ssri.fromHex(versionData.dist.shasum, 'sha1').toString()
    }
    var res = await checkIntegrity(cid, integrity)
    if (res){
      // console.log('Downloaded', manager, name, version, 'from IPFS')
      await db.put(`cid:${manager}:${name}:${version}`, cid)
      return true
      // TODO announce on pubsub (maybe?)
    } else {
      console.log('Failed to download', manager, name, version, 'from IPFS', cid)
      return false
    }
  } else {
    console.log('Unknown version', manager, name, version)
    return false
  }
}

async function goVerify(name, version, cid) {
  var manager = 'go'
  // fetch checksum from sumdb
  var checksum = await go.fetchChecksum(name, version)

  if(!checksum){
    console.log('Unknown version', manager, name, version)
    return false
  }

  // calculate checksum of cid
  var integrity = await goDigest(version, cid)

  // compare integrity with checksum
  if(checksum === integrity){
    await db.put(`cid:${manager}:${name}:${version}`, cid)
    return true
  } else {
    console.log('Failed to download', manager, name, version, 'from IPFS', cid)
    return false
  }
}

async function setTarballSize(manager, name, version) {
  var cid = await db.get(`cid:${manager}:${name}:${version}`)
  const { size } = await ipfs.files.stat(`/ipfs/${cid}`)
  await db.put(`size:${manager}:${name}:${version}`, size)
  return size
}

async function getTarballSize(manager, name, version) {
  await db.get(`size:${manager}:${name}:${version}`)
}

async function loadMetadata(manager, name) {
    try {
      var json = await db.get(`pkg:${manager}:${name}`)
    } catch (e) {
      var json = false
    }

  if(json){
    // console.log('Loading metadata for', manager, name, 'from cache')
    return JSON.parse(json)
  } else {
    console.log('Loading metadata for', manager, name, 'from registry')
    return await loadMetadataFromRegistry(manager, name)
  }
}

// has npm specific code
async function fetchMetadata(manager, name) {
  url = "http://registry.npmjs.org/" + name
  const response = await fetch(url);
  if (response.ok) {
    return await response.json();
  } else {
    return false
  }
}

// has npm specific code
async function loadMetadataFromRegistry(manager, name) {
  try{
    const json = await fetchMetadata(manager, name)
    if(!json) { return false }
    await db.put(`pkg:${manager}:${name}`, JSON.stringify(json))
    return json
  } catch(e) {
    console.error("loadMetadataFromRegistry error", manager, name, e)
    return false
  }
}

async function updateMetadata(manager, name) {
  try{
    const json = await fetchMetadata(manager, name);

    try {
      var existingJson = await db.get(`pkg:${manager}:${name}`)
    } catch(e) {
      var existingJson = ''
    }

    if (JSON.stringify(json) !== existingJson) {
      console.log('Updating', manager, name)
      await db.put(`pkg:${manager}:${name}`, JSON.stringify(json))
      return json
    } else {
      return false
    }
  } catch(e) {
    return console.error("fetchMetadata error", manager, name, e)
  }
}

// has npm specific code
async function checkIntegrity(cid, integrity) {
  var sha = ssri.parse(integrity)
  const responseStream = toStream.readable((async function * () {
    for await (const chunk of ipfs.cat(cid)) { // cid can't be null here
      yield chunk.slice()
    }
  })())

  var sri = await ssri.fromStream(responseStream, {algorithms: ['sha1', 'sha512']})
  return !!sri.match(sha)
}

async function tarballHandler(name, contentType, cid, req, res) {
  const { size } = await ipfs.files.stat(`/ipfs/${cid}`)
  const { source } = await detectContentType(name, ipfs.cat(cid)) // TODO don't bother detecting contentType here, it's not reliable
  const responseStream = toStream.readable((async function * () {
    for await (const chunk of source) {
      yield chunk.slice()
    }
  })())
  res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': size });
  responseStream.pipe(res)
}

async function validate(manager, name, version) {
  try{
    const cid = await db.get(`cid:${manager}:${name}:${version}`)

    if(manager === 'npm'){
      return await npmVerify(name, version, cid)
    } else if (manager === 'go'){
      return await goVerify(name, version, cid)
    } else {
      console.log('Unknown manager:', manager)
    }
  } catch(e) {
    return false
  }
}

async function setupWatcher(callback) {
  setupNpmWatcher(callback)
  setupGoWatcher(callback)
}

function setupNpmWatcher(callback) {
  const ChangesStream = require("@npmcorp/changes-stream");
  const changes = new ChangesStream({
    db: 'https://replicate.npmjs.com/registry',
    include_docs: true,
    since: 'now'
  });
  changes.on('data', function(change) { callback('npm', change) })
}

async function setupGoWatcher(callback) {
  checkGoPackages(callback)
  setInterval(async function(){
    checkGoPackages(callback)
  }, 60000)
}

async function checkGoPackages(callback) {
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
}

async function watchNpmImporter(change) {
  try{
    var versionNumber = npm.getLatestVersion(change.doc)
    var version = change.doc.versions[versionNumber]
    var name = change.doc.name

    try {
      exists = await db.get(`cid:npm:${name}:${versionNumber}`)
    } catch (e) {
      exists = false
    }

    if(exists) {
      // duplicate change from stream
    } else {
      console.log('New release:', 'npm', name, versionNumber)
      addUrltoIPFS('npm', name, versionNumber, version.dist.tarball)
      loadMetadata('npm', name)
    }
  } catch(e){
    // invalid
  }
}

async function watchGoImporter(change) {
  var name = change.Path.toLowerCase()
  var version = change.Version.toLowerCase() // TODO need to do the proper gomod lower casing
  try {
    exists = await db.get(`cid:go:${name}:${version}`)
  } catch (e) {
    exists = false
  }

  if(exists) {
    // duplicate change from stream
  } else {
    console.log('New release:', 'go', name, version)
    fetchGoVersionsList(name)
    fetchGoLatest(name)
    loadGoInfo(name, version)
    loadGoMod(name, version)
    downloadGoPackageFromRegistry(name, version)
  }
}

async function watchAll() {
  console.log('Watching for new upstream releases for all packages')
  setupWatcher(function(manager, change) {
    if(manager === 'npm'){
      if(change.doc.name){ watchNpmImporter(change) }
    }

    if(manager === 'go'){
      watchGoImporter(change)
    }
  })
}

async function watchKnown() {
  console.log('Watching for new upstream releases for cached packages')
  setupWatcher(async function(manager, change) {
    if(manager === 'npm'){
      const name = change.doc.name
      if(name){
        try {
          var known = await db.get(`pkg:${manager}:${name}`)
          if(known){
            watchNpmImporter(change)
          }
        } catch(e){
          // ignore packages we haven't already downloaded
        }
      }
    }

    if(manager === 'go'){
      var name = change.Path.toLowerCase() // TODO need to do the proper gomod lower casing
      try {
        var known = await db.get(`pkg:${manager}:${name}`)
        if(known){
          watchGoImporter(manager, change)
        }
      } catch(e){
        // ignore packages we haven't already downloaded
      }
    }
  })
}

async function removePackage(manager, name, version) {
  await db.del(`cid:${manager}:${name}:${version}`)
}

function filteredReadStream(start) {
  return db.createReadStream({gte: start, lt: start+ '~'})
}

async function metadataHandler(name, req, res) {
  // TODO handle etags and 304 requests
  // TODO handle npm minimal metadata requests
  // TODO should probably move saving metadata from res in ProxyRes so it handles private modules
  const json = await loadMetadata('npm', name)

  res.writeHead(200, {"Content-Type": "application/json"});
  res.end(JSON.stringify(json));
}

async function loadGoVersionsList(name) {
  try {
    var versions = await db.get(`pkg:go:${name}`)
  } catch (e) {
    var versions = false
  }

  if(versions){
    return versions
  } else {
    return await fetchGoVersionsList(name)
  }
}

async function fetchGoVersionsList(name) {
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

async function loadGoMod(name, version) {
  var versionList = await loadGoVersionsList(name)
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

async function loadGoInfo(name, version) {
  var versionList = await loadGoVersionsList(name)
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

async function loadGoLatest(name) {
  var versionList = await loadGoVersionsList(name)
  // TODO return the latest from versionList

  try {
    var info = await db.get(`latest:go:${name}`)
  } catch (e) {
    var info = false
  }

  if(info){
    return JSON.parse(info)
  } else {
    return await fetchGoLatest(name)
  }
}

async function fetchGoLatest(name) {
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

async function getCID(manager, name, version) {
  await db.get(`cid:${manager}:${name}:${version}`)
}

async function goDigest(version, cid) {
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

async function update(manager, name) {
  if (manager === 'npm'){
    var update = await updateMetadata('npm', name)
    if (update) {
      var newestVersion = npm.getLatestVersion(update)
      await downloadPackageFromRegistry('npm', name, newestVersion)
    } else {
      return
    }
  } else if (manager === 'go'){
    var versions = await db.get(`pkg:${manager}:${name}`)
    var newversions = await fetchGoVersionsList(name)

    match = versions === newversions
    if (match){
      return
    } else {
      var latest = await fetchGoLatest(name)
      var version = latest.Version
      await loadGoInfo(name, version)
      await loadGoMod(name, version)
      await downloadGoPackageFromRegistry(name, version)
      return true
    }
  }
}

module.exports = {
  go,
  npm,
  subscribePackageAnnoucements,
  unsubscribePackageAnnoucements,
  addUrltoIPFS,
  downloadPackageFromIPFS,
  downloadPackageFromRegistry,
  listPackages,
  listPackageNames,
  checkIntegrity,
  loadMetadata,
  reset,
  loadMetadataFromRegistry,
  tarballHandler,
  metadataHandler,
  validate,
  connectIPFS,
  watchKnown,
  watchAll,
  updateMetadata,
  removePackage,
  closeDB,
  version,
  setTarballSize,
  getTarballSize,
  filteredReadStream,
  connectDB,
  loadGoVersionsList,
  loadGoInfo,
  loadGoMod,
  loadGoLatest,
  goDigest,
  getCID,
  goVerify,
  update,
  downloadGoPackageFromRegistry
}
