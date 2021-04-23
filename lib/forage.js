const uint8ArrayToString = require('uint8arrays/to-string')
const IpfsHttpClient = require('ipfs-http-client')
const ipfs = IpfsHttpClient()
const async = require('async');

const debug = require('debug')('forage')

const core = require('./core')

const fs = require('fs');
const path = require('path');

const managersDirectory = path.join(__dirname, 'managers')
const managers = { }

fs.readdirSync(managersDirectory).forEach(file => {
  var name = file.split('.')[0]
  managers[name] = require(`./managers/${name}`)
});

const envPaths = require('env-paths');
const level = require('level-party')
var db

const packageAnnoucementsTopic = 'forage'

var ipfsID = undefined;

function connectDB(name = 'forage') {
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
    subscribePackageAnnoucements()
    await core.dialPeers(db, ipfsID, packageAnnoucementsTopic)
    return ipfsID;
  } catch {
    try{
      var ipfsd = await core.startIPFS()
      subscribePackageAnnoucements()
      ipfsID = await ipfsd.api.id()
      await core.dialPeers(db, ipfsID, packageAnnoucementsTopic)
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

  if (ipfsID.id === msg.from) { return false } // ignore our own announcements

  var action = json.action
  var package = json.package

  debug('pubsub', msg.from, action, package)

  if(action == 'want'){
    try {
      var cid = await db.get(`cid:${package.manager}:${package.name}:${package.version}`)
      await core.announceHave(db, package.manager, package.name, package.version, cid)
    } catch (e) {
      return false
    }
  }

  if(action == 'have'){
    debug("Recording 'have':", package.manager, package.name, package.version, package.cid)
    // TODO store which peer announced the have
    await db.put(`have:${package.manager}:${package.name}:${package.version}`, package.cid)
    return package.cid
  }

  if(action == 'republish'){
    // record each republish
    var time = new Date().getTime()
    await db.put(`repub:${package.manager}:${package.name}:${package.version}:${msg.from}`, time)

    try {
      var exists = await db.get(`pkg:${package.manager}:${package.name}`)
    } catch (e) {
      var exists = false
    }

    if (exists) {
      // known project
      try {
        var cid = await db.get(`cid:${package.manager}:${package.name}:${package.version}`)
      } catch (e) {
        var cid = false
      }

      if(cid){
        // already downloaded
        if (cid == package.cid) {
          // matching IPFS cid
          debug(package.manager, package.name, package.version, 'as', package.cid, 'matches existing local copy')
          return cid
        } else {
          debug('WARNING', package.manager, package.name, package.version, 'as', package.cid, 'does not match existing local copy')
          return false
        }
      } else {
        return await downloadPackageFromIPFS(package.manager, package.name, package.version, package.cid)
      }
    } else {
      return false
    }
  } else {
    return false
  }
}

async function subscribePackageAnnoucements(receiveMsg = defaultAnnounceCb) {
  try {
    await ipfs.pubsub.subscribe(packageAnnoucementsTopic, receiveMsg)
    debug(`Subscribed to '${packageAnnoucementsTopic}' pubsub topic`)
    await core.savePeers(db, packageAnnoucementsTopic)
  } catch(e) {
    console.error(`Failed to subscribe to '${packageAnnoucementsTopic}' pubsub topic`)
    console.log("IPFS experimental pubsub feature not enabled. Run daemon with --enable-pubsub-experiment")
    console.log(e)
  }
}

async function seed(msg){
  if (ipfsID.id === msg.from) { return false } // ignore our own announcements

  var string = uint8ArrayToString(msg.data)
  var json = JSON.parse(string);

  var action = json.action
  var package = json.package

  debug('pubsub', msg.from, action, package)

  if(action == 'want'){
    try {
      var cid = await db.get(`cid:${package.manager}:${package.name}:${package.version}`)
      await core.announceHave(db, package.manager, package.name, package.version, cid)
    } catch (e) {
      return false
    }
  }

  if(action == 'have'){
    debug("Recording 'have':", package.manager, package.name, package.version, package.cid)
    // TODO store which peer announced the have
    await db.put(`have:${package.manager}:${package.name}:${package.version}`, package.cid)
    return package.cid
  }

  if(action == 'republish'){
    const time = new Date().getTime()
    await db.put(`repub:${package.manager}:${package.name}:${package.version}:${msg.from}`, time)

    return await importPackage(package.manager, package.name, package.version, package.url) // optional cid (package.cid)
  } else {
    return false
  }
}

async function importLatest(manager, name) {
  return await managers[manager].importLatest(db, name)
}

async function importPackage(manager, name, version, url) {
  try {
    var exists = await db.get(`cid:${manager}:${name}:${version}`)
    debug(manager, name, version, 'already imported')
    return exists
  } catch (e) {
    var wantedCid = await core.announceWant(db, manager, name, version, url)
    return await managers[manager].importPackage(db, name, version, url, wantedCid)
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

async function updateAll(callback){
  // TODO allow filtering by manager
  var q = async.queue(async function(task) {
    var pkg = task.pkg
    var callback = task.callback
    debug('Checking for update', task.pkg)
    var res = await update(pkg.manager, pkg.name)
    callback(pkg, res)
  }, core.concurrency)

  var packages = await listPackageNames()

  packages.forEach(async function(pkg) {
    q.push({pkg, callback});
  });

  await q.drain()
  debug('Finished updating')
}

async function periodicUpdate(interval = (60*60*1000)) {
  debug(`Setting up periodic update every ${interval}ms`)
  setInterval(function () {
    debug('Starting periodic update')
    updateAll(function() {})
  }, interval);
  updateAll(function() {})
}

async function search(query) {
  // TODO allow filtering by manager
  var names = await listPackageNames()
  return names.filter(function (pkg) { return pkg.name.indexOf(query) > -1; });
}

module.exports = {
  core,

  update,
  updateAll,
  periodicUpdate,
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
