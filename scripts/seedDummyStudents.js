const GAS_URL = 'https://script.google.com/macros/s/AKfycbwwkz9T8iuNj35StYWCTZ59CtMtQ0RBvRugNoBkE7Czxkl45YpoUGOBkoEEW74ocATkiw/exec';
const COUNT = Number(process.argv[2] || 500);
const CONCURRENCY = Number(process.argv[3] || 8);
const RUN_ID = process.argv[4] || new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 12);

function prioritySeed(index) {
  if (index % 25 === 0) return { pwd: 'Yes', category: 'Delhi', parentsTransferred: 'No' };
  if (index % 3 === 0) return { pwd: 'No', category: 'Outside Delhi', parentsTransferred: 'No' };
  if (index % 5 === 0) return { pwd: 'No', category: 'Delhi', parentsTransferred: 'Yes' };
  return { pwd: 'No', category: 'Delhi', parentsTransferred: 'No' };
}

function makeStudent(index) {
  const gender = index % 2 === 0 ? 'Male' : 'Female';
  const priority = prioritySeed(index);
  const suffix = String(index).padStart(4, '0');
  return {
    EnrollmentNo: `LOAD-${RUN_ID}-${suffix}`,
    Name: `Load Test Student ${suffix}`,
    Gender: gender,
    DOB: `2005-${String((index % 12) + 1).padStart(2, '0')}-${String((index % 27) + 1).padStart(2, '0')}`,
    Email: '',
    Phone: `9998${String(index).padStart(6, '0')}`,
    Aadhaar: `0000${String(index).padStart(8, '0')}`,
    Programme: index % 4 === 0 ? 'M.Tech' : 'B.Tech',
    Branch: ['CSE', 'AIML', 'ECE', 'IT'][index % 4],
    Year: String((index % 4) + 1),
    TwelfthMarks: 60 + (index % 41),
    Category: priority.category,
    State: priority.category === 'Outside Delhi' ? ['Uttar Pradesh', 'Haryana', 'Rajasthan', 'Bihar'][index % 4] : 'Delhi',
    ParentsTransferred: priority.parentsTransferred,
    DistanceKm: 5 + ((index * 13) % 350),
    PWD: priority.pwd,
    HostelPref: gender === 'Male' ? 'EDC Boys Hostel' : 'EDC Girls Hostel',
    RoommatePreference: ''
  };
}

async function post(action, data) {
  const response = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action, data })
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function seedOne(index) {
  const student = makeStudent(index);
  const submit = await post('submitApplication', student);
  if (!submit || submit.success !== true) {
    throw new Error(`submit failed for ${student.EnrollmentNo}: ${JSON.stringify(submit)}`);
  }
  const verify = await post('updateDocumentVerification', {
    EnrollmentNo: student.EnrollmentNo,
    DocumentStatus: 'Verified',
    AadhaarStatus: 'Verified',
    PhotoStatus: 'Verified',
    MarksheetStatus: 'Verified',
    PwdCertificateStatus: student.PWD === 'Yes' ? 'Verified' : 'Not Applicable',
    DocumentRemarks: `Load test seed ${RUN_ID}`
  });
  if (!verify || verify.success !== true) {
    throw new Error(`verify failed for ${student.EnrollmentNo}: ${JSON.stringify(verify)}`);
  }
  return student.EnrollmentNo;
}

async function main() {
  let next = 1;
  let completed = 0;
  let failed = 0;
  const failures = [];
  const startedAt = Date.now();

  async function worker() {
    while (next <= COUNT) {
      const index = next++;
      try {
        await seedOne(index);
        completed++;
      } catch (error) {
        failed++;
        failures.push({ index, error: error.message });
      }
      if ((completed + failed) % 25 === 0 || completed + failed === COUNT) {
        const elapsed = Math.round((Date.now() - startedAt) / 1000);
        console.log(`Seeded ${completed}/${COUNT}, failed ${failed}, elapsed ${elapsed}s`);
      }
    }
  }

  console.log(`Seeding ${COUNT} verified dummy students with run id ${RUN_ID}...`);
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(JSON.stringify({ runId: RUN_ID, completed, failed, failures: failures.slice(0, 10) }, null, 2));
  if (failed > 0) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
