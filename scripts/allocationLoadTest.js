const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { performance } = require('perf_hooks');

const repoRoot = path.resolve(__dirname, '..');
const allocationEnginePath = path.join(repoRoot, 'backend', 'AllocationEngine.js');
const engineSource = fs.readFileSync(allocationEnginePath, 'utf8');
const sandbox = {
  console,
  Date,
  Map,
  Set,
  Math,
  Utilities: {
    getUuid: () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  }
};

vm.createContext(sandbox);
vm.runInContext(engineSource, sandbox, { filename: allocationEnginePath });

const METHODS = ['SORTING', 'OPTIMIZED'];
const SCENARIOS = [
  { name: 'under-capacity-100', students: 100, capacityRatio: 1.25, partialRooms: false, samePriority: false },
  { name: 'full-capacity-500', students: 500, capacityRatio: 1, partialRooms: false, samePriority: false },
  { name: 'over-capacity-1000', students: 1000, capacityRatio: 0.75, partialRooms: false, samePriority: false },
  { name: 'same-priority-1000', students: 1000, capacityRatio: 0.8, partialRooms: false, samePriority: true },
  { name: 'partial-rooms-5000', students: 5000, capacityRatio: 0.9, partialRooms: true, samePriority: false }
];

function pad(value, width) {
  const text = String(value);
  return text + ' '.repeat(Math.max(0, width - text.length));
}

function studentGender(index) {
  return index % 2 === 0 ? 'Male' : 'Female';
}

function studentHostelPref(gender, index) {
  if (index % 3 !== 0) return '';
  const roomNumber = String((index % 24) + 1).padStart(3, '0');
  return gender === 'Male' ? `B-${roomNumber}` : `G-${roomNumber}`;
}

function generateStudents(count, samePriority) {
  const students = [];
  const baseTime = Date.parse('2026-01-01T00:00:00Z');
  for (let i = 0; i < count; i++) {
    const gender = studentGender(i);
    const priority = samePriority ? 4 : (i % 5) + 1;
    students.push({
      ApplicationID: `APP-${i + 1}`,
      EnrollmentNo: `ENR-${String(i + 1).padStart(6, '0')}`,
      Name: `Student ${i + 1}`,
      Gender: gender,
      TwelfthMarks: 60 + (i % 41),
      DistanceKm: 5 + ((i * 17) % 350),
      Priority: priority,
      Timestamp: new Date(baseTime + i * 60000).toISOString(),
      HostelPref: studentHostelPref(gender, i),
      DocumentStatus: 'Verified',
      Status: 'Pending'
    });
  }
  return students;
}

function generateRooms(studentCount, capacityRatio, partialRooms) {
  const totalBeds = Math.max(1, Math.floor(studentCount * capacityRatio));
  const boysBeds = Math.ceil(totalBeds / 2);
  const girlsBeds = totalBeds - boysBeds;
  return [
    ...generateRoomsForType('Boys', 'B', boysBeds, partialRooms),
    ...generateRoomsForType('Girls', 'G', girlsBeds, partialRooms)
  ];
}

