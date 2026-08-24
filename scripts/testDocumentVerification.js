const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { detectMarksheetFileType, validateMarksheetBytes, sha256Hex, decideProvenanceVerification, resolveMarksheetScreeningAttempt } = require('../backend/DocumentVerificationService.js');

function bytes(value) { return Array.from(Buffer.from(value, 'binary')); }

const base = {
  verifierConfigured: true,
  checksumMatch: true,
  metadata: { summary: {}, editingSoftware: [], timestampContradiction: false, warnings: [] },
  c2pa: { status: 'Absent', issuer: '', trustedIssuer: false, aiGenerated: false },
  digitalSignature: { status: 'Absent', issuer: '', trustedIssuer: false },
  synthId: { status: 'Not Checked', provider: '', detectorVersion: '', officialDetector: false }
};

assert.equal(detectMarksheetFileType(bytes('%PDF-1.4\n%%EOF')), 'application/pdf');
assert.equal(detectMarksheetFileType([0xff, 0xd8, 0xff, 0xdb]), 'image/jpeg');
assert.equal(detectMarksheetFileType([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png');
assert.throws(() => validateMarksheetBytes([], 'application/pdf'), /empty/i);
assert.throws(() => validateMarksheetBytes(bytes('plain text'), 'application/pdf'), /valid PDF/i);
assert.throws(() => validateMarksheetBytes(bytes('%PDF-1.4\n%%EOF'), 'image/png'), /does not match/i);
assert.equal(validateMarksheetBytes(bytes('%PDF-1.4\n%%EOF'), 'application/pdf').mimeType, 'application/pdf');
assert.equal(sha256Hex(bytes('unchanged')), require('node:crypto').createHash('sha256').update('unchanged').digest('hex'));

assert.equal(decideProvenanceVerification(base).status, 'Provenance Check Passed — Original Required');
assert.equal(decideProvenanceVerification({ ...base, c2pa: { status: 'Valid', issuer: 'CBSE', trustedIssuer: true, aiGenerated: false } }).status, 'Verified');
assert.equal(decideProvenanceVerification({ ...base, digitalSignature: { status: 'Valid', issuer: 'DigiLocker', trustedIssuer: true } }).status, 'Verified');
[
  { ...base, checksumMatch: false },
  { ...base, verifierConfigured: false },
  { ...base, c2pa: { status: 'Invalid' } },
  { ...base, c2pa: { status: 'Untrusted' } },
  { ...base, c2pa: { status: 'Valid', trustedIssuer: true, aiGenerated: true } },
  { ...base, digitalSignature: { status: 'Invalid' } },
  { ...base, metadata: { timestampContradiction: true } },
  { ...base, synthId: { status: 'Detected', provider: 'Google SynthID', officialDetector: true } },
  { ...base, synthId: { status: 'Detected', provider: 'Unknown', officialDetector: false } }
].forEach(result => assert.equal(decideProvenanceVerification(result).status, 'Offline Verification Required'));

assert.ok(decideProvenanceVerification({ ...base, c2pa: { status: 'Valid', trustedIssuer: true, aiGenerated: true } }).reasonCodes.includes('AI_PROVENANCE_DETECTED'));
assert.equal(decideProvenanceVerification({ ...base, metadata: { editingSoftware: ['Adobe Photoshop'], warnings: ['EDITING_SOFTWARE_DETECTED'] } }).status, 'Provenance Check Passed — Original Required');
assert.deepEqual([1, 2, 3].map(attempt => resolveMarksheetScreeningAttempt(attempt, null, 'timeout').status), ['Screening Pending', 'Screening Pending', 'Offline Verification Required']);
assert.equal(resolveMarksheetScreeningAttempt(2, null, 'timeout').retry, true);
assert.equal(resolveMarksheetScreeningAttempt(3, null, 'malformed result').retry, false);

const root = path.join(__dirname, '..');
const registration = fs.readFileSync(path.join(root, 'register.html'), 'utf8');
assert.equal((registration.match(/type="file"/g) || []).length, 1);
assert.match(registration, /id="marksheet"[^>]*required/);
const allocation = fs.readFileSync(path.join(root, 'backend', 'AllocationEngine.js'), 'utf8');
assert.match(allocation, /documentStatus\)\.toLowerCase\(\) === 'verified'|documentStatus !== 'verified'/i);
const emailService = fs.readFileSync(path.join(root, 'backend', 'EmailService.js'), 'utf8');
assert.match(emailService, /OfflineVerificationEmailSentAt/);
assert.match(emailService, /email was already sent/i);
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
assert.match(admin, /marksheet-provenance-v1/);
assert.match(admin, /docEvidenceSource/);
assert.match(admin, /Google SynthID/);
assert.match(admin, /OpenAI Verify/);
const dataService = fs.readFileSync(path.join(root, 'backend', 'DataService.js'), 'utf8');
assert.match(dataService, /Verified status requires an approved evidence source/);
assert.match(dataService, /DocumentAuditLog/);
const verificationService = fs.readFileSync(path.join(root, 'backend', 'DocumentVerificationService.js'), 'utf8');
assert.doesNotMatch(verificationService, /Gemini|GEMINI/);
assert.match(verificationService, /FILE_CHANGED_DURING_TRANSFER/);
assert.match(verificationService, /AI_PROVENANCE_DETECTED/);

console.log('Document provenance verification tests passed.');
