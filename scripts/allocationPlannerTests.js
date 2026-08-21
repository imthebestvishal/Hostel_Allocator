const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const repoRoot = path.resolve(__dirname, '..');
const allocationEnginePath = path.join(repoRoot, 'backend', 'AllocationEngine.js');
const sandbox = {
  console,
  Date,
  Map,
  Set,
  Math,
  Utilities: { getUuid: () => 'test-uuid' }
};

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(allocationEnginePath, 'utf8'), sandbox, { filename: allocationEnginePath });

function student(overrides) {
  return {
    ApplicationID: overrides.ApplicationID || overrides.EnrollmentNo,
    EnrollmentNo: overrides.EnrollmentNo,
    Name: overrides.Name || overrides.EnrollmentNo,
    Gender: overrides.Gender || 'Male',
    Priority: overrides.Priority || 5,
    TwelfthMarks: overrides.TwelfthMarks || 75,
    DistanceKm: overrides.DistanceKm || 10,
    Timestamp: overrides.Timestamp || '2026-01-01T00:00:00Z',
    HostelPref: overrides.HostelPref || ''
  };
}

function room(overrides) {
  return {
    RoomID: overrides.RoomID,
    HostelName: overrides.HostelName || 'EDC Boys Hostel',
    HostelType: overrides.HostelType || 'Boys',
    Floor: overrides.Floor || 'Floor 1',
    RoomNumber: overrides.RoomNumber || overrides.RoomID,
    Capacity: overrides.Capacity || 1,
    Occupied: overrides.Occupied || 0,
    VacantBeds: overrides.VacantBeds || 1,
    Status: 'Active'
  };
}

function allocatedEnrollments(plan) {
  return Array.from(plan.allocations.map(a => a.EnrollmentNo));
}

function testPriorityOrder() {
  const students = [
    student({ EnrollmentNo: 'P4', Priority: 4, DistanceKm: 300 }),
    student({ EnrollmentNo: 'P1', Priority: 1 }),
    student({ EnrollmentNo: 'P2B', Priority: 2, TwelfthMarks: 80 }),
    student({ EnrollmentNo: 'P2A', Priority: 2, TwelfthMarks: 95 })
  ];
  const rooms = [room({ RoomID: 'R1' }), room({ RoomID: 'R2' })];
  const plan = sandbox.buildAllocationPlan(students, rooms, 'SORTING');
  assert.strictEqual(JSON.stringify(allocatedEnrollments(plan)), JSON.stringify(['P1', 'P2A']));
  assert.strictEqual(plan.waitlist[0].EnrollmentNo, 'P2B');
}

function testOptimizedPreference() {
  const students = [
    student({ EnrollmentNo: 'S1', Priority: 1, HostelPref: 'R2' }),
    student({ EnrollmentNo: 'S2', Priority: 2 })
  ];
  const rooms = [
    room({ RoomID: 'R1', RoomNumber: 'R1' }),
    room({ RoomID: 'R2', RoomNumber: 'R2' })
  ];
  const sorting = sandbox.buildAllocationPlan(students, rooms, 'SORTING');
  const optimized = sandbox.buildAllocationPlan(students, rooms, 'OPTIMIZED');
  assert.strictEqual(sorting.allocations[0].RoomID, 'R1');
  assert.strictEqual(optimized.allocations[0].RoomID, 'R2');
}

function testCapacity() {
  const students = [
    student({ EnrollmentNo: 'S1', Priority: 1 }),
    student({ EnrollmentNo: 'S2', Priority: 2 }),
    student({ EnrollmentNo: 'S3', Priority: 3 })
  ];
  const rooms = [room({ RoomID: 'R1', Capacity: 2, VacantBeds: 2 })];
  const plan = sandbox.buildAllocationPlan(students, rooms, 'OPTIMIZED');
  assert.strictEqual(plan.allocations.length, 2);
  assert.strictEqual(plan.waitlist.length, 1);
  assert.strictEqual(plan.roomsMap.get('R1').VacantBeds, 0);
}

testPriorityOrder();
testOptimizedPreference();
testCapacity();
console.log('Allocation planner tests passed.');
