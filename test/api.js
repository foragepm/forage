var assert = require('assert');

let chai = require('chai');
let chaiHttp = require('chai-http');
let expect = chai.expect;
chai.use(chaiHttp);

describe('http api', async function() {
  describe('package list endpoint', async function() {
    it('responds to index requests', async () => {
      var path = `/~/api/packages`

      chai.request(server)
          .get(path)
          .end((err, res) => {
            expect(err).to.be.null;
            expect(res).to.be.json;
            expect(res).to.have.status(200);
          })
    })
  })

  describe('individiual package endpoint', async function() {
    it('responds to package requests', async () => {
      var path = `/~/api/packages/go/github.com/ipfs/go-ipfs`

      chai.request(server)
          .get(path)
          .end((err, res) => {
            expect(err).to.be.null;
            expect(res).to.be.json;
            expect(res).to.have.status(200);
          })
    })
  })

  describe('404', async function() {
    it('respond to missing pages with 404', async () => {
      var path = `/~/api/foobar`

      chai.request(server)
          .get(path)
          .end((err, res) => {
            expect(res).to.have.status(404);
          })
    })
  })
})
