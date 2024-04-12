const { doTest } = require('./runner.js');
const assert = require('assert');
const gb = require('glov-build');
const concat = require('../');
const fs = require('fs');
const path = require('path');

gb.task({
  name: 'jsmap',
  input: '*.js',
  target: 'dev',
  ...concat({
    output: 'all.js',
    sourcemap: { inline: false },
  }),
});

doTest({
  input: {
    'a.js': fs.readFileSync(path.join(__dirname, 'fixtures', 'a.js')),
    'b.js': fs.readFileSync(path.join(__dirname, 'fixtures', 'b.js')),
    'b.js.map': fs.readFileSync(path.join(__dirname, 'fixtures', 'b.js.map')),
  },
  output: {
  },
  tasks: ['jsmap'],
  checker: function (outdir) {
    let map_src = fs.readFileSync(path.join(outdir, 'all.js.map'), 'utf8');
    let map = JSON.parse(map_src);
    // Ensure the same source is not listed twice - this will trigger a bug in Chrome v102+
    for (let ii = 0; ii < map.sources.length; ++ii) {
      for (let jj = ii + 1; jj < map.sources.length; ++jj) {
        assert(map.sources[jj] !== map.sources[ii]);
      }
    }
  },
});
