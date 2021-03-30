# Forest Documentation

Forest is project that aspires to make package management content addressable, to increase the resilience and portability of package manager data whilst retaining the current level of user experience and security users expect from package management.

The current implementation is an IPFS-backed package manager proxy server and cache, packaged up as an electron menu bar app and command line interface.

## Introduction

[![Video Introduction to Forest on YouTube](https://img.youtube.com/vi/uNuPJHP2lfU/0.jpg)](https://www.youtube.com/watch?v=uNuPJHP2lfU)

Package management is an excellent use case for [IPFS](https://ipfs.io) and [Filecoin](https://filecoin.io), but has yet to see major adoption within any large package managers.

Package management has been plagued with reproducibility problems over the past few years, with the same mistakes often made by different package manager servers and clients because there's no documented standards for designing and building package managers, even less so for content addressed/decentralised package managers.

Making package managers content addressable would unlock the ability for the data within package management registries to become more portable, opening it up to much needed innovation in areas such as transport protocols, storage backends and network topologies.

Past attempts at decentralising package management have attempted to import whole registries into IPFS but come with a very high commitment cost and painful onboarding UX, as such have had low adoption so far.

In taking a slightly different approach, focusing on content addressing data from registries, we allow each user to co-host the packages that they use, unlocking resilience and performance gains without requiring significant infrastructure or upfront buy-in from upstream registry maintainers.

Almost every software developer uses package management in some form, reducing the commitment costs of switching to content addressed package management could unlock the data from large centralised registries and enable significant innovation in the package management space, enabling innovations like blockchain-based solutions that work seamlessly with existing centralised infrastructure.

## How it works

Forest proxies package manager http requests and caches requested packages onto IPFS then announces the CID of newly cached packages on the IPFS public DHT.

Forest listens for announcements of packages being cached to IPFS and stores announced metadata. Next time forest proxies a request for a packages that it already has the CID for, it will attempt to download the package via IPFS first, falling back to downloading the package from the original source via http if the IPFS download fails.

Forest trusts other instances but also verifies that the packages downloaded from IPFS match the original copies from the upstream registry.

Package metadata is also cached locally so you can use your package manager whilst offline too.

## Project Goals

### Equal or better UX for package manager consumers

Forest must provide a user experience that does not detract or block the productivity of the developers using it, it needs to seamlessly integrate into developer workflows with minimal configuration whilst providing high performance and reliability.

### Fungible Infrastructure

Forest should not require any new pieces of centralised infrastructure, relying on existing hosted package manager registries for the source of metadata and archives, but extra infrastructure to support Forest should be possible to deploy and contribute to the network of users without requiring extra permission or trust from end users.

### Content Addressed Framework

A published draft of a v0.1 of the content addressed package management protocol specification

A standardized package metadata format can enable the future development of projects such as:
* a content addressable, public transparency log for all package managers, similar to the ]certificate transparency project](https://certificate.transparency.dev/)
* package maintainers could publish signed nfts of each release of their packages, enabling alternative sources of funding for open source

## Roadmap

* Research and document various package manager metadata formats, api endpoints and processes to extract requirements for spec
* Initial draft of data model and formats for spec
* Refactor core data model of https://github.com/forestpm/forest to implement draft spec
* Deploy analytics service for monitoring DHT for package usage
* Build and deploy marketing website for https://github.com/forestpm/forest and onboard early adopters
* Reach out to key stakeholders in package management for early thoughts, feedback and requirements
* Refine and document spec + implementation
* Publish v1 of https://github.com/forestpm/forest
* Publish the Content Addressed Framework specification

## Project Status

See the current open issues here: https://github.com/forestpm/forest/issues?q=is%3Aopen+is%3Aissue
