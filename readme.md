# Forage

An IPFS-backed package manager proxy cache, packaged up as an electron menu bar app and command line interface..

⚠️ This project is early development, things may not work and there will be frequent breaking changes ⚠️

If you'd like to contribute to the project, check out the existing issues, add your own feature requests or report bugs: https://github.com/foragepm/forage/issues

[![Video Introduction to Forage on YouTube](https://img.youtube.com/vi/uNuPJHP2lfU/0.jpg)](https://www.youtube.com/watch?v=uNuPJHP2lfU)

Want to learn more? Check out the [docs folder](docs) for all the details.

## Supported package managers

- npm (registry.npmjs.org)
- go modules (proxy.golang.org)

## How it works

Forage proxies package manager http requests and caches requested packages onto IPFS then announces the CID of newly cached packages on the IPFS public DHT.

Forage listens for announcements of packages being cached to IPFS and stores announced metadata. Next time forage proxies a request for a packages that it already has the CID for, it will attempt to download the package via IPFS first, falling back to downloading the package from the original source via http if the IPFS download fails.

Forage trusts other instances but also verifies that the packages downloaded from IPFS match the original copies from the upstream registry.

Package metadata is also cached locally so you can use your package manager whilst offline too.

## Project goals

- Smooth user experience
- Don't mess with lockfiles
- No extra infrastructure required
- Get people dogfooding IPFS as part of their regular workflows

## Features

- **Headless CLI** - run forage as a daemon, ideal for usage on a server or in CI
- **Republish local packages** - republish all packages and their dependencies found in local metadata for resilient offline usage
- **Seeding mode** - Republish copies of all packages announced on the IPFS public DHT
- **Export/import** - easily share multiple packages cached instantly with other instances via IPFS
- **Watch mode** - watch for new package releases and seed each one to IPFS

## Coming soon

- **Package index UI** - see which packages have been proxied, cached and stored on IPFS
- **Local package search** - search through locally available packages
- **HTTP API** - control forage over http
- **Javascript API** - integrate forage into other javascript applications

## Installation

To install the command line [npm package](https://www.npmjs.com/package/foragepm):

```
npm install -g foragepm
```

To install the electron app, you'll currently need to build from source, follow the [development documentation](docs/development.md).

To configure npm to use forage as a proxy:

```shell
forage config

# or manually set the following in ~/.npmrc
npm config set proxy http://0.0.0.0:8005/
npm config set https-proxy http://0.0.0.0:8005/
npm config set registry http://registry.npmjs.org/
npm config set strict-ssl false

# restore the defaults with
forage unconfig
```

To configure go modules to use forage as a proxy, set the following env var in your shell:

```
GOPROXY=http://localhost:8005
```

## Commands

```
$ forage help
forage

start the forage proxy server

Commands:
  forage server             start the forage proxy server              [default]
  forage browse             open the forage UI
  forage seed               reseed any packages announced on IPFS
  forage import             load packages listed in forage.lock from IPFS
  forage republish          add local packages to IPFS and write to forage.lock
  forage watch              watch for new packages published upstream
  forage packages           list all cached packages
  forage config             set package managers proxy config
  forage unconfig           remove package managers proxy config
  forage preload            import packages from all package-lock.json files
  forage update             check for updates to all cached packages
  forage verify             validate cids of all cached packages
  forage reset              empty the forage database
  forage sizes              calculate sizes of tarballs
  forage peers              list peers sharing similar packages to you
  forage export             export all packages as a single IPFS directory
  forage id                 find your IPFS peer ID
  forage search query       search packages by name
  forage add manager name   add a package to forage
  forage rotate             generate a new public+private key pair
  forage trust publickey    trust a public key
  forage untrust publickey  stop trusting a public key
  forage trusted            list trusted public keys

Options:
  --help     Show help                                                 [boolean]
  --version  Show version number                                       [boolean]
```

## Development

Forage needs your help!  There are a few things you can do right now to help out:

Read the [Development documentation](docs/development.md), [Code of Conduct](docs/code-of-conduct.md) and [Contributing Guidelines](docs/contributing.md).

- **Check out existing issues** The [issue list](https://github.com/foragepm/forage/issues) has many that are marked as ['help wanted'](https://github.com/foragepm/forage/issues?q=is%3Aissue+is%3Aopen+sort%3Aupdated-desc+label%3A%22help+wanted%22) which make great starting points for development, many of which can be tackled with no prior IPFS knowledge
- **Look at the [Roadmap](docs/roadmap.md)** These are the high priority items being worked on right now
- **Perform code reviews** More eyes will help
  a. speed the project along
  b. ensure quality, and
  c. reduce possible future bugs.
- **Add tests**. There can never be enough tests.

## Copyright

[MIT License](LICENSE) © 2021 [Andrew Nesbitt](https://github.com/andrew).
