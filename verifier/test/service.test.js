import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { computeRequestSignature, decodeDocument, screenDocument, verifyRequestSignature } from '../src/provenance.js';
import { createVerifierServer } from '../src/server.js';

const secret = 'test-secret-with-enough-entropy';
const cleanPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const payload = buffer => ({ document: { name: 'marksheet.png', type: 'image/png', data: buffer.toString('base64') }, expectedChecksum: crypto.createHash('sha256').update(buffer).digest('hex') });

test('HMAC accepts fresh requests and rejects replayed timestamps', () => {
  const rawBody = JSON.stringify(payload(cleanPng));
  const timestamp = String(Date.now());
  const nonce = 'nonce-1';
  const signature = computeRequestSignature(secret, timestamp, nonce, rawBody);
  const replayCache = new Map();
  assert.equal(verifyRequestSignature({ secret, timestamp, nonce, signature, rawBody, replayCache }).valid, true);
  assert.equal(verifyRequestSignature({ secret, timestamp, nonce, signature, rawBody, replayCache }).error, 'Replayed request.');
  assert.equal(verifyRequestSignature({ secret, timestamp: '1', nonce: 'nonce-2', signature, rawBody }).valid, false);
  assert.equal(verifyRequestSignature({ secret, timestamp, nonce: 'nonce-3', signature: '00'.repeat(32), rawBody }).valid, false);
});

test('clean C2PA absence returns a verified screening input', async () => {
  const screening = await screenDocument(payload(cleanPng), { readerFactory: async () => ({ json: () => ({ manifests: {} }), getActive: () => null }) });
  assert.equal(screening.checksumMatch, true);
  assert.equal(screening.c2pa.status, 'Absent');
  assert.equal(screening.verifierConfigured, true);
});

test('Google AI provenance is normalized without returning a full manifest', async () => {
  const active = { claim_generator: 'Google Imagen', assertions: [{ digitalSourceType: 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia' }], signature_info: { issuer: 'Google AI' } };
  const screening = await screenDocument(payload(cleanPng), { readerFactory: async () => ({ json: () => ({ active_manifest: 'x', manifests: { x: active } }), getActive: () => active }) });
  assert.equal(screening.c2pa.status, 'Valid');
  assert.equal(screening.c2pa.provider, 'Google');
  assert.equal(screening.c2pa.aiGenerated, true);
  assert.equal('manifest' in screening.c2pa, false);
});

test('10 MB document remains accepted', () => {
  const document = decodeDocument(payload(Buffer.alloc(10 * 1024 * 1024, 7)));
  assert.equal(document.buffer.length, 10 * 1024 * 1024);
});

test('HTTP verifier requires a valid signature', async t => {
  const server = createVerifierServer({ secret, skipDependencyCheck: true, readerFactory: async () => ({ json: () => ({}), getActive: () => null }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/v1/verify`;
  const rawBody = JSON.stringify(payload(cleanPng));
  const denied = await fetch(url, { method: 'POST', body: rawBody });
  assert.equal(denied.status, 401);
  const timestamp = String(Date.now());
  const nonce = 'http-nonce';
  const accepted = await fetch(url, { method: 'POST', headers: { 'x-verifier-timestamp': timestamp, 'x-verifier-nonce': nonce, 'x-verifier-signature': computeRequestSignature(secret, timestamp, nonce, rawBody) }, body: rawBody });
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).screening.c2pa.status, 'Absent');

  const largeRawBody = JSON.stringify(payload(Buffer.alloc(10 * 1024 * 1024, 9)));
  const largeTimestamp = String(Date.now());
  const largeNonce = 'http-10mb-nonce';
  const largeResponse = await fetch(url, { method: 'POST', headers: { 'x-verifier-timestamp': largeTimestamp, 'x-verifier-nonce': largeNonce, 'x-verifier-signature': computeRequestSignature(secret, largeTimestamp, largeNonce, largeRawBody) }, body: largeRawBody });
  assert.equal(largeResponse.status, 200, 'the complete 10 MB upload must fit through the verifier HTTP endpoint');
});
