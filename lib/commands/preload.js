// forage preload
// Import all packages from all package-lock.json files into forage

const fs = require('fs');
const forage = require('../forage');
const path = require("path");
const async = require('async');

(async () => {
  var db = forage.connectDB()
  await forage.connectIPFS(db);

  var packages = []

  console.log('Searching for lockfiles files...')

  var q = async.queue(async function(task) {
    const {manager, name, pkg} = task
    console.log("Importing", name, pkg.version)
    if(pkg.resolved){
      try{
        await forage.importPackage(manager, name, pkg.version, pkg.resolved)
      } catch(e) {
        console.error(name, pkg.version, e)
      }
    } else {
      console.log("URL missing for", name, pkg.version)
    }
  }, forage.concurrency());

  // TODO pull lockfile names from forage.managers
  const child = require('child_process').exec("find . -name 'package-lock.json' -o -name 'go.sum'")

  var files = []

  child.stdout.on('data', function(data) {
    var filepaths = data.toString().trim().split("\n");

    filepaths.forEach(function(filepath) {
      files.push(filepath)
    })
  });

  child.on('exit', async function (code, signal) {
    files.forEach(async function(filepath) {
      // TODO pull ignored folders from forage.managers
      if(filepath.match(/\/node_modules\//)) { return }
      if(filepath.match(/\/vendor\//)) { return }

      console.log("Importing", filepath);

      for (const [name, manager] of Object.entries(forage.managers)) {
        if( manager.isLockfilepath(filepath) ) {
          const pkgs = await manager.readLockfile(filepath)
          pkgs.forEach(function(pkg) {
            q.push({manager: pkg.manager, name: pkg.name, pkg: pkg});
          });
        }
      }

      q.drain(async function() {
        console.log('Imported', packages.length, 'packages from', files.length, 'files')
        await db.close()
        process.exit(0)
      })
    })

  });
})()
