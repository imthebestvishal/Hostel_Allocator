const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const backendDir = path.join(__dirname, '..', 'backend');
const files = fs.readdirSync(backendDir)
  .filter((file) => file.endsWith('.js'))
  .sort();

const bundle = files
  .map((file) => `\n// ${file}\n${fs.readFileSync(path.join(backendDir, file), 'utf8')}`)
  .join('\n');

assert.doesNotThrow(
  () => new vm.Script(bundle, { filename: 'apps-script-bundle.js' }),
  'Apps Script combines every backend file into one global scope; the combined bundle must parse without duplicate declarations.'
);

console.log(`Apps Script combined-scope syntax test passed (${files.length} files).`);
