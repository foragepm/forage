const fetch = require('node-fetch')
const AbortController = require('abort-controller');

const IpfsHttpClient = require('ipfs-http-client')
const { urlSource } = IpfsHttpClient
const ipfs = IpfsHttpClient()
const toStream = require('it-to-stream')

const fs = require('fs-extra');
const path = require('path');

const multihash = require('multihashes')
const ssri = require('ssri')
const CID = require('cids')

var debug = require('debug')('forage-core')

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
      debug(`IPFS add ${url}, (${cid})`)

      await saveVersion(db, manager, name, version, url, cid)

      return cid
    } else {
      debug('error in ipfs add', url)
      return false
    }
  } catch(e) {
    debug('error in ipfs add', url)
    debug(e)
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
    debug('Annoucing', manager, name, version, 'over pubsub')
    ipfs.pubsub.publish('forage', JSON.stringify({
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
    debug('Failed to announce', manager, name, version, 'over pubsub')
    debug(e)
  }

  return true
}

async function ipfsAdd(data, hashAlg = 'sha2-256') {
  try{
    var res = await ipfs.add(data, {chunker: 'size-1048576', rawLeaves: true, hashAlg: hashAlg, cidVersion: 1, timeout: 5000})
    return res.cid.toString()
  } catch(e){
    debug('ipfs add failed')
    debug(e)
    return false
  }
}

async function setTarballSize(db, manager, name, version) {
  var cid = await db.get(`cid:${manager}:${name}:${version}`)
  const { size } = await ipfs.files.stat(`/ipfs/${cid}`)
  await db.put(`size:${manager}:${name}:${version}`, size)
  return size
}

async function fetchWithTimeout(url, timeout = 5000) {
  var controller = new AbortController();
  var timeout = setTimeout(() => {
    debug(`Timeout loading from URL (${url})`)
    controller.abort();
  }, timeout);

  return await fetch(url, {signal: controller.signal});
}

async function attemptIPFSLoad(cid){
  try{
    var url = "http://127.0.0.1:5001/api/v0/cat?arg=/ipfs/"+cid

    var controller = new AbortController();
    var timeout = setTimeout(() => {
      debug(`Timeout loading from IPFS (${cid})`)
    	controller.abort();
    }, 1000);

    var response = await fetch(url, {method: 'POST', signal: controller.signal});

    var text = await response.text();
    return text
  } catch(e){
    return false
  } finally {
    clearTimeout(timeout);
  }
}

async function startIPFS() {
  debug('Starting IPFS')

  const Ctl = require('ipfsd-ctl');

  var disposable = process.env.CI ? true : false

  const ipfsd = await Ctl.createController({
      disposable: disposable,
      args: '--enable-pubsub-experiment',
      ipfsHttpModule: require('ipfs-http-client'),
      ipfsBin: require('go-ipfs').path(),
      test: false,
      remote: false
  })

  try {
    await ipfsd.start()
    debug('Started IPFS')
    const id = await ipfsd.api.id()
    return ipfsd
 } catch (err) {
   if (!err.message.includes('ECONNREFUSED')) {
     throw err
   }

   debug('Removing ipfs api file')
   fs.removeSync(path.join(ipfsd.path, 'api'))
   await ipfsd.start()
   debug('Started IPFS')
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

var packageJson = require('../../package.json');

function forageVersion() {
  return packageJson.version
}

async function unsubscribePackageAnnoucements(packageAnnoucementsTopic) {
  await ipfs.pubsub.unsubscribe(packageAnnoucementsTopic)
  debug(`Unsubscribed from '${packageAnnoucementsTopic}' pubsub topic`)
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
    debug('Exporting', pkg.manager, pkg.name, pkg.version)
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

function listPeers(db) {
  return new Promise((resolve, reject) => {
    var names = []
    db.createKeyStream({gte: 'repub:', lt: 'repub:~'})
      .on('data', function (data) {
        var parts = data.split(':')
        names.push(parts[4])
      })
      .on('end', function () {
        resolve( [...new Set(names)])
      })
  })
}

async function dialPeers(db, topic) {
  listPeers(db).then(async function(peers) {
    peers.forEach(async function(peer) {
      try {
        debug('dialing', peer)
        await ipfs.swarm.connect(`/p2p/${peer}`)
      } catch (e) {
        // couldn't find peer, nbd
      }
    });
  }).then(async function() {
    var peerIds = await activePeers(topic)
    debug(`${peerIds.length} peer${peerIds.length === 1 ? "" : "s"} online`)
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
  fetchWithTimeout
}
