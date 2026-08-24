const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const handler = require('../api/c2pa-verify.js');

const { authenticateRequest, callbackSignature, requestSignature, validateAppsScriptUrl } = handler._test;
const secret = 'test-secret-with-enough-entropy';
const body = JSON.stringify({ documentSource: { url: 'https://script.google.com/macros/s/deployment-id/exec', fileId: 'file-1' }, expectedChecksum: 'a'.repeat(64), applicationId: 'APP-1' });
const timestamp = String(Date.now());
const nonce = crypto.randomUUID();
const signature = requestSignature(secret, timestamp, nonce, body);
const req = { headers: { 'x-verifier-timestamp': timestamp, 'x-verifier-nonce': nonce, 'x-verifier-signature': signature } };

assert.equal(authenticateRequest(req, secret, body), '');
assert.equal(authenticateRequest(req, secret, body), 'Replayed request.');
assert.match(authenticateRequest({ headers: {} }, secret, body), /Missing/);
assert.equal(validateAppsScriptUrl('https://script.google.com/macros/s/deployment-id/exec'), 'https://script.google.com/macros/s/deployment-id/exec');
assert.throws(() => validateAppsScriptUrl('https://example.com/private-file'), /Apps Script/);

const callback = { timestamp, nonce, fileId: 'file-1', expectedChecksum: 'a'.repeat(64), applicationId: 'APP-1' };
const expected = crypto.createHmac('sha256', secret).update(JSON.stringify([callback.timestamp, callback.nonce, callback.fileId, callback.expectedChecksum, callback.applicationId])).digest('hex');
assert.equal(callbackSignature(secret, callback), expected);

console.log('Vercel signed-reference C2PA transport tests passed.');
