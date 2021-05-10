var assert = require('assert');
const go = require('../lib/managers/go');

let chai = require('chai');
let chaiHttp = require('chai-http');
let should = chai.should();
chai.use(chaiHttp);

describe('importLatest', async () => {
  it('should import latest version of a package', async () => {
    var name = 'github.com/stretchr/testify'
    var res = await go.importLatest(db, name)
    assert.equal(res.version, 'v1.7.0');
    assert.equal(res.cid, 'bafkreihexap2rcgvwe6wqrxdpoz4a37ovhnvhar3nwox4rmu25sumvt2aq');
  })
})

describe('importPackage', async () => {
  it('should import go packages', async () => {
    var name = 'github.com/stretchr/testify'
    var version = 'v1.6.1'
    var url = "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.6.1.zip"

    var cid = await go.importPackage(db, name, version, url)

    assert.equal(cid, 'bafkreia4pesx6qj2mi77eqkfe4pommjukwf3lomgmczwnytqz6xy4gf7ae');
  });
})

describe('parseGoSum', async function() {
  it('should parse a go.sum file', async () => {
    var filepath = "./test/fixtures/go.sum"
    var pkgs = go.parseGoSum(filepath)
    assert.equal(pkgs.length, 139)
    assert.deepEqual(pkgs[0], {
      manager: 'go',
      name: 'github.com/!burnt!sushi/toml',
      version: 'v0.3.1',
      resolved: 'https://proxy.golang.org/github.com/!burnt!sushi/toml/@v/v0.3.1.zip',
      integrity: 'h1:WXkYYl6Yr3qBf1K79EBnL4mak0OimBfB0XUf9Vl28OQ='
    })
  })
})

describe('escape', async function() {
  it('should replace capital letters with !lower', async () => {
    var url = 'github.com/BurntSushi/toml'
    var res = go.escape(url)
    assert.equal(res, 'github.com/!burnt!sushi/toml')
  })
})

describe('verify', async function() {
  it('should download version from ipfs and verify the integrity', async () => {
    var name = 'github.com/stretchr/testify'
    var version = 'v1.6.1'
    var cid = 'bafkreia4pesx6qj2mi77eqkfe4pommjukwf3lomgmczwnytqz6xy4gf7ae'
    var res = await go.verify(db, name, version, cid)
    assert.equal(res, true)
  })
})

describe('fetchVersionsList', async function() {
  it('load list of versions for a package', async () => {
    var name = 'github.com/stretchr/testify'
    var res = await go.fetchVersionsList(db, name)
    assert.equal(res, `v1.3.0
v1.7.0
v1.5.1
v1.6.0
v1.1.1
v1.5.0
v1.1.3
v1.1.2
v1.2.1
v1.4.0
v1.1.4
v1.2.0
v1.2.2
v1.6.1
`)
  })
})

describe('getLatestVersion', async function() {
  it('should fetch latest version for a module', async () => {
    var name = 'github.com/stretchr/testify'
    var res = await go.getLatestVersion(db, name)
    assert.equal(res, 'v1.7.0')
  })
})

