# Forest

An IPFS-backed package manager proxy cache, packaged up as an electron menu bar app and command line interface..

⚠️ This project is early development, things may not work and there will be frequent breaking changes ⚠️

If you'd like to contribute to the project, check out the existing issues, add your own feature requests or report bugs: https://github.com/forestpm/forest/issues

[![Video Introduction to Forest on YouTube](https://img.youtube.com/vi/uNuPJHP2lfU/0.jpg)](https://www.youtube.com/watch?v=uNuPJHP2lfU)

Want to learn more? Check out the [docs folder](docs/readme.md) for all the details.

## Supported package managers

- npm (registry.npmjs.org)
- go modules (proxy.golang.org)

## How it works

Forest proxies package manager http requests and caches requested packages onto IPFS then announces the CID of newly cached packages on the IPFS public DHT.

Forest listens for announcements of packages being cached to IPFS and stores announced metadata. Next time forest proxies a request for a packages that it already has the CID for, it will attempt to download the package via IPFS first, falling back to downloading the package from the original source via http if the IPFS download fails.

Forest trusts other instances but also verifies that the packages downloaded from IPFS match the original copies from the upstream registry.

Package metadata is also cached locally so you can use your package manager whilst offline too.

## Project goals

- Smooth user experience
- Don't mess with lockfiles
- No extra infrastructure required
- Get people dogfooding IPFS as part of their regular workflows

## Features

Headless CLI - run forest as a daemon, ideal for usage on a server or in CI

Republish local packages - republish all packages and their dependencies found in local metadata for resilient offline usage

Seeding mode - Republish copies of all packages announced on the IPFS public DHT

Export/import - easily share multiple packages cached instantly with other instances via IPFS

Watch mode - watch for new package releases and seed each one to IPFS

## Coming soon

Package index UI - see which packages have been proxied, cached and stored on IPFS

Local package search - search through locally available packages

HTTP API - control forest over http

Javascript API - integrate forest into other javascript applications

## Setup

Build from source on mac:

```shell
git clone https://github.com/forestpm/forest.git
cd forest
npm ci
```

To configure npm to use forest as a proxy:

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

To configure go modules to use forest as a proxy, set the following env var in your shell:

```
GOPROXY=http://localhost:8005
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

### Browse

Open the UI dashboard in your browser (http://localhost:8005/):

```shell
forest browse
```

### Seed

You can help seed packages without running a proxy:

```shell
forest seed
```

### Watch

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

### Add

Add a package direct to forest by name:

```shell
forest add go github.com/libp2p/go-libp2p-peerstore
forest add npm ipfs-http-client
```

### List packages

List all the packages and versions that forest has cached locally:

```shell
forest packages
```

### Search packages

Search packages by name, example:

```shell
forest search electron
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

### Verify all packages

Validate the CID of each cached package version:

```shell
forest verify
```

### Reset forest

Empty the forest database and remove all cached packages:

```shell
forest reset
```

### List peers

List peers sharing similar packages to you:

```shell
forest peers
```

### Export

Export all packages as a single IPFS directory:

```shell
forest export
```

### ID

Find your IPFS peer ID that forest is using:

```shell
forest id
```

## Copyright

[MIT License](LICENSE) © 2021 [Andrew Nesbitt](https://github.com/andrew).
