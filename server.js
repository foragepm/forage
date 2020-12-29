var httpProxy = require('http-proxy');

var proxy = httpProxy.createServer({
  target:'https://registry.npmjs.org/'
});

proxy.listen(8005);

proxy.on('error', function (err, req, res) {
  console.log(err)
  console.log(req)
  console.log(res)
});

proxy.on('proxyReq', function (proxyReq, req, res) {
  console.log(proxyReq.path)
});

// proxy.on('proxyRes', function (proxyRes, req, res) {
//   console.log('RAW Response from the target', JSON.stringify(proxyRes.headers, true, 2));
// });