describe('serverHandler', async function() {
  it('respond to list requests', async () => {
    var name = 'github.com/stretchr/testify'
    var path = `/${name}/@v/list`

    chai.request(server)
            .get(path)
            .set('user-agent', 'Go-http-client/1.1')
            .end((err, res) => {

                  res.should.have.status(200);
                  res.text.length.should.be.eql(98);
                  res.text.should.be.eql(`v1.3.0
v1.7.0
v1.5.1
v1.6.0
v1.1.1
v1.5.0
v1.1.3
v1.1.2
v1.2.1
v1.4.0
v1.1.4
v1.2.0
v1.2.2
v1.6.1
`);
                })
  })

  it('respond to latest requests', (done) => {
    var name = 'github.com/stretchr/testify'
    var path = `/${name}/@latest`
    chai.request(server)
            .get(path)
            .set('user-agent', 'Go-http-client/1.1')
            .end((err, res) => {
                  chai.expect(err).to.not.exist;
                  res.should.have.status(200);
                  res.text.should.be.eql('{"Version":"v1.7.0","Time":"2021-01-13T09:54:11Z"}');
                  done()
                })
  })

  it('respond to info requests', (done) => {
    var name = 'github.com/stretchr/testify'
    var version = 'v1.7.0'
    var path = `/${name}/@v/${version}.info`
    chai.request(server)
            .get(path)
            .set('user-agent', 'Go-http-client/1.1')
            .end((err, res) => {
                  chai.expect(err).to.not.exist;
                  res.should.have.status(200);
                  res.body.should.be.eql({"Version":"v1.7.0","Time":"2021-01-13T09:54:11Z"});
                  done()
                })
  })

  it('respond to mod requests', (done) => {
    var name = 'github.com/stretchr/testify'
    var version = 'v1.7.0'
    var path = `/${name}/@v/${version}.mod`
    chai.request(server)
            .get(path)
            .set('user-agent', 'Go-http-client/1.1')
            .end((err, res) => {
                  chai.expect(err).to.not.exist;
                  res.should.have.status(200);
                  res.text.should.be.eql(`module github.com/stretchr/testify

go 1.13

require (
	github.com/davecgh/go-spew v1.1.0
	github.com/pmezard/go-difflib v1.0.0
	github.com/stretchr/objx v0.1.0
	gopkg.in/yaml.v3 v3.0.0-20200313102051-9f266ea9e77c
)
`);
                done()
                })
  })

  it('respond to zip requests', (done) => {
    var name = 'github.com/stretchr/testify'
    var version = 'v1.7.0'
    var path = `/${name}/@v/${version}.zip`
    chai.request(server)
            .get(path)
            .set('user-agent', 'Go-http-client/1.1')
            .end((err, res) => {
                  chai.expect(err).to.not.exist;
                  res.should.have.status(200);
                  done()
                })
  })

  it('respond to sumdb requests', (done) => {
    var name = 'github.com/stretchr/testify'
    var version = 'v1.7.0'
    var path = `/sumdb/sum.golang.org/lookup/${name}@${version}`
    chai.request(server)
            .get(path)
            .set('user-agent', 'Go-http-client/1.1')
            .end((err, res) => {
                  chai.expect(err).to.not.exist;
                  res.should.have.status(200);
                  res.text.length.should.be.eql(367);
                  done()
                })
  })
})

describe('versionAsJson', async function() {
  it('should return a json representation of a version', async () => {
    var name = 'github.com/stretchr/testify'
    var version = 'v1.7.0'
    var json = await go.versionAsJson(db, name, version)

    assert.deepEqual(json, {
      manager: 'go',
      registry: 'https://proxy.golang.org/',
      name: 'github.com/stretchr/testify',
      number: 'v1.7.0',
      url: "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.7.0.zip",
      integrity: 'nwc3DEeHmmLAfoZucVR881uASk0Mfjw8xYJ99tb5CcY=',
      cid: 'bafkreihexap2rcgvwe6wqrxdpoz4a37ovhnvhar3nwox4rmu25sumvt2aq',
      responses: {
        info: {
          "body": "bafkreiexbc7j6lumu5vxqocijqmqesah6uatux4yk5wjtkqn65zwef7kdm",
          "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.7.0.info"
        },
        mod: {
          "body": "bafkreih77ali3ghgubyvnrcuug3osjkqt4yxp2lmcvkrnv7znnahttfdx4",
          "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.7.0.mod"
        }
      }
    })
  })
})

