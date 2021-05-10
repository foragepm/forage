# Content Addressing Package Metadata

Notes on storing+sharing package metadata over ipfs+pubsub in Forage

We are storing http responses rather than abstract metadata and rebuilding http responses as that method should work across more package managers with less fragility if registry response formats change in future.

The main piece of work is to store individual http response bodies of proxied requests on ipfs so that they can be shared and exported

This will require further trusting of other instances as metadata includes integrity hashes that are currently used to confirm if a package is the same as upstream. This could come in the form of signing, checking responses via comparing etags may also be possible.

## Data:

Existing data:

- for a package (manager, name):
  - list of version numbers
  - http response body for list of versions for proxy
    - key: `pkg:${manager}:${name}`
  - for each version (manager, name, version):
    - cid for archive
      - `cid:${manager}:${name}:${version}`
    - http response bodies for proxy
      extras for go:
        - `response:go:mod:${name}:${version}`
        - `response:go:sum:${name}`
        - `response:go:info:${name}:${version}`

Example json:

```json
{
  "manager": "npm",
  "name": "base62",
  "registry": "https://registry.npmjs.com/",
  "data": {
    "response": {
      "url": "https://registry.npmjs.com/base62",
      "body": "bafybgqde7kfgk4ub2rcr3nyukuy3q5b35nb4bxwvgwlg42uu7cyqv2ihryzurlwt2o"
    },
    "versions": {
      "1.0.0": {
        "url": "https://registry.npmjs.org/base62/-/base62-0.1.0.tgz",
        "cid": "bafybgqde7kfgk4ub2rcr3nyukuy3q5b35nb4bxwvgwlg42uu7cyqv2ihryzurlw",
        "integrity": "sha512-xVtfFHNPUzpCNHygpXFGMlDk3saxXLQcOOQzAAk6ibvlAHgT6W==",
        "responses": [
          {
            "url": "https://someurl",
            "body": "bafybgqde7kfgk4ub2rcr3nyukuy3q5b35nb4bxwvgwlg42uu7cyqv2ihryzurlwt2o"
          }
        ]
      }
    }
  }
}
```

## Workflows

- newly request package (via proxy or import)
  - load metadata for pkg (from pubsub or http)
  - write to ipfs+level

- updated package (new version)
  - load metadata for changes
  - merge/updating with existing pkg data
  - write to ipfs+level

- individual version imported
  - cid added to existing version metadata

## Steps to implement

- save/read responses to ipfs and save cids to leveldb ✅
- construct json object representing a version ✅
- construct json object representing whole package
- introduce signing to data

## Things to consider

- etag could possibly serve as a lightweight integrity check, depending on server implementation
- not all versions of a package will be imported but all versions will be known
- versions shouldn't change or be removed, only new ones added
