const fetch = require('node-fetch')
const AbortController = require('abort-controller');
const uint8ArrayConcat = require('uint8arrays/concat')
const all = require('it-all')

const IpfsHttpClient = require('ipfs-http-client')
const { urlSource } = IpfsHttpClient
const ipfs = IpfsHttpClient()
const toStream = require('it-to-stream')

const fs = require('fs-extra');
const path = require('path');

const multihash = require('multihashes')
const ssri = require('ssri')
const CID = require('cids')

const log = require('electron-log');
log.catchErrors()

const concurrency = 20

async function saveCid(db, manager, name, version, cid) {
  await db.put(`cid:${manager}:${name}:${version}`, cid)
}

async function tarballHandler(name, contentType, cid, req, res) {
  const { size } = await ipfs.files.stat(`/ipfs/${cid}`)
  const source  = await ipfs.cat(cid)
  const responseStream = toStream.readable((async function * () {
    for await (const chunk of source) {
      yield chunk.slice()
    }
  })())
  res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': size });
  return responseStream.pipe(res)
}

async function addUrltoIPFS(db, manager, name, version, url, hashAlg = 'sha2-256'){
  try {
    var exists = await db.get(`cid:${manager}:${name}:${version}`)
  } catch (e) {
    var exists = false
  }

  if (exists) { return exists }

  try {
    const cid = await ipfsAdd(urlSource(url), hashAlg)
    if(cid){
      log.info(`IPFS add ${url} (${cid})`)

      await saveVersion(db, manager, name, version, url, cid)

      return cid
    } else {
      log.error('error in ipfs add', url)
      return false
    }
  } catch(e) {
    log.error('error in ipfs add', url)
    log.info(e)
    return false
  }
}

async function saveVersion(db, manager, name, version, url, cid) {
  try {
    var exists = await db.get(`cid:${manager}:${name}:${version}`)
    return exists
  } catch (e) {
    var exists = false
  }

  await saveCid(db, manager, name, version, cid)
  var size = await setTarballSize(db, manager, name, version) // TODO can use the size from ipfsAdd

  try {
    log.info("pubsub 'republish':", manager, name, version)
    await ipfs.pubsub.publish('forage', JSON.stringify({
      action: 'republish',
      forage: forageVersion(),
      package: {
        url: url,
        manager: manager,
        name: name,
        version: version,
        cid: cid,
        size: size
      }
    }))
  } catch(e) {
    log.info('Failed to announce', manager, name, version, 'over pubsub')
    log.info(e)
  }

  return true
}

async function ipfsAdd(data, hashAlg = 'sha2-256') {
  try{
    var res = await ipfs.add(data, {chunker: 'size-1048576', rawLeaves: true, hashAlg: hashAlg, cidVersion: 1, timeout: 10000})
    return res.cid.toString()
  } catch(e){
    log.error('IPFS add failed')
    log.error(e)
    return false
  }
}

async function setTarballSize(db, manager, name, version) {
  var cid = await db.get(`cid:${manager}:${name}:${version}`)
  const { size } = await ipfs.files.stat(`/ipfs/${cid}`)
  await db.put(`size:${manager}:${name}:${version}`, size)
  return size
}

async function fetchWithTimeout(url, timeout = 10000) {
  var controller = new AbortController();
  var timeout = setTimeout(() => {
    log.info(`Timeout loading from URL (${url})`)
    controller.abort();
  }, timeout);

  var res = await fetch(url, {signal: controller.signal});
  clearTimeout(timeout)
  if(res.ok){
    return res
  } else {
    log.error('fetch error', res.status, res.statusText, `(${url})`)
    return false
  }
}

async function attemptIPFSLoad(cid, timeout = 10000){
  try{
    return uint8ArrayConcat(await all(ipfs.cat(cid, {timeout: timeout})))
  } catch(e){
    log.error('Failed to load' + cid + 'from IPFS')
    return false
  }
}

async function startIPFS() {
  log.info('Starting IPFS')

  const Ctl = require('ipfsd-ctl');

  var disposable = process.env.CI ? true : false

  const ipfsd = await Ctl.createController({
      disposable: disposable,
      args: '--enable-pubsub-experiment',
      ipfsHttpModule: require('ipfs-http-client'),
      ipfsBin: require('go-ipfs').path().replace('app.asar', 'app.asar.unpacked'),
      test: false,
      remote: false
  })

  try {
    await ipfsd.start()
    log.info('Started IPFS')
    const id = await ipfsd.api.id()
    return ipfsd
 } catch (err) {
   log.error('Removing existing ipfs api file')
   fs.removeSync(path.join(ipfsd.path, 'api'))
   await ipfsd.start()
   log.info('Started IPFS')
   const id = await ipfsd.api.id()
   return ipfsd
 }
}

