// forest preload
// Import all packages from all package-lock.json files into forest

const fs = require('fs');
const forest = require('../forest');
const path = require("path");
const async = require('async');

(async () => {
  forest.connectDB()
  await forest.connectIPFS();

  var packages = []

  console.log('Searching for package-lock.json and go.sum files...')

  var q = async.queue(async function(task, callback) {
    const {manager, name, pkg} = task
    console.log("Importing", name, pkg.version)
    if(pkg.resolved){
      try{
        var id = await forest.addUrltoIPFS(manager, name, pkg.version, pkg.resolved)
      } catch(e) {
        console.error(name, pkg.version, e)
        callback();
      }
      try{
        await forest.loadMetadata('npm', name)
        callback();
      } catch(e) {
        console.error("loadMetadata error", name, e)
        callback();
      }
    } else {
      console.log("URL missing for", name, pkg.version)
      callback();
    }
  }, 20);

  const child = require('child_process').exec("find . -name 'package-lock.json' -o -name 'go.sum'")

  files = []

  child.stdout.on('data', function(data) {
    var filepaths = data.toString().trim().split("\n");

    filepaths.forEach(function(filepath) {
      files.push(filepath)
    })
  });

  child.on('exit', async function (code, signal) {
    files.forEach(async function(filepath) {
      if(filepath.match(/\/node_modules\//)) { return }
      if(filepath.match(/\/vendor\//)) { return }

      console.log("Importing", filepath);

      if(filepath.match(/package-lock.json$/)) {
        const packageLock = JSON.parse(fs.readFileSync(path.resolve(filepath), 'utf8'));

        if(packageLock.dependencies) {
          for (const name in packageLock.dependencies) {
            const pkg = packageLock.dependencies[name]
            packages.push(pkg)
            q.push({manager: 'npm', name: name, pkg: pkg});
          }
        }
      }
      if(filepath.match(/go.sum$/)) {
        const gosum = fs.readFileSync('go.sum', 'utf8').split("\n") // TODO remove duplicates
        gosum.forEach(function(str) {
          if(str.length > 0){
            var parts = str.split(' ')
            var name = parts[0].toLowerCase()
            var version = parts[1].split('/')[0].toLowerCase()
            var pkg = {
              version: version,
              resolved: `https://proxy.golang.org/${name}/@v/${version}.zip`
            }
            q.push({manager: 'go', name: name, pkg: pkg});
          }
        });
      }

      q.drain(async function() {
        console.log('Imported', packages.length, 'packages from', files.length, 'files')
        await forest.closeDB()
      })
    })

  });
})()
