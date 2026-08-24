const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { MARKSHEET_POLICY_VERSION, detectMarksheetFileType, validateMarksheetBytes, sha256Hex, detectSupportedAiProviders, decideProvenanceVerification, resolveMarksheetScreeningAttempt } = require('../backend/DocumentVerificationService.js');

const bytes = value => Array.from(Buffer.from(value));
const base = {
  verifierConfigured: true,
  checksumMatch: true,
  metadata: { readable: true, summary: {}, aiGeneratorProviders: [], aiGeneratorMatches: [], c2paPresent: false, warnings: [] },
  c2pa: { status: 'Absent', provider: '', issuer: '', signer: '', claimGenerator: '', aiGenerated: false }
};

assert.equal(MARKSHEET_POLICY_VERSION, 'metadata-c2pa-google-openai-v1');
assert.equal(detectMarksheetFileType(bytes('%PDF-1.4')), 'application/pdf');
assert.equal(detectMarksheetFileType([0xff, 0xd8, 0xff, 0xdb]), 'image/jpeg');
assert.equal(detectMarksheetFileType([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png');
assert.throws(() => validateMarksheetBytes([], 'application/pdf'), /empty/i);
assert.throws(() => validateMarksheetBytes(bytes('plain text'), 'application/pdf'), /valid PDF/i);
assert.throws(() => validateMarksheetBytes(bytes('%PDF-1.4\n%%EOF'), 'image/png'), /does not match/i);
assert.equal(validateMarksheetBytes(bytes('%PDF-1.4\n%%EOF'), 'application/pdf').mimeType, 'application/pdf');
assert.equal(sha256Hex(bytes('unchanged')), require('node:crypto').createHash('sha256').update('unchanged').digest('hex'));

assert.deepEqual(detectSupportedAiProviders('Gemini and DALL-E'), ['Google', 'OpenAI']);
assert.deepEqual(detectSupportedAiProviders('Adobe Photoshop'), []);

const passed = decideProvenanceVerification(base);
assert.equal(passed.status, 'AI Check Passed — Manual Approval Required');
assert.equal(passed.aiProvenanceStatus, 'Passed');
assert.ok(passed.explanationCodes.includes('NO_SUPPORTED_GENERATOR_METADATA'));
assert.notEqual(passed.status, 'Verified');

for (const provider of ['Google', 'OpenAI']) {
  const metadataDetected = decideProvenanceVerification({ ...base, metadata: { ...base.metadata, aiGeneratorProviders: [provider], summary: { Software: provider } } });
  assert.equal(metadataDetected.status, 'Offline Verification Required');
  assert.equal(metadataDetected.provider, provider);
  assert.ok(metadataDetected.reasonCodes.includes('GOOGLE_OPENAI_METADATA_DETECTED'));

  const c2paDetected = decideProvenanceVerification({ ...base, c2pa: { status: 'Valid', provider, issuer: provider, aiGenerated: true } });
  assert.equal(c2paDetected.status, 'Offline Verification Required');
  assert.ok(c2paDetected.reasonCodes.includes('GOOGLE_OPENAI_C2PA_AI_DETECTED'));

  const invalidC2pa = decideProvenanceVerification({ ...base, c2pa: { status: 'Invalid', provider, issuer: provider, aiGenerated: false } });
  assert.equal(invalidC2pa.status, 'Offline Verification Required');
  assert.ok(invalidC2pa.reasonCodes.includes('GOOGLE_OPENAI_C2PA_INVALID'));
}

assert.equal(decideProvenanceVerification({ ...base, verifierConfigured: false, c2pa: { status: 'Unsupported' } }).status, 'AI Check Inconclusive — Manual Approval Required');
assert.equal(decideProvenanceVerification({ ...base, metadata: { ...base.metadata, readable: false } }).status, 'AI Check Inconclusive — Manual Approval Required');
assert.equal(decideProvenanceVerification({ ...base, c2pa: { status: 'Valid', provider: '', issuer: 'Other Vendor', aiGenerated: true } }).status, 'AI Check Inconclusive — Manual Approval Required');
assert.equal(decideProvenanceVerification({ ...base, checksumMatch: false }).status, 'Offline Verification Required');
const rawC2paText = decideProvenanceVerification({ ...base, verifierConfigured: false, metadata: { ...base.metadata, c2paPresent: true }, c2pa: { status: 'Unsupported', issuer: 'OpenAI text only', aiGenerated: true } });
assert.ok(!rawC2paText.reasonCodes.includes('GOOGLE_OPENAI_C2PA_AI_DETECTED'));
assert.equal(rawC2paText.status, 'AI Check Inconclusive — Manual Approval Required');

assert.deepEqual([1, 2, 3].map(attempt => resolveMarksheetScreeningAttempt(attempt, null, 'timeout').status), ['Screening Pending', 'Screening Pending', 'AI Check Inconclusive — Manual Approval Required']);
assert.equal(resolveMarksheetScreeningAttempt(2, null, 'timeout').retry, true);
assert.equal(resolveMarksheetScreeningAttempt(3, null, 'malformed result').retry, false);

const root = path.join(__dirname, '..');
const registration = fs.readFileSync(path.join(root, 'register.html'), 'utf8');
assert.equal((registration.match(/type="file"/g) || []).length, 1);
assert.match(registration, /id="marksheet"[^>]*required/);
const allocation = fs.readFileSync(path.join(root, 'backend', 'AllocationEngine.js'), 'utf8');
assert.match(allocation, /documentStatus\)\.toLowerCase\(\) === 'verified'|documentStatus !== 'verified'/i);
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
assert.match(admin, /Google\/OpenAI AI Provenance Check/);
assert.match(admin, /Approve after document review/);
assert.match(admin, /Technical details/);
assert.doesNotMatch(admin, /Official watermark check/);
const student = fs.readFileSync(path.join(root, 'student.html'), 'utf8');
assert.match(student, /does not confirm that an academic board issued/i);
const dataService = fs.readFileSync(path.join(root, 'backend', 'DataService.js'), 'utf8');
assert.match(dataService, /Administrator Document Review/);
assert.match(dataService, /DocumentAuditLog/);
const verificationService = fs.readFileSync(path.join(root, 'backend', 'DocumentVerificationService.js'), 'utf8');
assert.doesNotMatch(verificationService, /Gemini|GEMINI|synthId|digitalSignature/);
assert.match(verificationService, /GOOGLE_OPENAI_C2PA_AI_DETECTED/);

console.log('Google/OpenAI metadata and C2PA verification tests passed.');
