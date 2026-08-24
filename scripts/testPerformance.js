const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key: index => Array.from(values.keys())[index] ?? null,
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(String(key), String(value)),
    removeItem: key => values.delete(String(key)),
    keys: () => Array.from(values.keys())
  };
}

async function testFrontendCache(root) {
  const sessionStorage = createStorage();
  const localStorage = createStorage();
  let fetchCount = 0;
  let failFetch = false;
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    URLSearchParams,
    AbortController,
    Date,
    Math,
    JSON,
    Promise,
    sessionStorage,
    localStorage,
    window: {
      location: { hostname: 'production.example' },
      AppLoading: { withTask: async (_label, promise) => await promise }
    },
    fetch: async () => {
      fetchCount += 1;
      await new Promise(resolve => setTimeout(resolve, 15));
      if (failFetch) throw new Error('network unavailable');
      return { ok: true, json: async () => ({ totalApplied: 505, generatedAt: new Date().toISOString() }) };
    }
  };
  sandbox.window.window = sandbox.window;
  sandbox.window.sessionStorage = sessionStorage;
  sandbox.window.localStorage = localStorage;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'api.js'), 'utf8'), sandbox);

  const [first, second] = await Promise.all([sandbox.window.HostelAPI.getDashboard(), sandbox.window.HostelAPI.getDashboard()]);
  assert.equal(first.totalApplied, 505);
  assert.equal(second.totalApplied, 505);
  assert.equal(fetchCount, 1, 'concurrent dashboard reads should be deduplicated');
  await sandbox.window.HostelAPI.getDashboard();
  assert.equal(fetchCount, 1, 'fresh dashboard reads should use cache');
  assert.ok(sessionStorage.keys().some(key => key.includes('getDashboard')));

  await sandbox.window.HostelAPI.getAdminStudentsPage({ page: 1, pageSize: 50 });
  assert.equal(sessionStorage.keys().some(key => key.includes('getAdminStudentsPage')), false, 'student data must not be persisted in session storage');

  failFetch = true;
  const stale = await sandbox.window.HostelAPI.getDashboard({ force: true, background: true });
  assert.equal(stale._stale, true, 'failed refresh should return stale dashboard data');
}

function testBackendPagination(root) {
  const cacheValues = new Map();
  const sandbox = {
    console,
    Date,
    Math,
    JSON,
    CacheService: { getScriptCache: () => ({
      get: key => cacheValues.get(key) || null,
      put: (key, value) => cacheValues.set(key, value)
    }) }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'backend', 'DataService.js'), 'utf8'), sandbox);

  const students = Array.from({ length: 125 }, (_, index) => ({
    ApplicationID: `APP-${index + 1}`,
    EnrollmentNo: String(10000000000 + index),
    Name: `Student ${index + 1}`,
    Gender: index % 2 ? 'Female' : 'Male',
    Programme: 'B.Tech',
    Branch: 'CSE',
    TwelfthMarks: 80,
    Category: 'Delhi',
    DistanceKm: 20,
    PWD: 'No',
    Status: 'Pending',
    Priority: 4,
    Timestamp: new Date().toISOString(),
    DocumentStatus: index % 3 ? 'Verified' : 'Screening Pending',
    DocumentPolicyVersion: 'google-openai-c2pa-auto-verify-v2',
    MarksheetMetadataSummary: 'x'.repeat(5000),
    DocumentAuditLog: 'x'.repeat(5000)
  }));
  let studentReads = 0;
  sandbox.getAllStudents = () => { studentReads += 1; return students; };
  sandbox.getAllAllocations = () => [];
  sandbox.getAllRooms = () => [];
  const studentHeaders = Object.keys(students[0]);
  const studentRows = [studentHeaders, ...students.map(student => studentHeaders.map(header => student[header] ?? ''))];
  sandbox.getSheet = () => ({
    getLastRow: () => studentRows.length,
    getLastColumn: () => studentHeaders.length,
    getRange: (row, column, rowCount, columnCount) => ({
      getValues: () => studentRows.slice(row - 1, row - 1 + rowCount).map(values => values.slice(column - 1, column - 1 + columnCount))
    })
  });

  const first = sandbox.getAdminStudentsPage({ page: 1, pageSize: 50 });
  assert.equal(first.items.length, 50);
  assert.equal(first.total, 125);
  assert.equal(first.totalPages, 3);
  assert.equal('MarksheetMetadataSummary' in first.items[0], false);
  assert.equal('DocumentAuditLog' in first.items[0], false);
  assert.ok(JSON.stringify(first).length < 100000, 'verification page response should stay below 100 KB');
  sandbox.getAdminStudentsPage({ page: 1, pageSize: 50 });
  assert.equal(studentReads, 1, 'warm backend page should use cache');
  sandbox.getAdminStudentsPage({ page: 1, pageSize: 50, force: true });
  assert.equal(studentReads, 2, 'forced refresh should bypass cache');
  const filtered = sandbox.getAdminStudentsPage({ page: 1, pageSize: 50, query: 'Student 12' });
  assert.ok(filtered.total >= 1);
  const boundary = sandbox.getAdminStudentsPage({ page: 99, pageSize: 50 });
  assert.equal(boundary.page, 3);
  const detail = sandbox.getAdminStudentDetail({ enrollmentNo: students[0].EnrollmentNo, force: true });
  assert.equal(detail.MarksheetMetadataSummary.length, 5000, 'technical data should remain available through detail lookup');

  sandbox.getSheetData = () => [{ Key: 'ADMIN_PASSWORD', Value: 12345678 }];
  assert.equal(sandbox.adminLogin({ password: '12345678' }).success, true, 'numeric Sheet passwords must match the form string');
  assert.equal(sandbox.adminLogin({ password: 'wrong' }).success, false, 'incorrect passwords must remain rejected');

  const start = performance.now();
  for (let index = 0; index < 100; index++) sandbox.getAdminStudentsPage({ page: 1, pageSize: 50 });
  assert.ok(performance.now() - start < 300, 'cached page reads should complete within 300 ms locally');
}

async function main() {
  const root = path.join(__dirname, '..');
  await testFrontendCache(root);
  testBackendPagination(root);
  const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
  assert.match(admin, /getAdminStudentsPage/);
  assert.match(admin, /getAdminStudentDetail/);
  assert.match(admin, /getAdminAllocationsPage/);
  assert.match(admin, /students\.slice\(0, 50\)\.map/);
  assert.match(admin, /requestIdleCallback/);
  assert.match(admin, /loadVerificationOperationsStatus/);
  assert.match(admin, /x: \{ stacked: true/);
  assert.match(admin, /y: \{ stacked: true/);
  assert.doesNotMatch(admin, /label: 'Capacity', data:/);
  assert.doesNotMatch(admin, /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js"><\/script>/);
  console.log('Whole-UI performance tests passed.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
