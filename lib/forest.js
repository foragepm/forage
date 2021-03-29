const uint8ArrayToString = require('uint8arrays/to-string')
const IpfsHttpClient = require('ipfs-http-client')
const { urlSource } = IpfsHttpClient
const ipfs = IpfsHttpClient()
const pipe = require('it-pipe')
const toIterable = require('stream-to-it')

const tmp = require('tmp-promise');
const {zipDigest, zipManifest} = require('./zip_digest');
var JSZip = require("jszip");

const core = require('./managers/core')
const npm = require('./managers/npm')
const go = require('./managers/go')

const envPaths = require('env-paths');
const level = require('level-party')
const paths = envPaths('forest');
var db

const packageAnnoucementsTopic = 'forest'

var ipfsID = undefined;

function connectDB() {
  return db = level(paths.data)
}

async function reset() {
  db = connectDB()
  await db.clear()
  await db.close()
}

async function connectIPFS(db){
  try{
    ipfsID = await ipfs.id()
    console.log('Connected to IPFS')
    core.dialPeers(db)
    return ipfsID;
  } catch {
    try{
      var ipfsd = await core.startIPFS()
      ipfsID = await ipfsd.api.id()
      core.dialPeers(db)
      return ipfsID;
    } catch(e){
      console.log('ERROR', e)
      console.error('ERROR: Could not connect to or start IPFS')
      process.exit(1);
    }
  }
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

async function seed(msg){

  if (ipfsID.id === msg.from) { return } // ignore our own announcements

  var string = uint8ArrayToString(msg.data)
  var json = JSON.parse(string);
  console.log(msg.from, "republished", json.manager, json.name, json.version, "... seeding");

  const time = new Date().getTime()
  await db.put(`repub:${json.manager}:${json.name}:${json.version}:${msg.from}`, time)

  // TODO fallback to http if download from IPFS fails or times out
  downloadPackageFromIPFS(json.manager, json.name, json.version, json.cid);
  // core.addUrltoIPFS(db, json.manager, json.name, json.version, json.url)
}

async function importPackage(manager, name, version, url) {
  await fetchAndAddtoIPFS(manager, name, version, url)
}

async function fetchAndAddtoIPFS(manager, name, version, url) {
  var hashAlg = 'sha2-256'
  var possibleCID
  var cid
  var loaded = false

  // TODO allow passing in integrity from lockfile
  if(manager === 'npm'){
    // grab the integrity hash from the registry
    var meta = await core.loadVersionMetadata(db, manager, name, version)
    if(meta){
      var integrity = meta.dist.integrity
      if(integrity){
        var hashAlg = 'sha2-512'
        // guess the cid
        possibleCID = core.guessCID(integrity)
      }
    }
  }

  if(manager === 'go'){
    var integrity = await go.fetchChecksum(name, version)
    possibleCID = core.guessCID(`sha256-${integrity}`)
  }

  if(possibleCID){
    // attempt to load possibleCID via ipfs
    var file = await core.attemptIPFSLoad(possibleCID)

    if(file){
      // guessed CID was correct and loaded from ipfs
      if(manager === 'go'){
        metafileContent = file

        var lines = metafileContent.toString().trim().split("\n")

        // TODO this needs to be async
        // guess and load all the cids inside the metafile
        var subfiles = []

        for (var i in lines) {
          // console.log('enqueing', lines[i])
          var res = await go.addMetalineToIPFS(lines[i])
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
      } else {
        // TODO pin cid
        await db.put(`cid:${manager}:${name}:${version}`, possibleCID)
        cid = possibleCID
        loaded = true
      }
    }

    if(!loaded){
      // if files didn't load
      if(manager === 'go'){
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
        var cids = await go.addZipContentsToIPFS(zippath)

        await fs.remove(zippath)
        cid = zipCID
      } else {
        // load via url, add cid to db and announce over pubsub
        cid = await core.addUrltoIPFS(db, manager, name, version, url, hashAlg)
      }
    }

  } else {
    // regular url download (only old npms + other possible package managers)
    cid = await core.addUrltoIPFS(db, manager, name, version, url, hashAlg)
  }

  return cid
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

function listPackageNames(manager) {
  if(manager){
    var key = `cid:${manager}:`
  } else {
    var key = `cid:`
  }

  return new Promise((resolve, reject) => {
    var names = {}
    db.createKeyStream({gte: key, lt: key+'~'})
      .on('data', function (data) {
        var parts = data.split(':')
        names[`${parts[1]}-${parts[2]}`] = {manager: parts[1], name: parts[2]}
      })
      .on('end', function () {
        resolve(Object.values(names))
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
    return await npm.verify(db, name, version, cid)
  } else if (manager === 'go'){
    return await go.verify(db, name, version, cid)
  } else {
    console.log('Unknown manager:', manager)
  }
}

async function validate(manager, name, version) {
  try{
    const cid = await db.get(`cid:${manager}:${name}:${version}`)

    if(manager === 'npm'){
      return await npm.verify(db, name, version, cid)
    } else if (manager === 'go'){
      return await go.verify(db, name, version, cid)
    } else {
      console.log('Unknown manager:', manager)
    }
  } catch(e) {
    console.error(e)
    return false
  }
}

async function setupWatcher(callback) {
  npm.setupWatcher(callback)
  go.setupWatcher(callback)
}

async function watchAll() {
  console.log('Watching for new upstream releases for all packages')
  setupWatcher(function(manager, change) {
    if(manager === 'npm'){
      if(change.doc.name){ npm.watchImporter(db, change) }
    }

    if(manager === 'go'){
      go.watchImporter(db, change)
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
            npm.watchImporter(db, change)
          }
        } catch(e){
          // ignore packages we haven't already downloaded
        }
      }
    }

    if(manager === 'go'){
      var name = go.escape(change.Path)
      try {
        var known = await db.get(`pkg:${manager}:${name}`)
        if(known){
          go.watchImporter(db, change)
        }
      } catch(e){
        // ignore packages we haven't already downloaded
      }
    }
  })
}

async function removePackage(manager, name, version) {
  // TODO also remove from ipfs
  await db.del(`cid:${manager}:${name}:${version}`)
}

async function update(manager, name) {
  if (manager === 'npm'){
    var update = await core.updateMetadata(db, 'npm', name)
    if (update) {
      var newestVersion = npm.getLatestVersion(update)
      await fetchAndAddtoIPFS('npm', name, newestVersion, update['versions'][newestVersion].dist.tarball)
    } else {
      return
    }
  } else if (manager === 'go'){
    var versions = await db.get(`pkg:${manager}:${name}`)
    var newversions = await go.fetchVersionsList(db, name)

    match = versions === newversions
    if (match){
      return
    } else {
      var latest = await go.fetchLatest(db, name)
      var version = latest.Version
      await go.loadInfo(db, name, version)
      await go.loadMod(db, name, version)
      var url = `https://proxy.golang.org/${name}/@v/${version}.zip`
      await fetchAndAddtoIPFS('go', name, version, url)
      return true
    }
  }
}

async function search(query) {
  // TODO allow filtering by manager
  var names = await listPackageNames('npm')
  return names.filter(function (pkg) { return pkg.name.indexOf(query) > -1; });
}

module.exports = {
  go,
  npm,
  core,

  update,
  search,
  seed,
  removePackage,
  subscribePackageAnnoucements,
  reset,
  listPackages,
  listPackageNames,
  watchAll,
  watchKnown,
  validate,
  importPackage,
  packageAnnoucementsTopic,
  downloadPackageFromIPFS,
  connectIPFS,
  connectDB,
  fetchAndAddtoIPFS
}
