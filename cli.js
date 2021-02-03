#!/usr/bin/env node
const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers')

yargs(hideBin(process.argv))
  .command(['server', '$0'], 'start the forest proxy server', () => {}, (argv) => {
    require('./lib/commands/server')
  })
  .command('browse', 'open the forest UI', () => {}, (argv) => {
    require('./lib/commands/browse')
  })
  .command('seed', 'reseed any packages announced on IPFS', () => {}, (argv) => {
    require('./lib/commands/seed')
  })
  .command('import', 'load packages listed in forest.lock from IPFS', () => {}, (argv) => {
    require('./lib/commands/import')
  })
  .command('republish', 'add local packages to IPFS and write to forest.lock', () => {}, (argv) => {
    require('./lib/commands/republish')
  })
  .command('watch', 'watch for new packages published upstream', () => {}, (argv) => {
    require('./lib/commands/watch')
  })
  .command('packages', 'list all cached packages', () => {}, (argv) => {
    require('./lib/commands/packages')
  })
  .command('config', 'set package managers proxy config', () => {}, (argv) => {
    require('./lib/commands/config')
  })
  .command('unconfig', 'remove package managers proxy config', () => {}, (argv) => {
    require('./lib/commands/unconfig')
  })
  .command('preload', 'import packages from all package-lock.json files', () => {}, (argv) => {
    require('./lib/commands/preload')
  })
  .command('update', 'check for updates to all cached packages', () => {}, (argv) => {
    require('./lib/commands/update')
  })
  .command('verify', 'validate cids of all cached packages', () => {}, (argv) => {
    require('./lib/commands/verify')
  })
  .command('reset', 'empty the forest database', () => {}, (argv) => {
    require('./lib/commands/reset')
  })
  .command('sizes', 'calculate sizes of tarballs', () => {}, (argv) => {
    require('./lib/commands/sizes')
  })
  .command('peers', 'list peers sharing similar packages to you', () => {}, (argv) => {
    require('./lib/commands/peers')
  })
  .command('export', 'export all packages as a single IPFS directory', () => {}, (argv) => {
    require('./lib/commands/export')
  })
  .command('id', 'find your IPFS peer ID', () => {}, (argv) => {
    require('./lib/commands/id')
  })
  .command('search query', 'search packages by name', () => {}, (argv) => {
    require('./lib/commands/search')(argv)
  })
  .argv
