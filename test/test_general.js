const { doTest } = require('./runner.js');
const gb = require('glov-build');
const concat = require('../');

gb.task({
  name: 'simple',
  input: '*.txt',
  target: 'dev',
  ...concat({
    output: 'all.txt',
  }),
});

doTest({
  input: {
    'file1.txt': 'file1',
    'file2.txt': 'file2',
  },
  output: {
    'all.txt': 'file1\nfile2',
  },
  tasks: ['simple'],
});
