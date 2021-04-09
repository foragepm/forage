# Forest

An IPFS-backed package manager proxy cache, packaged up as an electron menu bar app and command line interface..

⚠️ This project is early development, things may not work and there will be frequent breaking changes ⚠️

If you'd like to contribute to the project, check out the existing issues, add your own feature requests or report bugs: https://github.com/forestpm/forest/issues

[![Video Introduction to Forest on YouTube](https://img.youtube.com/vi/uNuPJHP2lfU/0.jpg)](https://www.youtube.com/watch?v=uNuPJHP2lfU)

Want to learn more? Check out the [docs folder](docs) for all the details.

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

- **Headless CLI** - run forest as a daemon, ideal for usage on a server or in CI
- **Republish local packages** - republish all packages and their dependencies found in local metadata for resilient offline usage
- **Seeding mode** - Republish copies of all packages announced on the IPFS public DHT
- **Export/import** - easily share multiple packages cached instantly with other instances via IPFS
- **Watch mode** - watch for new package releases and seed each one to IPFS

## Coming soon

- **Package index UI** - see which packages have been proxied, cached and stored on IPFS
- **Local package search** - search through locally available packages
- **HTTP API** - control forest over http
- **Javascript API** - integrate forest into other javascript applications

## Installation

To install the command line [npm package](https://www.npmjs.com/package/forestpm):

```
npm install -g forestpm
```

To install the electron app, you'll currently need to build from source, follow the [development documentation](docs/development.md).

## Commands

```
$ forest --help
forest

start the forest proxy server

Commands:
  forest server            start the forest proxy server               [default]
  forest browse            open the forest UI
  forest seed              reseed any packages announced on IPFS
  forest import            load packages listed in forest.lock from IPFS
  forest republish         add local packages to IPFS and write to forest.lock
  forest watch             watch for new packages published upstream
  forest packages          list all cached packages
  forest config            set package managers proxy config
  forest unconfig          remove package managers proxy config
  forest preload           import packages from all package-lock.json files
  forest update            check for updates to all cached packages
  forest verify            validate cids of all cached packages
  forest reset             empty the forest database
  forest sizes             calculate sizes of tarballs
  forest peers             list peers sharing similar packages to you
  forest export            export all packages as a single IPFS directory
  forest id                find your IPFS peer ID
  forest search query      search packages by name
  forest add manager name  add a package to forest

Options:
  --help     Show help                                                 [boolean]
  --version  Show version number                                       [boolean]
```

## Development

Forest needs your help!  There are a few things you can do right now to help out:

Read the [Development documentation](docs/development.md), [Code of Conduct](docs/code-of-conduct.md) and [Contributing Guidelines](docs/contributing.md).

- **Check out existing issues** The [issue list](https://github.com/forestpm/forest/issues) has many that are marked as ['help wanted'](https://github.com/forestpm/forest/issues?q=is%3Aissue+is%3Aopen+sort%3Aupdated-desc+label%3A%22help+wanted%22) which make great starting points for development, many of which can be tackled with no prior IPFS knowledge
- **Look at the [Roadmap](docs/roadmap.md)** This are the high priority items being worked on right now
- **Perform code reviews** More eyes will help
  a. speed the project along
  b. ensure quality, and
  c. reduce possible future bugs.
- **Add tests**. There can never be enough tests.

## Copyright

[MIT License](LICENSE) © 2021 [Andrew Nesbitt](https://github.com/andrew).
