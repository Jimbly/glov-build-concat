// TODO: If a proc function returns an error, we don't handle that well between
//   runs, probably messes up our internal out_array and other caching?
const assert = require('assert');
const { asyncSeries, asyncEach } = require('glov-async');
const sourcemap = require('glov-build-sourcemap');

function nopProc(job, file, next) {
  next(null, file);
}

function sourcemapProc(job, file, next) {
  sourcemap.init(job, file, function (err, map, ignored, stripped) {
    if (err || !map) {
      return void next(err || `No sourcemap found for ${file.relative}`);
    }
    next(null, {
      contents: file.contents,
      code: stripped,
      map,
    });
  });
}

function outputSourcemap(job, opts, out_arr) {
  let { output } = opts;
  // Concatenate lines and sourcemaps
  let lines = [];
  let final_map = {
    mappings: [],
    sources: [],
    sourcesContent: [],
  };
  let name_to_idx = Object.create(null);
  let names = [];
  for (let ii = 0; ii < out_arr.length; ++ii) {
    let file = out_arr[ii];
    if (typeof file === 'string') { // preamble / postamble
      lines = lines.concat(file.split('\n'));
      continue;
    }
    let code = file.code;
    let new_lines = code.toString().split('\n');
    let map = file.map;
    map = sourcemap.decode(map);
    // combine
    assert(final_map.mappings.length <= lines.length);
    while (final_map.mappings.length < lines.length) {
      final_map.mappings.push([]); // [[]] instead?
    }
    assert(map.sources);
    assert(map.sourcesContent);
    assert.equal(map.sources.length, map.sourcesContent.length);
    let start_source_idx = final_map.sources.length;
    final_map.sources = final_map.sources.concat(map.sources);
    final_map.sourcesContent = final_map.sourcesContent.concat(map.sourcesContent);
    for (let line_num = 0; line_num < map.mappings.length; ++line_num) {
      let line_map = map.mappings[line_num];
      let out_line_map = [];
      for (let jj = 0; jj < line_map.length; ++jj) {
        let map_elem = line_map[jj];
        if (map_elem.length <= 1) {
          // just output char offset, meaningless? pass it through
          out_line_map.push(map_elem);
        } else if (map_elem.length === 4 || map_elem.length === 5) {
          let elem = [ // mostly pass-through
            map_elem[0],
            map_elem[1] + start_source_idx, // source file index
            map_elem[2],
            map_elem[3],
          ];
          if (map_elem.length === 5) {
            let name = map.names[map_elem[4]];
            assert(name);
            let name_idx = name_to_idx[name];
            if (name_idx === undefined) {
              name_idx = names.length;
              name_to_idx[name] = name_idx;
              names.push(name);
            }
            elem.push(name_idx);
          }
          out_line_map.push(elem);
        } else {
          assert(false);
        }
      }
      final_map.mappings.push(out_line_map);
    }
    lines = lines.concat(new_lines);
  }
  if (names.length) {
    final_map.names = names;
  }
  // Rename any duplicated sources, this avoids a bug on Chrome v102+
  let seen_sources = {};
  for (let ii = 0; ii < final_map.sources.length; ++ii) {
    let fn = final_map.sources[ii];
    if (seen_sources[fn]) {
      seen_sources[fn]++;
      final_map.sources[ii] = `${fn}(${seen_sources[fn]})`;
    } else {
      seen_sources[fn] = 1;
    }
  }
  sourcemap.out(job, {
    relative: output,
    contents: Buffer.from(lines.join('\n')),
    map: sourcemap.encode(output, final_map),
    inline: typeof opts.sourcemap === 'object' ? opts.sourcemap.inline : false,
  });
}

module.exports = function concat(opts) {
  let { preamble, postamble, proc, output, key, comparator } = opts;
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
    if (a[key] !== b[key]) {
      return a[key] < b[key] ? -1 : 1;
    }
    if (a.priority !== undefined && b.priority !== undefined) {
      return a.priority > b.priority ? -1 : 1;
    }
    return 0;
  }
  comparator = comparator || cmp;

  let do_sourcemaps = Boolean(opts.sourcemap);
  if (do_sourcemaps) {
    assert(!opts.proc, 'sourcemap option not currently compatible with proc option'); // Could chain, if needed
    proc = sourcemapProc;
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
            return next();
          }
          if (!job.isFileBase(f)) {
            return next();
          }
          proc(job, f, function (err, outfile) {
            if (err) {
              return void next(err);
            }
            if (!outfile) {
              // skip it
              assert(!user_data.file_map[f.relative]);
              return next();
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
                user_data.out_arr[existing[IDX]] = do_sourcemaps ? outfile : outfile.contents;
              }
            }
            next();
          });
        }, next);
      },
      function (next) {
        job.log(`concat: ${list_change + updates} updates`);
        if (list_change || !user_data.out_arr) {
          // Rebuild array to be concatenated
          user_data.file_list = Object.values(user_data.file_map).sort(comparator);
          user_data.out_arr = [];
          if (preamble) {
            user_data.out_arr.push(preamble);
          }
          let prev_elem_key = {};
          for (let ii = 0; ii < user_data.file_list.length; ++ii) {
            let elem = user_data.file_list[ii];
            if (prev_elem_key === elem[key]) {
              // same key, we must be lower priority, skip
            } else {
              elem[IDX] = user_data.out_arr.length;
              user_data.out_arr.push(do_sourcemaps ? elem : elem.contents);
              prev_elem_key = elem[key];
            }
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
              let file = files[ii];
              let next_file = files[ii + 1];
              if (file[key] === next_file[key] && file.priority === next_file.priority) {
                job.error(`Two elements with the same key ${key}="${file[key]}"${file.priority !== undefined ?
                  ` and same priority=${file.priority}` : ''}: ` +
                  `${file.relative} and ${next_file.relative}`);
                user_data.had_dup = true;
              }
            }
          }
        }

        if (opts.sourcemap) {
          outputSourcemap(job, opts, user_data.out_arr);
        } else {
          job.out({
            relative: output,
            contents: Buffer.from(user_data.out_arr.join('\n')),
          });
        }
        next();
      },
    ], done);
  }
  return {
    type: 'all',
    func: concatFunc,
    version: [
      outputSourcemap,
      opts,
      ...(opts.version || []),
    ],
  };
};
