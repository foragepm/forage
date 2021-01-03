const ChangesStream = require('changes-stream');
const forest = require('../forest')

const changes = new ChangesStream({
  db: 'https://replicate.npmjs.com/registry',
  include_docs: true,
  since: 'now'
});

changes.on('data', function (change) {
  const name = change.doc.name
  if(name){
    const latest = Object.entries(change.doc.time).filter(([key, value]) => ["created", "modified"].indexOf(key) < 0).sort(function(a, b) { return new Date(b[1]) - new Date(a[1]) })[0]
    const versionNumber = latest[0]
    const version = change.doc.versions[versionNumber]
    console.log('New release:',name, versionNumber)
    forest.addUrltoIPFS(name+'@'+versionNumber, version.dist.tarball)
  }
})
