var crypto = require('crypto');
const StreamZip = require('node-stream-zip');

async function zipDigest(filePath) {
  var files = await zipManifest(filePath)
  var hash = crypto.createHash('sha256');
  hash.update(files);
  return hash.digest('base64');
}

async function zipManifest(filePath){
  let zip;
  return new Promise((resolve, reject) => {
    zip = new StreamZip({storeEntries: true, file: filePath});
    zip.on('ready', () => {
      var files = ""

      for (const entry of Object.values(zip.entries()).sort()) {
          if(!entry.isDirectory){
            const data = zip.entryDataSync(entry.name);
            var hash = crypto.createHash('sha256');
            hash.update(data);
            var digest = hash.digest('hex');
            files += `${digest}  ${entry.name}\n`
          }
      }

      zip.close()
      resolve(files)
    })
    zip.on('error', e => {
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

module.exports = {zipDigest, zipManifest}
