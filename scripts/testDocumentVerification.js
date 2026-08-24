const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { MARKSHEET_POLICY_VERSION, detectMarksheetFileType, validateMarksheetBytes, sha256Hex, detectSupportedAiProviders, decideProvenanceVerification, resolveMarksheetScreeningAttempt, processPendingMarksheetScreenings } = require('../backend/DocumentVerificationService.js');

const bytes = value => Array.from(Buffer.from(value));
const base = {
  verifierConfigured: true,
  checksumMatch: true,
  metadata: { readable: true, summary: {}, aiGeneratorProviders: [], aiGeneratorMatches: [], c2paPresent: false, warnings: [] },
  c2pa: { status: 'Absent', provider: '', issuer: '', signer: '', claimGenerator: '', aiGenerated: false }
};

assert.equal(MARKSHEET_POLICY_VERSION, 'google-openai-c2pa-auto-verify-v2');
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
assert.equal(passed.status, 'Verified');
assert.equal(passed.aiProvenanceStatus, 'Passed');
assert.equal(passed.approvalSource, 'Automated C2PA absence check');
assert.ok(passed.explanationCodes.includes('NO_SUPPORTED_GENERATOR_METADATA'));
assert.ok(passed.explanationCodes.includes('C2PA_VERIFICATION_COMPLETED'));
assert.ok(passed.explanationCodes.includes('NO_GOOGLE_OPENAI_C2PA_FOUND'));

for (const provider of ['Google', 'OpenAI']) {
  const metadataDetected = decideProvenanceVerification({ ...base, metadata: { ...base.metadata, aiGeneratorProviders: [provider], summary: { Software: provider } } });
  assert.equal(metadataDetected.status, 'Verified');
  assert.equal(metadataDetected.provider, provider);
  assert.equal(metadataDetected.reasonCodes.includes('GOOGLE_OPENAI_METADATA_DETECTED'), false);
  assert.ok(metadataDetected.explanationCodes.includes('GOOGLE_OPENAI_METADATA_DETECTED'));

  const c2paDetected = decideProvenanceVerification({ ...base, c2pa: { status: 'Valid', provider, issuer: provider, aiGenerated: true } });
  assert.equal(c2paDetected.status, 'Offline Verification Required');
  assert.ok(c2paDetected.reasonCodes.includes('GOOGLE_OPENAI_C2PA_AI_DETECTED'));

  const invalidC2pa = decideProvenanceVerification({ ...base, c2pa: { status: 'Invalid', provider, issuer: provider, aiGenerated: false } });
  assert.equal(invalidC2pa.status, 'Offline Verification Required');
  assert.ok(invalidC2pa.reasonCodes.includes('GOOGLE_OPENAI_C2PA_INVALID'));
}

for (const identity of ['Google AI', 'Gemini', 'Imagen', 'OpenAI', 'ChatGPT', 'DALL-E']) {
  const attributedC2pa = decideProvenanceVerification({ ...base, c2pa: { status: 'Valid', provider: '', issuer: identity, claimGenerator: identity, aiGenerated: false } });
  assert.equal(attributedC2pa.status, 'Offline Verification Required', `${identity} C2PA should require offline verification`);
}

assert.equal(decideProvenanceVerification({ ...base, verifierConfigured: false, c2pa: { status: 'Unsupported' } }).status, 'AI Check Inconclusive — Manual Approval Required');
assert.equal(decideProvenanceVerification({ ...base, metadata: { ...base.metadata, readable: false } }).status, 'Verified');
assert.equal(decideProvenanceVerification({ ...base, c2pa: { status: 'Valid', provider: '', issuer: 'Other Vendor', aiGenerated: true } }).status, 'Verified');
assert.equal(decideProvenanceVerification({ ...base, c2pa: { status: 'Invalid', provider: '', issuer: 'Other Vendor', aiGenerated: true } }).status, 'AI Check Inconclusive — Manual Approval Required');
assert.equal(decideProvenanceVerification({ ...base, checksumMatch: false }).status, 'Offline Verification Required');
const rawC2paText = decideProvenanceVerification({ ...base, verifierConfigured: false, metadata: { ...base.metadata, c2paPresent: true }, c2pa: { status: 'Unsupported', issuer: 'OpenAI text only', aiGenerated: true } });
assert.ok(!rawC2paText.reasonCodes.includes('GOOGLE_OPENAI_C2PA_AI_DETECTED'));
assert.equal(rawC2paText.status, 'AI Check Inconclusive — Manual Approval Required');

