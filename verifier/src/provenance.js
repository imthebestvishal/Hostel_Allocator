import crypto from 'node:crypto';

export const VERIFIER_VERSION = 'ggsipu-c2pa-vercel-v1';
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

const SUPPORTED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const AI_SOURCE_PATTERN = /trainedAlgorithmicMedia|generative[-_ ]?ai|ai[_ -]?generated|digitalSourceType[^\n]{0,160}algorithm/i;
const ABSENT_MANIFEST_PATTERN = /no (?:c2pa |jumbf )?(?:claim|manifest)|manifest[^\n]{0,80}not found|no jumbf data/i;

function safeJson(value) {
  if (value == null) return {};
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch (_) { return {}; }
  }
  return typeof value === 'object' ? value : {};
}

function serialize(value) {
  try { return JSON.stringify(value || {}); } catch (_) { return ''; }
}

export function detectProvider(value) {
  const text = typeof value === 'string' ? value : serialize(value);
  if (/\b(?:google[\s_-]*ai|gemini|imagen|synthid)\b/i.test(text)) return 'Google';
  if (/\b(?:openai|chatgpt|dall[\s.·_-]*e)\b/i.test(text)) return 'OpenAI';
  return '';
}

export function computeRequestSignature(secret, timestamp, nonce, rawBody) {
  const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${nonce}.${bodyHash}`).digest('hex');
}

export function verifyRequestSignature({ secret, timestamp, nonce, signature, rawBody, now = Date.now(), replayCache }) {
  if (!secret || !timestamp || !nonce || !signature) return { valid: false, error: 'Missing request authentication.' };
  const numericTimestamp = Number(timestamp);
  if (!Number.isFinite(numericTimestamp) || Math.abs(now - numericTimestamp) > MAX_CLOCK_SKEW_MS) return { valid: false, error: 'Expired request timestamp.' };
  const expected = computeRequestSignature(secret, String(timestamp), String(nonce), rawBody);
  const suppliedBuffer = Buffer.from(String(signature), 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) return { valid: false, error: 'Invalid request signature.' };
  if (replayCache) {
    for (const [key, seenAt] of replayCache) if (now - seenAt > MAX_CLOCK_SKEW_MS) replayCache.delete(key);
    if (replayCache.has(String(nonce))) return { valid: false, error: 'Replayed request.' };
    replayCache.set(String(nonce), now);
  }
  return { valid: true };
}

export function decodeDocument(input) {
  const document = input && input.document;
  if (!document || typeof document !== 'object') throw new Error('Document payload is required.');
  const mimeType = String(document.type || document.mimeType || '').toLowerCase().split(';')[0].trim();
  if (!SUPPORTED_MIME_TYPES.has(mimeType)) throw new Error('Only PDF, JPEG, and PNG documents are supported.');
  const encoded = String(document.data || '').trim();
  if (!encoded) throw new Error('Document data is required.');
  const buffer = Buffer.from(encoded, 'base64');
  if (!buffer.length) throw new Error('Document data is empty.');
  if (buffer.length > MAX_DOCUMENT_BYTES) throw new Error('Document exceeds the 10 MB limit.');
  return {
    buffer,
    mimeType,
    name: String(document.name || 'marksheet').replace(/[\r\n]/g, '').slice(0, 255),
    expectedChecksum: String(input.expectedChecksum || '').trim().toLowerCase()
  };
}

function collectValidationIssues(store, manifest) {
  const entries = [];
  const add = value => {
    if (Array.isArray(value)) value.forEach(add);
    else if (value) entries.push(typeof value === 'string' ? value : String(value.code || value.status || value.explanation || serialize(value)));
  };
  add(store.validation_status || store.validationStatus);
  add(manifest && (manifest.validation_status || manifest.validationStatus));
  return Array.from(new Set(entries.filter(Boolean))).slice(0, 20);
}

function normalizeManifestResult(store, activeManifest) {
  const activeLabel = String(store.active_manifest || store.activeManifest || '');
  const manifestKeys = store.manifests && typeof store.manifests === 'object' ? Object.keys(store.manifests) : [];
  const manifest = (store.manifests && activeLabel ? store.manifests[activeLabel] : null) || (manifestKeys.length === 1 ? store.manifests[manifestKeys[0]] : null) || activeManifest;
  if (!manifest) return { status: 'Absent', provider: '', issuer: '', signer: '', claimGenerator: '', signingTime: '', verifierVersion: VERIFIER_VERSION, aiGenerated: false, validationErrors: [] };
  const validationErrors = collectValidationIssues(store, manifest);
  const validationText = validationErrors.join(' ');
  const untrusted = /untrusted|unknown certificate|signingCredential[^\n]{0,80}(?:unknown|not trusted)/i.test(validationText);
  const invalid = /invalid|mismatch|malformed|failure|error|expired|revoked/i.test(validationText);
  const signature = manifest.signature_info || manifest.signatureInfo || {};
  const claimGenerator = String(manifest.claim_generator || manifest.claimGenerator || manifest.claim_generator_info?.[0]?.name || '');
  const issuer = String(signature.issuer || signature.cert_serial_number || manifest.issuer || '');
  const serialized = serialize(manifest);
  const aiSourceMatch = serialized.match(/https?:\\?\/\\?\/cv\.iptc\.org\\?\/newscodes\\?\/digitalsourcetype\\?\/[A-Za-z]+|trainedAlgorithmicMedia|generative[-_ ]?ai|ai[_ -]?generated/i);
  return {
    status: invalid ? 'Invalid' : untrusted ? 'Untrusted' : 'Valid',
    provider: detectProvider(`${issuer} ${claimGenerator}`),
    issuer,
    signer: issuer,
    claimGenerator,
    signingTime: String(signature.time || signature.signing_time || ''),
    verifierVersion: VERIFIER_VERSION,
    aiGenerated: AI_SOURCE_PATTERN.test(serialized),
    aiSourceType: aiSourceMatch ? String(aiSourceMatch[0]).replace(/\\/g, '') : '',
    validationErrors
  };
}

async function defaultReaderFactory(asset) {
  const { Reader } = await import('@contentauth/c2pa-node');
  return Reader.fromAsset(asset, {
    verify: {
      verify_after_reading: true,
      verify_trust: true,
      verify_timestamp_trust: true,
      remote_manifest_fetch: false
    }
  });
}

export async function inspectC2pa(document, readerFactory = defaultReaderFactory) {
  try {
    const reader = await readerFactory({ buffer: document.buffer, mimeType: document.mimeType });
    const store = safeJson(reader && typeof reader.json === 'function' ? reader.json() : {});
    const activeManifest = reader && typeof reader.getActive === 'function' ? reader.getActive() : null;
    return normalizeManifestResult(store, activeManifest);
  } catch (error) {
    const message = String(error && error.message || error);
    if (ABSENT_MANIFEST_PATTERN.test(message)) return normalizeManifestResult({}, null);
    return {
      status: 'Unsupported', provider: '', issuer: '', signer: '', claimGenerator: '', signingTime: '',
      verifierVersion: VERIFIER_VERSION, aiGenerated: false, validationErrors: [message.slice(0, 300)]
    };
  }
}

export async function screenDocument(input, options = {}) {
  const document = decodeDocument(input);
  const retrievedChecksum = crypto.createHash('sha256').update(document.buffer).digest('hex');
  const c2pa = await inspectC2pa(document, options.readerFactory);
  return {
    verifierConfigured: true,
    verifierVersion: VERIFIER_VERSION,
    retrievedChecksum,
    checksumMatch: !document.expectedChecksum || document.expectedChecksum === retrievedChecksum,
    metadata: { readable: true, summary: {}, aiGeneratorProviders: [], aiGeneratorMatches: [], c2paPresent: c2pa.status !== 'Absent' },
    c2pa,
    warnings: c2pa.status === 'Unsupported' ? ['C2PA_VERIFICATION_UNSUPPORTED'] : []
  };
}
