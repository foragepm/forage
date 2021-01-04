// forest config
// remove config in package managers to stop using forest

require('child_process').exec('npm config delete proxy https-proxy registry strict-ssl')
console.log('Updated .npmrc removing forest config')
