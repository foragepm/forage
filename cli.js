#!/usr/bin/env node
const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers')

yargs(hideBin(process.argv))
  .command(['daemon', '$0'], 'run the forest proxy server', () => {}, (argv) => {
    require('./lib/commands/daemon')
  })
  .command('seed', 'Download any packages republished to IPFS', () => {}, (argv) => {
    require('./lib/commands/seed')
  })
  .command('import', 'load packages in forest.lock from IPFS', () => {}, (argv) => {
    require('./lib/commands/import')
  })
  .command('republish', 'add local packages to IPFS', () => {}, (argv) => {
    require('./lib/commands/republish')
  })
  .command('watch', 'watch for newly published packages', () => {}, (argv) => {
    require('./lib/commands/watch')
  })
  .argv
