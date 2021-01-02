#!/usr/bin/env node
const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers')

yargs(hideBin(process.argv))
  .command(['daemon', '$0'], 'the default command', () => {}, (argv) => {
    require('./daemon')
  })
  .command('seed', 'the default command', () => {}, (argv) => {
    require('./seed')
  })
  .command('import', 'the default command', () => {}, (argv) => {
    require('./import')
  })
  .command('republish', 'the default command', () => {}, (argv) => {
    require('./republish')
  })
  .command('watch', 'the default command', () => {}, (argv) => {
    require('./watch')
  })
  .argv
