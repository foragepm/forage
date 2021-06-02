#!/usr/bin/env node
const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers')

yargs(hideBin(process.argv))
  .command(['server', '$0'], 'start the forage proxy server', () => {}, (argv) => {
    require('./lib/commands/server')(argv)
  })
  .command('browse', 'open the forage UI', () => {}, (argv) => {
    require('./lib/commands/browse')(argv)
  })
  .command('seed', 'reseed any packages announced on IPFS', () => {}, (argv) => {
    require('./lib/commands/seed')(argv)
  })
  .command('import', 'load packages listed in forage.lock from IPFS', () => {}, (argv) => {
    require('./lib/commands/import')(argv)
  })
  .command('republish', 'add local packages to IPFS and write to forage.lock', () => {}, (argv) => {
    require('./lib/commands/republish')(argv)
  })
  .command('watch', 'watch for new packages published upstream', () => {}, (argv) => {
    require('./lib/commands/watch')(argv)
  })
  .command('packages', 'list all cached packages', () => {}, (argv) => {
    require('./lib/commands/packages')(argv)
  })
  .command('config', 'set package managers proxy config', () => {}, (argv) => {
    require('./lib/commands/config')(argv)
  })
  .command('unconfig', 'remove package managers proxy config', () => {}, (argv) => {
    require('./lib/commands/unconfig')(argv)
  })
  .command('preload', 'import packages from all package-lock.json files', () => {}, (argv) => {
    require('./lib/commands/preload')(argv)
  })
  .command('update', 'check for updates to all cached packages', () => {}, (argv) => {
    require('./lib/commands/update')(argv)
  })
  .command('verify', 'validate cids of all cached packages', () => {}, (argv) => {
    require('./lib/commands/verify')(argv)
  })
  .command('reset', 'empty the forage database', () => {}, (argv) => {
    require('./lib/commands/reset')(argv)
  })
  .command('sizes', 'calculate sizes of tarballs', () => {}, (argv) => {
    require('./lib/commands/sizes')(argv)
  })
  .command('peers', 'list peers sharing similar packages to you', () => {}, (argv) => {
    require('./lib/commands/peers')(argv)
  })
  .command('export', 'export all packages as a single IPFS directory', () => {}, (argv) => {
    require('./lib/commands/export')(argv)
  })
  .command('id', 'find your IPFS peer ID and public key', () => {}, (argv) => {
    require('./lib/commands/id')(argv)
  })
  .command('search query', 'search packages by name', () => {}, (argv) => {
    require('./lib/commands/search')(argv)
  })
  .command('add manager name', 'add a package to forage', () => {}, (argv) => {
    require('./lib/commands/add')(argv)
  })
  .command('rotate', 'generate a new public+private key pair', () => {}, (argv) => {
    require('./lib/commands/rotate')(argv)
  })
  .command('trust publickey', 'trust a public key', () => {}, (argv) => {
    require('./lib/commands/trust')(argv)
  })
  .command('untrust publickey', 'stop trusting a public key', () => {}, (argv) => {
    require('./lib/commands/untrust')(argv)
  })
  .command('trusted', 'list trusted public keys', () => {}, (argv) => {
    require('./lib/commands/trusted')(argv)
  })
  .default('port', 8005)
  .default('topic', 'forage')
  .argv
