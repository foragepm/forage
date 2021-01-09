#!/usr/bin/env node
const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers')

yargs(hideBin(process.argv))
  .command(['server', '$0'], 'run the forest server', () => {}, (argv) => {
    require('./lib/commands/server')
  })
  .command('seed', 'download any packages republished to IPFS', () => {}, (argv) => {
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
  .command('packages', 'list all packages', () => {}, (argv) => {
    require('./lib/commands/packages')
  })
  .command('config', 'configure package managers', () => {}, (argv) => {
    require('./lib/commands/config')
  })
  .command('unconfig', 'remove package managers config', () => {}, (argv) => {
    require('./lib/commands/unconfig')
  })
  .command('preload', 'import all package-lock.json files', () => {}, (argv) => {
    require('./lib/commands/preload')
  })
  .command('update', 'check for updates to all cached packages', () => {}, (argv) => {
    require('./lib/commands/update')
  })
  .argv
