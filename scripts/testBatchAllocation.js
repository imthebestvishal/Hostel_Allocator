const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync(path.join(__dirname, '..', 'backend', 'AllocationEngine.js'), 'utf8');
const sandbox = {
  console,
  Date,
  Math,
  Object,
  Utilities: { getUuid: () => 'test-uuid' }
};

vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'AllocationEngine.js' });

function student(index, overrides = {}) {
  return {
    EnrollmentNo: `S-${String(index).padStart(3, '0')}`,
    Gender: index % 2 === 0 ? 'Male' : 'Female',
    Priority: 4,
    TwelfthMarks: 70 + (index % 20),
    DistanceKm: index,
    Timestamp: new Date(2026, 0, index).toISOString(),
    ...overrides
  };
}

const boys = Array.from({ length: 100 }, (_, i) => student(i + 1, { Gender: 'Male', DistanceKm: i + 1 }));
const girls = Array.from({ length: 100 }, (_, i) => student(i + 1, { Gender: 'Female', DistanceKm: i + 1 }));

const boysBatch = sandbox.getSortedAllocationBatch(boys, 40);
const girlsBatch = sandbox.getSortedAllocationBatch(girls, 40);

assert.strictEqual(boysBatch.length, 40);
assert.strictEqual(girlsBatch.length, 40);
assert.strictEqual(boysBatch[0].EnrollmentNo, 'S-100');
assert.strictEqual(girlsBatch[0].EnrollmentNo, 'S-100');
assert.strictEqual(boysBatch[39].EnrollmentNo, 'S-061');
assert.strictEqual(girlsBatch[39].EnrollmentNo, 'S-061');

const existingBrokenHeaderAllocation = {
  '619051625': 'LOAD-202608211015-0050',
  'ALC-D5A73': 'ALC-AF4DE',
  '8/17/2026 10:51:29': '8/21/2026 15:53:31',
  'GGSIPU-2026-6F4E7': 'GGSIPU-2026-3CF59'
};

assert.strictEqual(
  sandbox.getAllocationEnrollmentNo(existingBrokenHeaderAllocation),
  'LOAD-202608211015-0050'
);

console.log('Batch allocation tests passed.');
