Concat task processor for [glov-build](https://github.com/Jimbly/glov-build)
=============================

Concatenates the inputs, separated by `\n`, with optimal run-time caching for quick dynamic reprocessing.  Optional processing function that converts an input file into a `String` or `Buffer`, pre- and post- strings, configurable sort key, and sourcemap support.

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
* **`output`** - required output file name
* **`preamble`** - optional string to be prepended to the output (if non-empty, separated by `\n` from first source).  Default: `''`.
* **`postamble`** - optional string to be appended to the output (if non-empty, separated by `\n` from last source).  Default: `''`.
* **`key`** - optional key name for checking duplicates, also used as a sort key if no `comparator` is specified.  Can be the name of any member of a `BuildFile` (if no `proc` is specified) or any custom key on the object returned by your `proc`.  Default: `'relative'`.
* **`comparator`** - optional sort comparator for deterministically ordering the outputs.  Default: `(a,b) => a[key] < b[key] ? -1 : 1`
* **`proc`** - optional processing function that takes the job and a file and returns an object with at least a `contents` member, but may also contain a member named as specified by `key` to impact sorting / duplicate detection.  Default: `(job, file, next) => next(null, file)`.  Note: when doing dynamic reprocessing, this will *only* be called on the files which have changed and were not deleted.
* **`sourcemap`** - optional, set to enable loading/parsing sourcemaps associated with the inputs files and generating a combined sourcemap.  May specify `{ inline: true }` or `{ inline: false }`.  Specifying `true` is shorthand for `{ inline: false }` (will output a separate `.map` file adjacent to the concatenated file).  Default: `false`


Example usage:
```javascript
const concat = require('glov-build-concat');
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

gb.task({
  name: 'bundle',
  input: 'other_task:*.js',
  ...concat({
    preamble: '// Bundled.',
    output: 'all.js',
    sourcemap: { inline: true },
  }),
});

```
