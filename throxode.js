var http = require('http');

var throttleInfo = {
  bytes: {
    downstream: 0,
    upstream: 0
  },
  maxPerSecond: {
    downstream: 3600,
    upstream: 3600
  },
  maxId: 0,
  onNextTick: []
};

function throxy(name, type, sourceStream, destStream, cb) {
  var max = throttleInfo.maxPerSecond[type];
  var id = throttleInfo.maxId++;
  var paused = false;
  var expectMoreData = true;

  function log() {
    var args = ["throttler:"+id+":"+name+":"+type];
    for (var i = 0; i < arguments.length; i++)
      args.push(arguments[i]);
    console.log.apply(console, args);
  }

  function onSourceData(chunk) {
    var startSlice = 0;

    function wait() {
      throttleInfo.onNextTick.push(push);
      if (!paused) {
        if (!expectMoreData)
          console.log("this may not work...");
        sourceStream.pause();
        paused = true;
      }
    }

    function push() {
      var size = max - throttleInfo.bytes[type];
      if (size > 0) {
        var endSlice = startSlice + size;
        if (endSlice > chunk.length)
          endSlice = chunk.length;
        var subChunk = chunk.slice(startSlice, endSlice);
        destStream.write(subChunk);
        startSlice = endSlice;
        if (endSlice == chunk.length) {
          if (paused) {
            sourceStream.resume();
            paused = false;
            if (!expectMoreData)
              finish();
          }
        } else
          wait();
      } else
        wait();
    }

    push();
  };

  function finish() {
    destStream.end();
    if (cb)
      cb();
  }

  function onSourceEnd() {
    expectMoreData = false;
    if (!paused)
      finish();
  };

  sourceStream.on('data', onSourceData);
  sourceStream.on('end', onSourceEnd);
}

setInterval(function() {
              throttleInfo.bytes.downstream = 0;
              throttleInfo.bytes.upstream = 0;
              var cbs = throttleInfo.onNextTick;
              throttleInfo.onNextTick = [];
              cbs.forEach(function(cb) { cb(); });
            },
            1000);

function filterHeaders(raw) {
  var headers = {};

  for (name in raw)
    if (!/^(proxy-|keep-alive|connection)/.test(name))
      headers[name] = raw[name];

  return headers;
}

http.createServer(
  function(browserReq, browserRes) {
    var host = browserReq.headers.host;
    var port = 80;
    var hostPortMatch = host.match(/^(.*):([0-9]+)$/);
    if (hostPortMatch) {
      host = hostPortMatch[1];
      port = parseInt(hostPortMatch[2]);
    }
    var server = http.createClient(port, host);
    var name = browserReq.method + " " + browserReq.url;
    console.log(name);

    var serverReq = server.request(browserReq.method,
                                   browserReq.url,
                                   filterHeaders(browserReq.headers));

    throxy(
      name, 'upstream', browserReq, serverReq,
      function onRequestBodySent() {
        serverReq.on(
          'response',
          function(serverRes) {
            browserRes.writeHead(serverRes.statusCode,
                                 filterHeaders(serverRes.headers));
            throxy(name, 'downstream', serverRes, browserRes);
          });
      });
  }).listen(8080, "127.0.0.1");
