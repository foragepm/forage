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

async function loadMetadata(db, manager, name) {
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
    return await loadMetadataFromRegistry(db, manager, name)
  }
}

async function loadVersionMetadata(db, manager, name, version) {
  var metadata = await loadMetadata(db, manager, name)
  if(!metadata) {
    console.log("Failed to load metadata for", name)
    return false
  }

  var versionData = metadata.versions[version]

  if(versionData == null){
    console.log('Reloading metadata for', name, version)
    const metadata = await loadMetadataFromRegistry(db, manager, name)
    var versionData = metadata.versions[version]

    if(versionData == null){
      // no known version in registy
      console.log("Can't find", version, "for", name)
      return false
    }
  }
  return versionData
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
async function loadMetadataFromRegistry(db, manager, name) {
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

async function saveCid(db, manager, name, version, cid) {
  await db.put(`cid:${manager}:${name}:${version}`, cid)
}

async function updateMetadata(db, manager, name) {
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
    exists = await db.get(`cid:${manager}:${name}:${version}`)
  } catch (e) {
    exists = false
  }

  if (exists) { return exists }

  try {
    const file = await ipfsAdd(urlSource(url), hashAlg)
    console.log('IPFS add:', file.path, file.cid.toString())

    await saveCid(db, manager, name, version, file.cid.toString())
    var size = await setTarballSize(db, manager, name, version) // TODO can use the size from ipfsAdd

    try {
      ipfs.pubsub.publish('forest', JSON.stringify({
        url: url,
        manager: manager,
        name: name,
        version: version,
        path: file.path,
        cid: file.cid.toString(),
        forest: forestVersion(),
        size: size
      }))
    } catch(e) {
      console.error('Failed to announce', manager, name, version, 'over pubsub')
      console.error(e)
    }

    return file.cid.toString()
  } catch(e) {
    console.log('error in ipfs add', url)
    console.error(e)
    return false
  }
}

async function ipfsAdd(data, hashAlg = 'sha2-256') {
  return await ipfs.add(data, {chunker: 'size-1048576', rawLeaves: true, hashAlg: hashAlg, cidVersion: 1})
}

async function setTarballSize(db, manager, name, version) {
  var cid = await db.get(`cid:${manager}:${name}:${version}`)
  const { size } = await ipfs.files.stat(`/ipfs/${cid}`)
  await db.put(`size:${manager}:${name}:${version}`, size)
  return size
}

async function attemptIPFSLoad(cid){
  try{
    var url = "http://127.0.0.1:5001/api/v0/cat?arg=/ipfs/"+cid

    var controller = new AbortController();
    var timeout = setTimeout(() => {
      // console.log('Timeout loading from IPFS', cid)
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
  console.log('Starting IPFS')

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

  fs.removeSync(path.join(ipfsd.path, 'api'))

  var started = await ipfsd.start()
  console.log('Started IPFS')
  const id = await ipfsd.api.id()
  return ipfsd
}

function guessCID(integrity) {
  var sha = ssri.parse(integrity, {single: true})
  if (sha.algorithm === 'sha512'){
    var mhash = multihash.fromHexString('1340' + sha.hexDigest())
    return possibleCID = new CID(1, 'raw', mhash).toString()
  } else if (sha.algorithm === 'sha256'){
    var mhash = multihash.fromHexString('1220' + sha.hexDigest())
    return possibleCID = new CID(1, 'raw', mhash).toString()
  } else {
    return false
  }
}

var packageJson = require('../../package.json');

function forestVersion() {
  packageJson.version
}

async function unsubscribePackageAnnoucements(packageAnnoucementsTopic) {
  await ipfs.pubsub.unsubscribe(packageAnnoucementsTopic)
  console.log(`Unsubscribed from '${packageAnnoucementsTopic}' pubsub topic`)
}

async function exportPackages(db) {
  await ipfs.files.rm('/forest/export', { recursive: true })
  await ipfs.files.mkdir('/forest/export', {parents: true})

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
    console.log('Exporting', pkg.manager, pkg.name, pkg.version)
    try{
      await ipfs.files.mkdir(`/forest/export/${pkg.manager}/${pkg.name}`, {parents: true})
    } catch(e) {
      // folder already exists
    }

    try{
      var extension = pkg.manager === 'go' ? 'zip' : 'gzip'
      await ipfs.files.cp(`/ipfs/${pkg.cid}`, `/forest/export/${pkg.manager}/${pkg.name}/${pkg.version}.${extension}`) // todo gzip or zip
    } catch(e){
      // failed to add file
    }
  }

  // return root cid of mfs dir
  return await ipfs.files.stat('/forest/export')
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

async function dialPeers(db) {
  listPeers(db).then(async function(peers) {
    peers.forEach(async function(peer) {
      try {
        await ipfs.swarm.connect(`/p2p/${peer}`)
      } catch (e) {
        // couldn't find peer, nbd
      }
    });
  })
}

function filteredReadStream(db, start) {
  return db.createReadStream({gte: start, lt: start+ '~'})
}

module.exports = {
  loadMetadata,
  saveCid,
  tarballHandler,
  addUrltoIPFS,
  ipfsAdd,
  attemptIPFSLoad,
  guessCID,
  forestVersion,
  startIPFS,
  unsubscribePackageAnnoucements,
  exportPackages,
  listPeers,
  dialPeers,
  loadVersionMetadata,
  filteredReadStream,
  loadMetadataFromRegistry,
  updateMetadata
}
