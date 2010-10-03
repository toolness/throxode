*Throxode* is a simple throttling HTTP proxy for node.js. At present,
it's a bit akin to [throxy.py][], only in JavaScript instead of Python.

There are currently a few quirks with it, and I'm not sure if they're
my doing or latent bugs in node. I suspect they're the former, but the
stack traces often don't have my code anywhere in them. Dan Mosedale
has managed to identify one of the errors as node.js's [issue 242][].

  [throxy.py]: http://github.com/jcrocholl/throxy/blob/master/throxy.py
  [issue 242]: http://github.com/ry/node/issues/issue/242
