const execa = require('execa');

async function benchmark(desc, command, before, after) {
  console.log(desc);
  if(before && before.length){
    execa.commandSync(before, {shell: true})
  }
  var before = new Date
	const {stdout} = execa.commandSync(command, {shell: true});
  var after = new Date
  if(after && after.length){
    execa.commandSync(after, {shell: true})
  }
  console.log(' -', after - before, 'ms')
}

(async () => {
  execa.commandSync('cp test/fixtures/go.mod go.mod', {shell: true})

  await benchmark('proxy.golang.org, no cache', 'go get github.com/ipfs/go-ipfs-ds-help', 'go clean --modcache')

  await benchmark('proxy.golang.org, cache', 'go get github.com/ipfs/go-ipfs-ds-help')

  await benchmark('forage go, no go cache, no forage cache', 'GOPROXY=http://localhost:8005 go get github.com/ipfs/go-ipfs-ds-help', 'forage reset && go clean --modcache')

  await benchmark('forage go, no go cache, forage cache', 'GOPROXY=http://localhost:8005 go get github.com/ipfs/go-ipfs-ds-help', 'go clean --modcache')

  await benchmark('forage go, go cache, forage cache', 'GOPROXY=http://localhost:8005 go get github.com/ipfs/go-ipfs-ds-help')

  execa.commandSync('rm go.mod go.sum', {shell: true})
})();
