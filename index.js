const assert = require('assert');
const { asyncSeries, asyncEach } = require('glov-async');

function nopProc(job, file, next) {
  next(null, file);
}

module.exports = function concat(opts) {
  let { preamble, postamble, proc, output, key } = opts;
  proc = proc || nopProc;
  preamble = preamble || '';
  postamble = postamble || '';
  key = key || 'relative';
  assert.equal(typeof output, 'string');
  assert.equal(typeof proc, 'function');
  assert.equal(typeof preamble, 'string');
  assert.equal(typeof postamble, 'string');
  assert.equal(typeof key, 'string');

  const IDX = Symbol('idx');

  function cmp(a, b) {
    return a[key] < b[key] ? -1 : 1;
  }

  function concatFunc(job, done) {
    let updated_files = job.getFilesUpdated();
    let user_data = job.getUserData();
    user_data.file_map = user_data.file_map || {};

    let list_change = 0;
    let updates = 0;
    asyncSeries([
      function (next) {
        asyncEach(updated_files, function (f, next) {
          if (!f.contents) {
            if (user_data.file_map[f.relative]) {
              ++list_change;
              delete user_data.file_map[f.relative];
            }
            next();
          } else {
            proc(job, f, function (err, outfile) {
              if (err) {
                return void next(err);
              }
              assert(outfile);
              assert(outfile.contents);
              if (!outfile.relative) {
                outfile.relative = f.relative;
              }
              // Caller shouldn't be explicitly storing a different relative path
              assert.equal(outfile.relative, f.relative);
              if (Buffer.isBuffer(outfile.contents)) {
                let contents = outfile.contents.toString();
                outfile = {
                  ...outfile,
                  contents,
                };
              }
              assert.equal(typeof outfile.contents, 'string');
              let existing = user_data.file_map[f.relative];
              if (!existing) {
                ++list_change;
                user_data.file_map[f.relative] = outfile;
              } else {
                // Name not allowed to change, assume canonized from f.relative
                assert.equal(existing[key], outfile[key]);
                ++updates;
                user_data.file_map[f.relative] = outfile;
                if (existing[IDX] !== undefined) {
                  outfile[IDX] = existing[IDX];
                  user_data.out_arr[existing[IDX]] = outfile.contents;
                }
              }
              next();
            });
          }
        }, next);
      },
      function (next) {
        if (list_change || !user_data.out_arr) {
          // Rebuild array to be concatenated
          user_data.file_list = Object.values(user_data.file_map).sort(cmp);
          user_data.out_arr = [];
          if (preamble) {
            user_data.out_arr.push(preamble);
          }
          for (let ii = 0; ii < user_data.file_list.length; ++ii) {
            let elem = user_data.file_list[ii];
            elem[IDX] = user_data.out_arr.length;
            user_data.out_arr.push(elem.contents);
          }
          if (postamble) {
            user_data.out_arr.push(postamble);
          }
        }
        if (key !== 'relative') {
          if (list_change || user_data.had_dup) {
            // Check for dups
            let files = user_data.file_list;
            user_data.had_dup = false;
            for (let ii = 0; ii < files.length - 1; ++ii) {
              if (files[ii][key] === files[ii + 1][key]) {
                job.error(`Two elements with the same ${key}: ` +
                  `${files[ii].relative} and ${files[ii + 1].relative}`);
                user_data.had_dup = true;
              }
            }
          }
        }

        job.log(`concat: ${list_change + updates} updates`);

        job.out({
          relative: output,
          contents: Buffer.from(user_data.out_arr.join('\n')),
        });
        done();
      },
    ], done);
  }
  return {
    type: 'all',
    func: concatFunc,
  };
};
