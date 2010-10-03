var http = require('http');

const DEFAULT_PORTS = {
  "http:": 80,
  "https:": 443
};

const PROXY = {
  host: "127.0.0.1",
  port: 8080
};

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

  sourceStream.on('data', function onSourceData(chunk) {
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
  });

  function finish() {
    destStream.end();
    if (cb)
      cb();
  }

  sourceStream.on('end', function onSourceEnd() {
    expectMoreData = false;
    if (!paused)
      finish();
  });
}

setInterval(function() {
  throttleInfo.bytes.downstream = 0;
  throttleInfo.bytes.upstream = 0;
  var cbs = throttleInfo.onNextTick;
  throttleInfo.onNextTick = [];
  cbs.forEach(function(cb) { cb(); });
}, 1000);

function filterHeaders(raw) {
  var headers = {};

  for (name in raw)
    if (!/^(proxy-|keep-alive|connection)/.test(name))
      headers[name] = raw[name];

  return headers;
}

http.createServer(function(browserReq, browserRes) {
  var uri = require("url").parse(browserReq.url);
  if (uri.port == undefined)
    uri.port = DEFAULT_PORTS[uri.protocol];
  var pathname = uri.search ? uri.pathname + uri.search : uri.pathname;
  var server = http.createClient(uri.port, uri.hostname);
  var name = browserReq.method + " " + browserReq.url;

  console.log(name);

  var serverReq = server.request(browserReq.method,
                                 pathname,
                                 filterHeaders(browserReq.headers));

  throxy(name, 'upstream', browserReq, serverReq, function onReqBodySent() {
    serverReq.on('response', function(serverRes) {
      browserRes.writeHead(serverRes.statusCode,
                           filterHeaders(serverRes.headers));
      throxy(name, 'downstream', serverRes, browserRes);
    });
  });
}).listen(PROXY.port, PROXY.host);

console.log("HTTP proxy running on ", PROXY.host, "port", PROXY.port);
