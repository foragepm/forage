const uint8ArrayToString = require('uint8arrays/to-string')
const { create } = require('ipfs-http-client')
const ipfs = create()
const async = require('async');

const log = require('electron-log');
log.catchErrors()

const core = require('./core')
const signing = require('./signing')

const fs = require('fs');
const path = require('path');

const managersDirectory = path.join(__dirname, 'managers')
const managers = { }

var notifier = require('./events.js')

fs.readdirSync(managersDirectory).forEach(file => {
  var name = file.split('.')[0]
  managers[name] = require(`./managers/${name}`)
});

const envPaths = require('env-paths');
const level = require('level-party')
var db

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

async function connectIPFS(db, topic = 'forage'){
  try{
    ipfsID = await ipfs.id()
    log.info('Connected to IPFS')
    subscribePackageAnnoucements(topic)
    await core.dialPeers(db, ipfsID, topic)
    return ipfsID;
  } catch {
    log.error("Couldn't connect to IPFS, attempting to start go-ipfs")
    try{
      var ipfsd = await core.startIPFS()
      subscribePackageAnnoucements(topic)
      ipfsID = await ipfsd.api.id()
      await core.dialPeers(db, ipfsID, topic)
      return ipfsID;
    } catch(e){
      log.info('ERROR', e)
      log.error('ERROR: Could not connect to or start IPFS')
      process.exit(1);
    }
  }
}

async function setConfig(port) {
  for (const [name, manager] of Object.entries(managers)) {
    manager.setConfig(port)
  }
}

async function unsetConfig(){
  for (const [name, manager] of Object.entries(managers)) {
    manager.unsetConfig()
  }
}

notifier.on('imported', async (data) => {
  await announceHave(data.manager, data.name, data.version, data.cid)
})

notifier.on('have', async (data) => {
  return await respondToHave(db, data.peerId, data.package, data.metadata)
})

notifier.on('want', async (data) => {
  await respondToWant(data.peerId, data.package)
})

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

  log.info('pubsub', msg.from, `'${action}'`, package.manager, package.name)

  if(action == 'want'){
    notifier.emit('want', {peerID: msg.from, package: package})
  }

  if(action == 'have'){
    var signature = json.metadata

    var trusted = await signing.trusted(db, signature)

    if(trusted){
      log.info('Metadata for', package.manager, package.name, 'trusted')
      var metadata = signing.decode(signature.payload)
    } else {
      var metadata = false
    }

    notifier.emit('have', {peerID: msg.from, package: package, metadata: metadata})
  }
  return action
}

async function subscribePackageAnnoucements(topic) {
  try {
    await ipfs.pubsub.subscribe(topic, defaultAnnounceCb)
    log.info(`Subscribed to '${topic}' pubsub topic`)
    await core.savePeers(db, topic)
  } catch(e) {
    log.error(`Failed to subscribe to '${topic}' pubsub topic`)
    log.info("IPFS experimental pubsub feature not enabled. Run daemon with --enable-pubsub-experiment")
    log.info(e)
  }
}

async function respondToHave(db, peerId, package, metadata) {
  log.info("Recording 'have':", package.manager, package.name, package.version, package.cid)
  // TODO store which peer announced the have
  await db.put(`have:${package.manager}:${package.name}:${package.version}`, package.cid)

  try {
    var exists = await db.get(`response:${package.manager}:versions:${package.name}`)
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

    if(metadata){
      var keys = await importMetadata(package.manager, package.name, metadata)
    }

    if(cid){
      // already downloaded
      if (cid == package.cid) {
        // matching IPFS cid
        return cid
      } else {
        log.error('WARNING', package.manager, package.name, package.version, 'as', package.cid, 'does not match existing local copy')
        return false
      }
    } else {
      return await downloadPackageFromIPFS(package.manager, package.name, package.version, package.cid)
    }
  } else {
    return false
  }
}

async function seed(msg){
  notifier.on('have', async (data) => {
    if (ipfsID.id === data.peerId) { return false } // ignore our own announcements

    var package = data.package

    return await importPackage(package.manager, package.name, package.version, package.url, package.cid)
  })
}

async function importLatest(manager, name) {
  return await managers[manager].importLatest(db, name)
}

async function importPackage(manager, name, version, url) {
  try {
    var exists = await db.get(`cid:${manager}:${name}:${version}`)
    log.debug(manager, name, version, 'already imported')
    return exists
  } catch (e) {
    var wantedCid = await core.announceWant(db, manager, name, version, url)
    return await managers[manager].importPackage(db, name, version, url, wantedCid)
  }
}

