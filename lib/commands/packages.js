const forest = require('../forest')

const allPackages = forest.listPackages()

for (const name of allPackages) {
  versions = forest.listVersions(name)
  if(versions.length > 0){
    console.log(name, versions.join(', '))
  }
}
