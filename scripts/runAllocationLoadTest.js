const GAS_URL = process.env.GAS_URL || 'https://script.google.com/macros/s/AKfycbwwkz9T8iuNj35StYWCTZ59CtMtQ0RBvRugNoBkE7Czxkl45YpoUGOBkoEEW74ocATkiw/exec';
const ROUNDS = Number(process.argv[2] || 1);
const SHOULD_RESET = process.argv.indexOf('--no-reset') === -1;

async function post(action, data) {
  const startedAt = Date.now();
  const response = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action, data: data || {} })
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON from ${action}: ${text.slice(0, 300)}`);
  }
  if (!response.ok || json.error) {
    throw new Error(`${action} failed: ${JSON.stringify(json)}`);
  }
  return { json, wallMs: Date.now() - startedAt };
}

function printSummary(label, result) {
  const json = result.json;
  console.log(`${label}: wall=${result.wallMs}ms server=${json.durationMs || 'n/a'}ms`);
  console.log(JSON.stringify({
    success: json.success,
    allocated: json.allocated,
    waitlisted: json.waitlisted,
    processedBoys: json.processedBoys,
    processedGirls: json.processedGirls,
    remainingVerifiedBoys: json.remainingVerifiedBoys,
    remainingVerifiedGirls: json.remainingVerifiedGirls,
    studentsReset: json.studentsReset,
    matchedTestStudents: json.matchedTestStudents,
    allocationsRemoved: json.allocationsRemoved,
    waitlistRowsRemoved: json.waitlistRowsRemoved,
    roomsRecomputed: json.roomsRecomputed
  }, null, 2));
}

async function main() {
  if (SHOULD_RESET) {
    printSummary('resetVerifiedTestStudentsForReallocation', await post('resetVerifiedTestStudentsForReallocation'));
  }

  for (let round = 1; round <= ROUNDS; round++) {
    const result = await post('runAllocation');
    printSummary(`runAllocation round ${round}`, result);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
