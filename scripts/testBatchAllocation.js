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
  Utilities: { getUuid: () => 'test-uuid' },
  sendWaitlistNotification: () => {}
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

const rooms = [
  { RoomID: 'R-B-1', HostelType: 'Boys', HostelName: 'Boys', RoomNumber: 'B-101', Floor: 'Floor 1', Capacity: 2, Occupied: 0, VacantBeds: 2 }
];
const allocationPlan = sandbox.planAllocationGroup(boys.slice(0, 3), rooms, 1);
assert.strictEqual(allocationPlan.allocated, 2);
assert.strictEqual(allocationPlan.waitlisted, 1);
assert.strictEqual(allocationPlan.allocationRows.length, 2);
assert.strictEqual(allocationPlan.waitlistRows.length, 1);
assert.strictEqual(allocationPlan.statusUpdates.length, 3);
assert.strictEqual(allocationPlan.statusUpdates.filter(u => u.status === 'Allocated').length, 2);
assert.strictEqual(allocationPlan.statusUpdates.filter(u => u.status === 'Waitlisted').length, 1);

const statusSheet = {
  values: null,
  getRange(row, col, rows, cols) {
    assert.strictEqual(row, 2);
    assert.strictEqual(col, 20);
    assert.strictEqual(cols, 1);
    return {
      setValues: values => {
        assert.strictEqual(values.length, rows);
        this.values = values;
      }
    };
  }
};
const studentData = [
  ['ApplicationID', 'EnrollmentNo', 'Name', 'Gender', 'DOB', 'Email', 'Phone', 'Aadhaar', 'Programme', 'Branch', 'Year', 'TwelfthMarks', 'Category', 'State', 'ParentsTransferred', 'DistanceKm', 'PWD', 'HostelPref', 'RoommatePreference', 'Status'],
  ['A1', 'S-001', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'Pending'],
  ['A2', 'S-002', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'Pending']
];
sandbox.batchUpdateStudentStatuses(statusSheet, studentData, sandbox.buildStudentRowIndex(studentData), [
  { enrollmentNo: 'S-001', status: 'Allocated' },
  { enrollmentNo: 'S-002', status: 'Waitlisted' }
]);
assert.strictEqual(JSON.stringify(statusSheet.values), JSON.stringify([['Allocated'], ['Waitlisted']]));

console.log('Batch allocation tests passed.');
