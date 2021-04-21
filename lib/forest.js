const uint8ArrayToString = require('uint8arrays/to-string')
const IpfsHttpClient = require('ipfs-http-client')
const { urlSource } = IpfsHttpClient
const ipfs = IpfsHttpClient()
const pipe = require('it-pipe')
const toIterable = require('stream-to-it')

const debug = require('debug')('forest')

const core = require('./managers/core')
const npm = require('./managers/npm')
const go = require('./managers/go')
const managers = { npm, go }

const envPaths = require('env-paths');
const level = require('level-party')
var db

const packageAnnoucementsTopic = 'forest'

var ipfsID = undefined;

function connectDB(name = 'forest') {
  const paths = envPaths(name);
  return db = level(paths.data)
}

async function reset() {
  db = connectDB()
  await db.clear()
  await db.close()
}

function concurrency() {
  return core.concurrency
}

async function connectIPFS(db){
  try{
    ipfsID = await ipfs.id()
    console.log('Connected to IPFS')
    await core.dialPeers(db, packageAnnoucementsTopic)
    return ipfsID;
  } catch {
    try{
      var ipfsd = await core.startIPFS()
      ipfsID = await ipfsd.api.id()
      await core.dialPeers(db, packageAnnoucementsTopic)
      return ipfsID;
    } catch(e){
      console.log('ERROR', e)
      console.error('ERROR: Could not connect to or start IPFS')
      process.exit(1);
    }
  }
}

async function setConfig() {
  for (const [name, manager] of Object.entries(managers)) {
    manager.setConfig()
  }
}

async function unsetConfig(){
  for (const [name, manager] of Object.entries(managers)) {
    manager.unsetConfig()
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

  debug(msg.from, "republished", json.manager, json.name, json.version)

  // record each republish
  const time = new Date().getTime()
  await db.put(`repub:${json.manager}:${json.name}:${json.version}:${msg.from}`, time)

  try {
    var exists = await db.get(`pkg:${json.manager}:${json.name}`)
  } catch (e) {
    var exists = false
  }

  if (exists) {
    // known project

    try {
      var cid = await db.get(`cid:${json.manager}:${json.name}:${json.version}`)
    } catch (e) {
      var cid = false
    }

    if(cid){
      // already downloaded
      if (cid == json.cid) {
        // matching IPFS cid
        debug(json.manager, json.name, json.version, 'as', json.cid, 'matches existing local copy')
      } else {
        debug('WARNING', json.manager, json.name, json.version, 'as', json.cid, 'does not match existing local copy')
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
    await core.savePeers(db, packageAnnoucementsTopic)
  } catch(e) {
    console.error(`Failed to subscribe to '${packageAnnoucementsTopic}' pubsub topic`)
    console.log("IPFS experimental pubsub feature not enabled. Run daemon with --enable-pubsub-experiment")
    console.log(e)
  }
}

async function seed(msg){
  if (ipfsID.id === msg.from) { return } // ignore our own announcements

  var string = uint8ArrayToString(msg.data)
  var json = JSON.parse(string);
  debug(msg.from, "republished", json.manager, json.name, json.version, "... seeding");

  const time = new Date().getTime()
  await db.put(`repub:${json.manager}:${json.name}:${json.version}:${msg.from}`, time)

  await importPackage(json.manager, json.name, json.version, json.url) // optional cid (json.cid)
}

async function importLatest(manager, name) {
  return await managers[manager].importLatest(db, name)
}

async function importPackage(manager, name, version, url) {
  return await managers[manager].importPackage(db, name, version, url)
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
    var key = `pkg:${manager}:`
  } else {
    var key = `pkg:`
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
    var existing_cid = await db.get(`cid:${manager}:${name}:${version}`)
  } catch (e) {
    var existing_cid = false
  }

  if (existing_cid === cid){
    debug('Already downloaded', manager, name, version, 'from IPFS')
    return
  }

  return await managers[manager].verify(db, name, version, cid)
}

async function validate(manager, name, version) {
  try{
    const cid = await db.get(`cid:${manager}:${name}:${version}`)

    return await managers[manager].verify(db, name, version, cid)
  } catch(e) {
    console.error(e)
    return false
  }
}

async function setupWatcher(callback) {
  for (const [name, manager] of Object.entries(managers)) {
    manager.setupWatcher(callback)
  }
}

async function watchAll() {
  console.log('Watching for new upstream releases for all packages')
  setupWatcher(function(manager, change) {
    managers[manager].watchImporter(db, change)
  })
}

async function watchKnown() {
  console.log('Watching for new upstream releases for cached packages')
  setupWatcher(async function(manager, change) {
    managers[manager].watchKnown(db, change)
  })
}

async function removePackage(manager, name, version) {
  // TODO also remove from ipfs
  await db.del(`cid:${manager}:${name}:${version}`)
}

async function update(manager, name) {
  return await managers[manager].updatePackage(db, name)
}

async function search(query) {
  // TODO allow filtering by manager
  var names = await listPackageNames()
  return names.filter(function (pkg) { return pkg.name.indexOf(query) > -1; });
}

module.exports = {
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
  importPackage,
  importLatest,
  concurrency,
  managers,
  setConfig,
  unsetConfig
}
