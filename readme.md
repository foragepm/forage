# Forest

An IPFS-backed package manager proxy cache, packaged up as an electron menu bar app.

## How it works

Forest proxies package manager http requests and caches requested packages onto IPFS then announces the CID of newly cached packages on the IPFS public DHT.

Forest listens for announcements of packages being cached to IPFS and stores announced metadata. Next time forest proxies a request for a packages that it already has the CID for, it will attempt to download the package via IPFS first, falling back to downloading the package from the original source via http if the IPFS download fails.

Forest trusts other instances but also verifies that the packages downloaded from IPFS match the original copies from the upstream registry.

Package metadata is also cached locally so you can use your package manager whilst offline too.

Currently npm is the only supported package manager but support for others like Go, Rubygems and Homebrew are planned for the future.

## Project goals

- Smooth user experience
- Don't mess with lockfiles
- No extra infrastructure required
- Get people dogfooding IPFS as part of their regular workflows

## Features (coming soon)

Headless CLI - run forest as a daemon, ideal for usage on a server or in CI

Package index UI - see which packages have been proxied, cached and stored on IPFS

Local package search - search through locally available packages

Republish local packages - republish all packages and their dependencies found in local metadata for resilient offline usage

Seeding mode - Republish copies of all packages announced on the IPFS public DHT

Export/import - easily share multiple packages cached instantly with other instances via IPFS

Watch mode - watch for new package releases and seed each one to IPFS

HTTP API - control forest over http

Javascript API - integrate forest into other javascript applications

## Setup

Build from source on mac:

```shell
git clone http://github.com/forestpm/forest
cd forest
npm install
```

Configure npm to use forest as a proxy:

```shell
npm run config

# or manually set the following in your .npmrc
npm config set proxy http://0.0.0.0:8005/
npm config set https-proxy http://0.0.0.0:8005/
npm config set registry http://registry.npmjs.org/
npm config set strict-ssl false

# restore the defaults with
npm run unconfig
```

Ensure IPFS is running locally with pubsub enabled:

```shell
npm run ipfs

# or
ipfs daemon --enable-pubsub-experiment
```

Start the electon app:

```shell
npm start
```

or compile the electron app into `./dist`:

```shell
npm run pack
```

and link the command line interface:

```shell
npm link
```

## Commands

### Server

Run just the http server directly in the command line:

```shell
forest server
```

### Seed

You can help seed packages without running a proxy:

```shell
forest seed
```

### watch

You can watch for all new packages and publish them to IPFS:

```shell
forest watch
```

### Republish

Import all packages from a package-lock.json file and import and record in a forest.lock file:

```shell
forest republish
```

### Import

Read a forest.lock file and download+verify each package via IPFS:

```shell
forest import
```

### List packages

List all the packages and versions that forest has cached locally:

```shell
forest packages
```

### Import all packages

Search the current directory for package-lock.json files and import all packages listed:

```shell
forest preload
```

### Update all packages

Check for updates to all cached packages and download any missing ones:

```shell
forest update
```

## TODO

- ~tray menu (start, stop, about etc)~
- ~connect to IPFS on startup~
- ~store package tarballs in ipfs~
- ~announce stored packages on DHT (pubsub)~
- ~listen for package announcements on DHT (pubsub)~
- ~extract core proxy server as separate module~
- ~download and verify announced package versions via IPFS~
- ~automatically downloaded new versions of announced package if already have one or more versions downloaded locally~
- ~seeding mode~
- ~watch mode~
- ~export/import~
- ~CLI~
- ~check for new versions from upstream~
- ~cache downloaded package metadata~
- ~store package metadata in a database~
- ~preload function - search for locally installed packages and load them into ipfs~
- ~add goals of the project to readme~
- ~command to check for updates to all cached packages~
- record all announced package cids without downloading/verifying (for downloading via ipfs later if requested)
- start IPFS (with pubsub experiment and init) if there's not already one running on startup
- package list UI
- lots more error handling
- show how much bandwidth saved overall (keep a record of ever request proxied)
- search
- keep a list of ipfs peers who republish packages that fail integrity checks, block after X fails
- cleanup command that removes old packages from local IPFS (keep CID in db incase needed later)
- package search
- count how many nodes have a package
- announce/share full package list periodically
- support for proxying go modules
- test with yarn + proxy setup instructions for yarn (currently broken)
- http api
- configure trusted forest instances to connect to on startup (ipfs peer id)
- option to start app on boot (https://www.electronjs.org/docs/api/app#appsetloginitemsettingssettings-macos-windows)

## BUGS

- broken: node-gyp http requests not proxied (node-sass install)
- broken: electron-builder - requests incorrectly proxied
- breaks if IPFS isn't running
- silently fails if something is already running on port 8005
- yarn only tries to load https, ignoring config (https://github.com/yarnpkg/yarn/pull/7393)
- gets stuck when download modules with very large dependency trees
- republish doesn't work with git dependencies

## IPFS notes

- starting ipfs desktop with pubsub enabled is hard
- pubsub can only be enabled with flag, not in config
