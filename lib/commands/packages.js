const forest = require('../forest')

for (const name of forest.listPackages()) {
  console.log(name[0])
}