assert.deepEqual([1, 2, 3].map(attempt => resolveMarksheetScreeningAttempt(attempt, null, 'timeout').status), ['Screening Pending', 'Screening Pending', 'AI Check Inconclusive — Manual Approval Required']);
assert.equal(resolveMarksheetScreeningAttempt(2, null, 'timeout').retry, true);
assert.equal(resolveMarksheetScreeningAttempt(3, null, 'malformed result').retry, false);

const workerBytes = bytes('preserved marksheet bytes');
const workerChecksum = sha256Hex(workerBytes);
const workerHeaders = ['ApplicationID', 'EnrollmentNo', 'DocumentStatus', 'DocumentAuditLog', 'MarksheetFileId', 'MarksheetChecksum', 'MarksheetScreeningAttempts', 'MarksheetStatus', 'MarksheetRemarks', 'DocumentRemarks', 'MarksheetVerificationCheckedAt', 'MarksheetVerificationProvider', 'MarksheetVerificationModel', 'MarksheetVerificationReasons', 'MarksheetVerificationExplanationCodes', 'MarksheetVerificationSummary', 'MarksheetAiProvenanceStatus', 'MarksheetAiProvider', 'MarksheetRetrievedChecksum', 'MarksheetMetadataSummary', 'MarksheetMetadataFindings', 'MarksheetC2paStatus', 'MarksheetC2paIssuer', 'MarksheetC2paSigner', 'MarksheetC2paSigningTime', 'MarksheetC2paVerifierVersion', 'MarksheetApprovalSource', 'MarksheetVerificationLastError'];
const workerRows = [workerHeaders, workerHeaders.map(header => ({ ApplicationID: 'APP-1', EnrollmentNo: '1', DocumentStatus: 'Screening Pending', DocumentAuditLog: '[]', MarksheetFileId: 'file-1', MarksheetChecksum: workerChecksum, MarksheetScreeningAttempts: 0 }[header] ?? ''))];
const workerSheet = {
  getLastColumn: () => workerHeaders.length,
  getRange: (row, column) => ({
    getDisplayValues: () => row === 1 ? [workerHeaders] : [[workerRows[row - 1][column - 1]]],
    setValue: value => { workerRows[row - 1][column - 1] = value; }
  }),
  getDataRange: () => ({ getValues: () => workerRows })
};
let offlineNotifications = 0;
const workerResult = processPendingMarksheetScreenings({
  sheet: workerSheet,
  lock: { tryLock: () => true, releaseLock: () => {} },
  getBlob: () => ({ getBytes: () => workerBytes }),
  provenance: () => ({ ...base, c2pa: { ...base.c2pa, verifierVersion: 'test-verifier-1' } }),
  notifyOffline: () => { offlineNotifications += 1; }
});
const workerRecord = Object.fromEntries(workerHeaders.map((header, index) => [header, workerRows[1][index]]));
assert.equal(workerResult.processed, 1);
assert.equal(workerRecord.DocumentStatus, 'Verified');
assert.equal(workerRecord.MarksheetApprovalSource, 'Automated C2PA absence check');
assert.equal(workerRecord.MarksheetC2paVerifierVersion, 'test-verifier-1');
assert.equal(JSON.parse(workerRecord.DocumentAuditLog).at(-1).evidenceSource, 'Automated C2PA absence check');
assert.equal(offlineNotifications, 0);
assert.equal(processPendingMarksheetScreenings({ sheet: workerSheet, lock: { tryLock: () => true, releaseLock: () => {} } }).processed, 0);

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
assert.match(admin, /Historical result — AI provenance not checked/);
assert.doesNotMatch(admin, /currentDocumentStatus === 'Offline Verification Required' \? 'Detected'/);
assert.doesNotMatch(admin, /Official watermark check/);
const student = fs.readFileSync(path.join(root, 'student.html'), 'utf8');
assert.match(student, /does not confirm that an academic board issued/i);
const dataService = fs.readFileSync(path.join(root, 'backend', 'DataService.js'), 'utf8');
assert.match(dataService, /Administrator Document Review/);
assert.match(dataService, /MarksheetApprovalSource/);
assert.match(dataService, /DocumentAuditLog/);
const verificationService = fs.readFileSync(path.join(root, 'backend', 'DocumentVerificationService.js'), 'utf8');
assert.doesNotMatch(verificationService, /GEMINI_API_KEY|invokeGemini|synthId\s*:|digitalSignature\s*:/);
assert.match(verificationService, /GOOGLE_OPENAI_C2PA_AI_DETECTED/);

console.log('Google/OpenAI C2PA automatic approval tests passed.');
