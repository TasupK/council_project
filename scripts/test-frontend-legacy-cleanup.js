const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
assert.ok(!fs.existsSync(path.join(root, 'src/100_common')), 'legacy 100_common must be removed');
assert.ok(!fs.existsSync(path.join(root, 'src/600_event')), 'legacy 600_event must be removed');
const srcEntries = fs.readdirSync(path.join(root, 'src')).sort();
assert.deepStrictEqual(srcEntries, ['appsscript.json', 'backend', 'frontend']);
console.log('Final frontend legacy cleanup contract: PASS');
