Concat task processor for [glov-build](https://github.com/Jimbly/glov-build)
=============================

Concatenates the inputs, separated by `\n`, with optimal run-time caching for quick dynamic reprocessing.  Optional processing function that converts an input file into a `String` or `Buffer`, pre- and post- strings, and configurable sort key.

API usage:
```javascript
const concat = require('glov-build-concat');

gb.task({
  name: ...,
  input: ...,
  ...concat(options),
});
```
Options
* **output** - required output file name
* **preamble** - optional string to be prepended to the output (if non-empty, separated by `\n` from first source).  Default: `''`.
* **postamble** - optional string to be appended to the output (if non-empty, separated by `\n` from last source).  Default: `''`.
* **key** - optional sort key for deterministically ordering the outputs and checking for duplicates.  Default: `'relative'`.
* **proc** - optional processing function that takes the job and a file and returns an object with at least a `contents` member, but may also contain a member named as specified by `key` to impact sorting / duplicate detection.  Default: `(job, file, next) => next(null, file)`.  Note: when doing dynamic reprocessing, this will *only* be called on the files which have changed and were not deleted.


Example usage:
```javascript
const concat = require('glov-build.-concat');
gb.task({
  name: 'simple',
  input: '*.txt',
  ...concat({
    output: 'all.txt',
  }),
});

const path = require('path');
gb.task({
  name: 'webfs',
  input: '*.bin',
  ...concat({
    preamble: '(function () { var fs = window.fs = {};',
    postamble: '}());',
    key: 'name',
    proc: (job, file, next) => {
      let name = path.basename(file.relative);
      next(null, {
        name,
        contents: `fs.${name}="${file.contents.toString('base64')}";`,
      });
    },
    output: 'webfs.js',
  }),
});

```