function generateRoomsForType(hostelType, prefix, beds, partialRooms) {
  const rooms = [];
  let remaining = beds;
  let index = 1;
  while (remaining > 0) {
    const capacity = index % 5 === 0 ? 1 : (index % 2 === 0 ? 4 : 3);
    const roomBeds = Math.min(capacity, remaining);
    const occupied = partialRooms && index % 4 === 0 && roomBeds > 1 ? 1 : 0;
    const vacantBeds = Math.max(0, roomBeds - occupied);
    rooms.push({
      RoomID: `R-${prefix}-${index}`,
      HostelName: `EDC ${hostelType} Hostel`,
      HostelType: hostelType,
      Floor: `Floor ${Math.ceil(index / 20)}`,
      RoomNumber: `${prefix}-${String(index).padStart(3, '0')}`,
      Capacity: roomBeds,
      Occupied: occupied,
      VacantBeds: vacantBeds,
      Status: 'Active'
    });
    remaining -= roomBeds;
    index++;
  }
  return rooms;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function splitByGender(students, rooms) {
  return {
    boys: students.filter(sandbox.isBoyStudent),
    girls: students.filter(sandbox.isGirlStudent),
    boyRooms: rooms.filter(r => String(r.HostelType).toLowerCase().includes('boy')),
    girlRooms: rooms.filter(r => String(r.HostelType).toLowerCase().includes('girl'))
  };
}

function runPlan(students, rooms, method) {
  const groups = splitByGender(students, rooms);
  const boys = sandbox.buildAllocationPlan(groups.boys, groups.boyRooms, method);
  const girls = sandbox.buildAllocationPlan(groups.girls, groups.girlRooms, method);
  return {
    method,
    allocations: [...boys.allocations, ...girls.allocations],
    waitlist: [...boys.waitlist, ...girls.waitlist],
    roomsMap: new Map([...boys.roomsMap, ...girls.roomsMap])
  };
}

function allocationRankMap(students) {
  const boys = students.filter(sandbox.isBoyStudent).sort(sandbox.compareStudentsByAllocationRank);
  const girls = students.filter(sandbox.isGirlStudent).sort(sandbox.compareStudentsByAllocationRank);
  const ranks = new Map();
  boys.forEach((student, index) => ranks.set(student.EnrollmentNo, `B-${index}`));
  girls.forEach((student, index) => ranks.set(student.EnrollmentNo, `G-${index}`));
  return ranks;
}

function countPriorityViolations(students, plan) {
  const ranks = allocationRankMap(students);
  const allocated = new Set(plan.allocations.map(a => a.EnrollmentNo));
  const waitlisted = new Set(plan.waitlist.map(w => w.EnrollmentNo));
  let violations = 0;
  allocated.forEach(enroll => {
    const [genderKey, rankText] = ranks.get(enroll).split('-');
    const allocatedRank = Number(rankText);
    waitlisted.forEach(waitEnroll => {
      const [waitGenderKey, waitRankText] = ranks.get(waitEnroll).split('-');
      if (genderKey === waitGenderKey && Number(waitRankText) < allocatedRank) violations++;
    });
  });
  return violations;
}

function countCapacityViolations(originalRooms, plan) {
  let violations = 0;
  const originalById = new Map(originalRooms.map(room => [room.RoomID, room]));
  plan.roomsMap.forEach((room, roomId) => {
    const original = originalById.get(roomId);
    const originalVacancy = Number(original.VacantBeds) || 0;
    const used = originalVacancy - (Number(room.VacantBeds) || 0);
    if (used < 0 || used > originalVacancy) violations++;
  });
  return violations;
}

function countGenderViolations(plan) {
  return plan.allocations.filter(allocation => {
    const gender = String(allocation.Gender).toLowerCase();
    const hostelName = String(allocation.HostelName).toLowerCase();
    const isFemale = gender.includes('female') || gender.includes('girl') || gender === 'f';
    const isMale = (gender.includes('male') && !gender.includes('female')) || gender.includes('boy') || gender === 'm';
    return (isFemale && !hostelName.includes('girl')) || (isMale && !hostelName.includes('boy'));
  }).length;
}

function preferenceRate(plan) {
  const preferred = plan.allocations.filter(a => {
    const pref = String(a._student && a._student.HostelPref || '').trim().toLowerCase();
    if (!pref) return false;
    return String(a.HostelName).toLowerCase().includes(pref);
  });
  return plan.allocations.length ? Math.round((preferred.length / plan.allocations.length) * 10000) / 100 : 0;
}

function evaluateScenario(scenario, method) {
  const students = generateStudents(scenario.students, scenario.samePriority);
  const rooms = generateRooms(scenario.students, scenario.capacityRatio, scenario.partialRooms);
  const start = performance.now();
  const plan = runPlan(clone(students), clone(rooms), method);
  const runtimeMs = Math.round((performance.now() - start) * 100) / 100;
  return {
    scenario: scenario.name,
    method,
    runtimeMs,
    allocated: plan.allocations.length,
    waitlisted: plan.waitlist.length,
    priorityViolations: countPriorityViolations(students, plan),
    capacityViolations: countCapacityViolations(rooms, plan),
    genderViolations: countGenderViolations(plan),
    preferenceRate: preferenceRate(plan)
  };
}

function markdownTable(rows) {
  const headers = ['Scenario', 'Method', 'Runtime ms', 'Allocated', 'Waitlisted', 'Priority v.', 'Capacity v.', 'Gender v.', 'Pref %'];
  const body = rows.map(row => [
    row.scenario,
    row.method,
    row.runtimeMs,
    row.allocated,
    row.waitlisted,
    row.priorityViolations,
    row.capacityViolations,
    row.genderViolations,
    row.preferenceRate
  ]);
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...body.map(row => `| ${row.join(' | ')} |`)
  ].join('\n');
}

function consoleTable(rows) {
  const widths = [22, 10, 11, 10, 10, 11, 11, 9, 8];
  const headers = ['Scenario', 'Method', 'Runtime', 'Allocated', 'Waitlist', 'PriorityV', 'CapacityV', 'GenderV', 'Pref%'];
  console.log(headers.map((h, i) => pad(h, widths[i])).join(' '));
  console.log(widths.map(w => '-'.repeat(w)).join(' '));
  rows.forEach(row => {
    console.log([
      row.scenario,
      row.method,
      row.runtimeMs,
      row.allocated,
      row.waitlisted,
      row.priorityViolations,
      row.capacityViolations,
      row.genderViolations,
      row.preferenceRate
    ].map((value, i) => pad(value, widths[i])).join(' '));
  });
}

function main() {
  const rows = [];
  SCENARIOS.forEach(scenario => {
    METHODS.forEach(method => rows.push(evaluateScenario(scenario, method)));
  });

  consoleTable(rows);

  const report = [
    '# Allocation Load Test Results',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    markdownTable(rows),
    '',
    'Expected invariant columns are `0` for priority, capacity, and gender violations.',
    'Sorting is the baseline. Optimized is preferred only when its preference rate improves enough to justify runtime cost.'
  ].join('\n');
  fs.writeFileSync(path.join(repoRoot, 'allocation-load-test-results.md'), report);
}

main();
