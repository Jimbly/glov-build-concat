const { doTest } = require('./runner.js');
const gb = require('glov-build');
const concat = require('../');

gb.task({
  name: 'size_filter',
  input: '*.txt',
  target: 'dev',
  ...concat({
    output: 'all.txt',
    proc: function (job, file, next) {
      if (file.contents.length > 6) {
        return void next(null);
      }
      next(null, file);
    },
  }),
});

doTest({
  input: {
    'file1.txt': 'file1',
    'file2.txt': 'file2isratherbigger',
  },
  output: {
    'all.txt': 'file1',
  },
  tasks: ['size_filter'],
  watch: true,
  checker: function () {
    setImmediate(function () {
      doTest({
        input: {
          'file1.txt': 'file1',
          'file2.txt': 'file2',
        },
        output: {
          'all.txt': 'file1\nfile2',
        },
        tasks: ['size_filter'],
        checker: function () {
          setImmediate(function () {
            doTest({
              input: {
                'file1.txt': 'file1',
                'file2.txt': 'file2isratherbigger',
              },
              output: {
                'all.txt': 'file1',
              },
              tasks: ['size_filter'],
              checker: function () {
                gb.stop();
              }
            });
          });
        },
      });
    });
  },
});