function guessCID(integrity) {
  var sha = ssri.parse(integrity, {single: true})
  if (sha.algorithm === 'sha512'){
    var mhash = multihash.fromHexString('1340' + sha.hexDigest())
    return new CID(1, 'raw', mhash).toString()
  } else if (sha.algorithm === 'sha256'){
    var mhash = multihash.fromHexString('1220' + sha.hexDigest())
    return new CID(1, 'raw', mhash).toString()
  } else {
    return false
  }
}

var packageJson = require('../package.json');

function forageVersion() {
  return packageJson.version
}

async function unsubscribePackageAnnoucements(packageAnnoucementsTopic) {
  await ipfs.pubsub.unsubscribe(packageAnnoucementsTopic)
  log.info(`Unsubscribed from '${packageAnnoucementsTopic}' pubsub topic`)
}

async function exportPackages(db) {
  await ipfs.files.rm('/forage/export', { recursive: true })
  await ipfs.files.mkdir('/forage/export', {parents: true})

  var loadpkgs = new Promise((resolve, reject) => {
    var key = "cid:"
    var pkgs = []
    db.createReadStream({gte: key, lt: key+'~'})
      .on('data', function (data) {
        var parts = data.key.split(':')
        var cid = data.value
        pkgs.push({manager: parts[1], name: parts[2], version: parts[3], cid: cid})
      })
      .on('end', function () {
        resolve(pkgs.sort())
      })
  })
  var packages = await loadpkgs

  for (const pkg of packages) {
    log.info('Exporting', pkg.manager, pkg.name, pkg.version)
    try{
      await ipfs.files.mkdir(`/forage/export/${pkg.manager}/${pkg.name}`, {parents: true})
    } catch(e) {
      // folder already exists
    }

    try{
      var extension = pkg.manager === 'go' ? 'zip' : 'gzip'
      await ipfs.files.cp(`/ipfs/${pkg.cid}`, `/forage/export/${pkg.manager}/${pkg.name}/${pkg.version}.${extension}`) // todo gzip or zip
    } catch(e){
      // failed to add file
    }
  }

  // return root cid of mfs dir
  return await ipfs.files.stat('/forage/export')
}

function listPeers(db, self) {
  return new Promise((resolve, reject) => {
    var names = []
    db.createKeyStream({gte: 'repub:', lt: 'repub:~'})
      .on('data', function (data) {
        var parts = data.split(':')
        if(parts[4] !== self){ names.push(parts[4]) }
      })
      .on('end', function () {
        resolve( [...new Set(names)])
      })
  })
}

async function dialPeers(db, self, topic) {
  listPeers(db, self).then(async function(peers) {
    peers.forEach(async function(peer) {
      try {
        log.info('dialing', peer)
        await ipfs.swarm.connect(`/p2p/${peer}`)
      } catch (e) {
        // couldn't find peer, nbd
      }
    });
  }).then(async function() {
    var peerIds = await activePeers(topic)
    log.info(`${peerIds.length} peer${peerIds.length === 1 ? "" : "s"} online`)
  })
}

function filteredReadStream(db, start) {
  return db.createReadStream({gte: start, lt: start+ '~'})
}

async function activePeers(topic = 'forage') {
  return await ipfs.pubsub.peers(topic)
}

async function savePeers(db, topic) {
  var peerIds = await activePeers(topic)
  peerIds.forEach(async function(peerId) {
    await db.put(`peer:${peerId}`, true)
  });
}

function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function announceWant(db, manager, name, version, url) {
  try{
    var cid = await db.get(`have:${manager}:${name}:${version}`)

    if(cid) {
      log.info("existing have for", manager, name, version)
      return cid
    }
  } catch {}

  log.info("pubsub 'want':", manager, name, version)
  await ipfs.pubsub.publish('forage', JSON.stringify({
    action: 'want',
    forage: forageVersion(),
    package: {
      manager: manager,
      name: name,
      version: version,
      url: url
    }
  }))

  await timeout(1000)

  try{
    var cid = await db.get(`have:${manager}:${name}:${version}`)
    return cid
  } catch {
    return false
  }
}

async function announceHave(db, manager, name, version, cid) {
  log.info("pubsub 'have':", manager, name, version, cid)
  await ipfs.pubsub.publish('forage', JSON.stringify({
    action: 'have',
    forage: forageVersion(),
    package: {
      manager: manager,
      name: name,
      version: version,
      cid: cid
    }
  }))
}

module.exports = {
  saveCid,
  tarballHandler,
  addUrltoIPFS,
  ipfsAdd,
  attemptIPFSLoad,
  guessCID,
  forageVersion,
  startIPFS,
  unsubscribePackageAnnoucements,
  exportPackages,
  listPeers,
  dialPeers,
  filteredReadStream,
  concurrency,
  activePeers,
  savePeers,
  saveVersion,
  fetchWithTimeout,
  announceWant,
  announceHave
}
