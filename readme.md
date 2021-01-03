# Forest

An IPFS-backed package manager proxy cache, packaged up as an electron menu bar app.

## How it works

Forest proxies package manager http requests and caches requested packages onto IPFS then announces the CID of newly cached packages on the IPFS public DHT.

Forest listens for announcements of packages being cached to IPFS and stores announced metadata. Next time forest proxies a request for a packages that it already has the CID for, it will attempt to download the package via IPFS first, falling back to downloading the package from the original source via http if the IPFS download fails.

Forest trusts other instances but also verifies that the packages downloaded from IPFS match the original copies from the upstream registry.

Package metadata is also cached locally so you can use your package manager whilst offline too.

## Features (coming soon)

Headless CLI - run forest as a daemon, ideal for usage on a server or in CI

Package index UI - see which packages have been proxied, cached and stored on IPFS

Local package search - search through locally available packages

Republish local packages - republish all packages and their dependencies found in local metadata for resilient offline usage

Seeding mode - Republish copies of all packages announced on the IPFS public DHT

Export/import - easily share multiple packages cached instantly with other instances via IPFS

Watch mode - watch for new package releases and seed each one to IPFS

## Setup

Build from source on mac:

```shell
git clone http://github.com/forestpm/forest
cd forest
npm install
```

Configure npm to use forest as a proxy:

```shell
npm config set proxy http://0.0.0.0:8005/
npm config set https-proxy http://0.0.0.0:8005/
npm config set registry http://registry.npmjs.org/
npm config set strict-ssl false
```

Ensure IPFS is running locally with pubsub enabled:

```shell
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

### Daemon

Run just the proxy server directly in the command line:

```shell
forest daemon
```

### Seed

You can help seed packages without running a proxy:

```shell
forest seed
```

### watch

You can watch for all new packages and publish them to IPFS without running a proxy:

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
- add goals of the project to readme
- don't double log announcements of your own republishes
- record all announced package cids without downloading/verifying (for downloading via ipfs later if requested)
- cache downloaded package metadata
- store package metadata in a database
- start IPFS (with pubsub experiment and init) if there's not already one running on startup
- package list UI
- show how much bandwidth saved overall (keep a record of ever request proxied)
- check for new versions from upstream (on demand or periodically)
- search
- keep a list of ipfs peers who republish packages that fail integrity checks, block after X fails
- cleanup command that removes old packages from local IPFS (keep CID in db incase needed later)
- package search
- count how many nodes have a package
- announce/share full package list periodically
- support for proxying go modules
- test with yarn + proxy setup instructions for yarn (currently broken)
- preload function - search for locally installed packages and load them into ipfs (republish does this for a single package-lock.json)
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

## IPFS notes

- starting ipfs desktop with pubsub enabled is hard
- pubsub can only be enabled with flag, not in config
