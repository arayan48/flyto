const https = require('https');
const fs = require('fs');
const config = require('./config');
const app = require('./lib/endpoints');
const updateCheck = require('./lib/updateCheck');

// sid: a transfer (group of files), key: a file, fid: {sid}++{key}

let server;
let httpsServer;

app.ready.then(() => {
  if(config.port) {
    server = app.listen(config.port, config.iface, () => {
      console.log(`Flyto listening on http://${config.iface}:${config.port}`);
    });
  }

  if(config.sslPort && config.sslKeyFile && config.sslCertFile) {
    const sslOpts = {
      key: fs.readFileSync(config.sslKeyFile),
      cert: fs.readFileSync(config.sslCertFile)
    };
    httpsServer = https.createServer(sslOpts, app)
      .listen(config.sslPort, config.iface, () => {
        console.log(`Flyto listening on https://${config.iface}:${config.sslPort}`);
      });
  }
});

updateCheck.start(config);


function shutdown() {
  console.log('Flyto shutting down...');
  if(!server && !httpsServer) process.exit(0);
  if(server) {
    server.close(() => {
      server = false;
      if(!server && !httpsServer) process.exit(0);
    });
  }
  if(httpsServer) {
    httpsServer.close(() => {
      httpsServer = false;
      if(!server && !httpsServer) process.exit(0);
    });
  }
  setTimeout(function() {
    console.log('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 15 * 1000);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
