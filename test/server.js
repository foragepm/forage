var assert = require('assert');

let chai = require('chai');
let chaiHttp = require('chai-http');
let expect = chai.expect;
chai.use(chaiHttp);

describe('http server', async function() {
  describe('createServer', async function() {
    it('responds to index requests', async () => {
      var path = `/`

      chai.request(server)
          .get(path)
          .end((err, res) => {
            expect(err).to.be.null;
            expect(res).to.be.html;
            expect(res).to.have.status(200);
          })
    })

    it('respond to missing pages with 404', async () => {
      var path = `/foobar`

      chai.request(server)
          .get(path)
          .end((err, res) => {
            expect(res).to.have.status(404);
          })
    })
  })
})
