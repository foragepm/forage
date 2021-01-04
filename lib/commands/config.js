// forest config
// set config in package managers to use forest

require('child_process').exec("npm config set proxy=http://0.0.0.0:8005/ https-proxy=http://0.0.0.0:8005/ registry=http://registry.npmjs.org/ strict-ssl=false")
console.log('Updated .npmrc with forest config')
