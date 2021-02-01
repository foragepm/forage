var crypto = require('crypto');
const StreamZip = require('node-stream-zip');

async function zipDigest(filePath) {
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

      var hash = crypto.createHash('sha256');
      hash.update(files);
      var digest  = hash.digest('base64');

      zip.close()
      resolve(digest)
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

module.exports = zipDigest
