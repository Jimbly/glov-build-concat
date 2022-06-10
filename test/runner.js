exports.doTest = doTest;

const assert = require('assert');
const gb = require('glov-build');
const fs = require('fs');
const path = require('path');

const targets = {
  dev: path.join(__dirname, 'out/dev'),
};

const WORK_DIR = path.join(__dirname, 'work');
const STATE_DIR = path.join(__dirname, 'out/.gbstate');

function setup(files) {
  for (let key in files) {
    let filename = path.join(WORK_DIR, key);
    if (!fs.existsSync(path.dirname(filename))) {
      fs.mkdirSync(path.dirname(filename));
    }
    fs.writeFileSync(filename, files[key]);
  }
}

function check(files) {
  for (let key in files) {
    let filename = path.join(targets.dev, key);
    let data = fs.readFileSync(filename, 'utf8');
    assert.equal(data, files[key]);
  }
}

gb.configure({
  source: WORK_DIR,
  statedir: STATE_DIR,
  targets,
  log_level: gb.LOG_SILLY,
});

let check_fn;
let expected_output;
function onDone() {
  check(expected_output);
  if (check_fn) {
    check_fn(targets.dev);
  }
  console.log('Done!');
}


function doTest({ input, output, tasks, checker }) {
  setup(input);
  check_fn = checker;
  expected_output = output;
  gb.once('done', onDone);
  gb.go({
    tasks,
  });
}