async function importMetadata(manager, name, metadata) {
  return await managers[manager].importMetadata(db, name, metadata)
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
    var key = `response:${manager}:versions:`
  } else {
    var key = `response:`
  }

  return new Promise((resolve, reject) => {
    var names = {}
    db.createKeyStream({gte: key, lt: key+'~'})
      .on('data', function (data) {
        var parts = data.split(':')
        if(manager){
          names[`${parts[1]}-${parts[3]}`] = {manager: parts[1], name: parts[3]}
        } else {
          if(parts[2] == 'versions'){
            names[`${parts[1]}-${parts[3]}`] = {manager: parts[1], name: parts[3]}
          }
        }
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
    log.info('Already downloaded', manager, name, version, 'from IPFS')
    return
  }

  return await managers[manager].verify(db, name, version, cid)
}

async function validate(manager, name, version) {
  try{
    const cid = await db.get(`cid:${manager}:${name}:${version}`)

    return await managers[manager].verify(db, name, version, cid)
  } catch(e) {
    log.error(e)
    return false
  }
}

async function setupWatcher(callback) {
  for (const [name, manager] of Object.entries(managers)) {
    manager.setupWatcher(callback)
  }
}

async function watchAll() {
  log.info('Watching for new upstream releases for all packages')
  setupWatcher(function(manager, change) {
    managers[manager].watchImporter(db, change)
  })
}

async function watchKnown() {
  log.info('Watching for new upstream releases for cached packages')
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

async function downloadVersion(manager, name, version) {
  return await managers[manager].downloadVersion(db, name, version)
}

async function updateAll(callback){
  // TODO allow filtering by manager
  var q = async.queue(async function(task) {
    var pkg = task.pkg
    var callback = task.callback
    log.info('Checking for update', task.pkg)
    var res = await update(pkg.manager, pkg.name)
    callback(pkg, res)
  }, core.concurrency)

  var packages = await listPackageNames()

  packages.forEach(async function(pkg) {
    q.push({pkg, callback});
  });

  await q.drain()
  log.info('Finished updating')
}

async function periodicUpdate(interval = (60*10*1000)) {
  log.info(`Setting up periodic update every ${interval}ms`)
  setInterval(function () {
    log.info('Starting periodic update')
    updateAll(function() {})
  }, interval);
}

async function search(query) {
  // TODO allow filtering by manager
  var names = await listPackages()
  return names.filter(function (pkg) { return pkg.name.indexOf(query) > -1; });
}

async function packageAsJson(manager, name) {
  return managers[manager].packageAsJson(db, name)
}

async function respondToWant(peerId, package) {
  try {
    var cid = await db.get(`cid:${package.manager}:${package.name}:${package.version}`)
    if(cid){ await announceHave(package.manager, package.name, package.version, cid) }
  } catch (e) {
    return false
  }
}

async function announceHave(manager, name, version, cid) {
  log.info("pubsub 'have':", manager, name, version)

  var payload = await packageAsJson(manager, name)
  var signature = await signing.signWithPrivateKey(db, JSON.stringify(payload))

  var json = {
    action: 'have',
    forage: core.forageVersion(),
    metadata: signature,
    package: {
      manager: manager,
      name: name,
      version: version,
      cid: cid
    }
  }

  await ipfs.pubsub.publish('forage', JSON.stringify(json))

  return json
}

async function importLock(db, path) {
  if (fs.existsSync(path)) {
    const forageLock = JSON.parse(fs.readFileSync(path, 'utf8'));

    var q = async.queue(async function(task) {
      var parts = task.pkg.split(':')
      await downloadPackageFromIPFS(parts[0], parts[1], parts[2], task.cid)
    }, concurrency())

    await Promise.all(Object.entries(forageLock).map(async (arr) => {
      q.push({pkg: arr[0], cid: arr[1]});
    }));

    await q.drain()

    return forageLock
  } else {
    log.error(`no file found at: ${path}`)
    return false
  }
}

async function republish(path) {
  var cids = {}

  var q = async.queue(async function(task) {
    const name = task.name
    const pkg = task.pkg
    var manager = task.manager

    console.log('Republishing', manager, name, pkg.version)

    if(pkg.resolved){
      var cid = await importPackage(manager, name, pkg.version, pkg.resolved)
      if(cid) { cids[`${manager}:${name}:${pkg.version}`] = cid }
    } else {
      console.log("URL missing for", manager, name, pkg.version)
    }
  }, concurrency())

  q.error(function(err, task) {
    console.error("Failed to import", task, err);
  });

  // TODO accept file argument

  for (const [name, manager] of Object.entries(managers)) {
    if(manager.lockfileExists()){
      const pkgs = await manager.readLockfile(manager.lockfileName())
      pkgs.forEach(function(pkg) {
        q.push({manager: pkg.manager, name: pkg.name, pkg: pkg});
      });
    }
  }

  await q.drain()

  if(Object.keys(cids).length > 0){
    JSON.stringify(cids, Object.keys(cids).sort(), 2);
    fs.writeFileSync(path, JSON.stringify(cids, Object.keys(cids).sort(), 2), 'utf8')
  }
  return cids
}

module.exports = {
  core,
  signing,

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
  downloadPackageFromIPFS,
  connectIPFS,
  connectDB,
  importPackage,
  importLatest,
  importLock,
  concurrency,
  managers,
  setConfig,
  unsetConfig,
  packageAsJson,
  announceHave,
  defaultAnnounceCb,
  downloadVersion,
  republish
}