describe('packageAsJson', async function() {
  it('should return a json representation of a package', async () => {
    var name = 'github.com/stretchr/testify'
    var json = await go.packageAsJson(db, name)

    console.log(JSON.stringify(json, null, 4))

    assert.deepEqual(json, {
      "manager": "go",
      "registry": "https://proxy.golang.org/",
      "name": "github.com/stretchr/testify",
      "versions": {
          "v1.3.0": {
              "manager": "go",
              "registry": "https://proxy.golang.org/",
              "name": "github.com/stretchr/testify",
              "number": "v1.3.0",
              "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.3.0.zip",
              "integrity": "TivCn/peBQ7UY8ooIcPgZFpTNSz0Q2U6UrFlUfqbe0Q=",
              "cid": null,
              "responses": {
                  "info": {
                      "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.3.0.info",
                      "body": null
                  },
                  "mod": {
                      "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.3.0.mod",
                      "body": null
                  }
              }
          },
          "v1.7.0": {
              "manager": "go",
              "registry": "https://proxy.golang.org/",
              "name": "github.com/stretchr/testify",
              "number": "v1.7.0",
              "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.7.0.zip",
              "integrity": "nwc3DEeHmmLAfoZucVR881uASk0Mfjw8xYJ99tb5CcY=",
              "cid": "bafkreihexap2rcgvwe6wqrxdpoz4a37ovhnvhar3nwox4rmu25sumvt2aq",
              "responses": {
                  "info": {
                      "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.7.0.info",
                      "body": "bafkreiexbc7j6lumu5vxqocijqmqesah6uatux4yk5wjtkqn65zwef7kdm"
                  },
                  "mod": {
                      "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.7.0.mod",
                      "body": "bafkreih77ali3ghgubyvnrcuug3osjkqt4yxp2lmcvkrnv7znnahttfdx4"
                  }
              }
          },
          "v1.5.1": {
              "manager": "go",
              "registry": "https://proxy.golang.org/",
              "name": "github.com/stretchr/testify",
              "number": "v1.5.1",
              "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.5.1.zip",
              "integrity": "nOGnQDM7FYENwehXlg/kFVnos3rEvtKTjRvOWSzb6H4=",
              "cid": null,
              "responses": {
                  "info": {
                      "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.5.1.info",
                      "body": null
                  },
                  "mod": {
                      "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.5.1.mod",
                      "body": null
                  }
              }
          },
          "v1.6.0": {
              "manager": "go",
              "registry": "https://proxy.golang.org/",
              "name": "github.com/stretchr/testify",
              "number": "v1.6.0",
              "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.6.0.zip",
              "integrity": "jlIyCplCJFULU/01vCkhKuTyc3OorI3bJFuw6obfgho=",
              "cid": null,
              "responses": {
                  "info": {
                      "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.6.0.info",
                      "body": null
                  },
                  "mod": {
                      "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.6.0.mod",
                      "body": null
                  }
              }
          },
          "v1.1.1": {
              "manager": "go",
              "registry": "https://proxy.golang.org/",
              "name": "github.com/stretchr/testify",
              "number": "v1.1.1",
              "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.1.1.zip",
              "integrity": "/Box+ZZJaXnWRh0iQMXTpvCvCp4jJBdkbAUOqWmg/qI=",
              "cid": null,
              "responses": {
                  "info": {
                      "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.1.1.info",
                      "body": null
                  },
                  "mod": {
                      "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.1.1.mod",
                      "body": null
                  }
              }
          },
          "v1.5.0": {
              "manager": "go",
              "registry": "https://proxy.golang.org/",
              "name": "github.com/stretchr/testify",
              "number": "v1.5.0",
              "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.5.0.zip",
              "integrity": "DMOzIV76tmoDNE9pX6RSN0aDtCYeCg5VueieJaAo1uw=",
              "cid": null,
              "responses": {
                  "info": {
                      "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.5.0.info",
                      "body": null
                  },
                  "mod": {
                      "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.5.0.mod",
                      "body": null
                  }
              }
          },
          "v1.1.3": {
              "manager": "go",
              "registry": "https://proxy.golang.org/",
              "name": "github.com/stretchr/testify",
              "number": "v1.1.3",
              "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.1.3.zip",
              "integrity": "76sIvNG1I8oBerx/MvuVHh5HBWBW7oxfsi3snKIsz5w=",
              "cid": null,
              "responses": {
                  "info": {
                      "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.1.3.info",
                      "body": null
                  },
                  "mod": {
                      "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.1.3.mod",
                      "body": null
                  }
              }
          },
          "v1.1.2": {
              "manager": "go",
              "registry": "https://proxy.golang.org/",
              "name": "github.com/stretchr/testify",
              "number": "v1.1.2",
              "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.1.2.zip",
              "integrity": "QFDOepAvHBWiCBkOcExyHwJmxDzp/jJvBL3X9KaAdRI=",
              "cid": null,
              "responses": {
                  "info": {
                      "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.1.2.info",
                      "body": null
                  },
                  "mod": {
                      "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.1.2.mod",
                      "body": null
                  }
              }
          },
          "v1.2.1": {
              "manager": "go",
              "registry": "https://proxy.golang.org/",
              "name": "github.com/stretchr/testify",
              "number": "v1.2.1",
              "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.2.1.zip",
              "integrity": "52QO5WkIUcHGIR7EnGagH88x1bUzqGXTC5/1bDTUQ7U=",
              "cid": null,
              "responses": {
                  "info": {
                      "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.2.1.info",
                      "body": null
                  },
                  "mod": {
                      "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.2.1.mod",
                      "body": null
                  }
              }
          },
          "v1.4.0": {
              "manager": "go",
              "registry": "https://proxy.golang.org/",
              "name": "github.com/stretchr/testify",
              "number": "v1.4.0",
              "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.4.0.zip",
              "integrity": "2E4SXV/wtOkTonXsotYi4li6zVWxYlZuYNCXe9XRJyk=",
              "cid": null,
              "responses": {
                  "info": {
                      "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.4.0.info",
                      "body": null
                  },
                  "mod": {
                      "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.4.0.mod",
                      "body": null
                  }
              }
          },
          "v1.1.4": {
              "manager": "go",
              "registry": "https://proxy.golang.org/",
              "name": "github.com/stretchr/testify",
              "number": "v1.1.4",
              "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.1.4.zip",
              "integrity": "ToftOQTytwshuOSj6bDSolVUa3GINfJP/fg3OkkOzQQ=",
              "cid": null,
              "responses": {
                  "info": {
                      "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.1.4.info",
                      "body": null
                  },
                  "mod": {
                      "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.1.4.mod",
                      "body": null
                  }
              }
          },
          "v1.2.0": {
              "manager": "go",
              "registry": "https://proxy.golang.org/",
              "name": "github.com/stretchr/testify",
              "number": "v1.2.0",
              "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.2.0.zip",
              "integrity": "LThGCOvhuJic9Gyd1VBCkhyUXmO8vKaBFvBsJ2k03rg=",
              "cid": null,
              "responses": {
                  "info": {
                      "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.2.0.info",
                      "body": null
                  },
                  "mod": {
                      "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.2.0.mod",
                      "body": null
                  }
              }
          },
          "v1.2.2": {
              "manager": "go",
              "registry": "https://proxy.golang.org/",
              "name": "github.com/stretchr/testify",
              "number": "v1.2.2",
              "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.2.2.zip",
              "integrity": "bSDNvY7ZPG5RlJ8otE/7V6gMiyenm9RtJ7IUVIAoJ1w=",
              "cid": null,
              "responses": {
                  "info": {
                      "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.2.2.info",
                      "body": null
                  },
                  "mod": {
                      "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.2.2.mod",
                      "body": null
                  }
              }
          },
          "v1.6.1": {
              "manager": "go",
              "registry": "https://proxy.golang.org/",
              "name": "github.com/stretchr/testify",
              "number": "v1.6.1",
              "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.6.1.zip",
              "integrity": "hDPOHmpOpP40lSULcqw7IrRb/u7w6RpDC9399XyoNd0=",
              "cid": "bafkreia4pesx6qj2mi77eqkfe4pommjukwf3lomgmczwnytqz6xy4gf7ae",
              "responses": {
                  "info": {
                      "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.6.1.info",
                      "body": null
                  },
                  "mod": {
                      "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/v1.6.1.mod",
                      "body": null
                  }
              }
          }
      },
      "responses": {
          "versions": {
              "url": "https://proxy.golang.org/github.com/stretchr/testify/@v/list",
              "body": "bafkreidhrrlegp6ppbq53o3mgeqmtsetm5mq3rxummfiknonfeijj4rv4y"
          },
          "latest": {
              "url": "https://proxy.golang.org/github.com/stretchr/testify/@latest",
              "body": "bafkreiexbc7j6lumu5vxqocijqmqesah6uatux4yk5wjtkqn65zwef7kdm"
          }
      }
    })
  })
})
