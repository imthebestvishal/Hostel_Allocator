const crypto = require('node:crypto');

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_SOURCE_RESPONSE_BYTES = 14 * 1024 * 1024 + 64 * 1024;
const replayCache = new Map();

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(payload));
}

function hmacHex(secret, value) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function timingSafeHexEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'hex');
  const b = Buffer.from(String(right || ''), 'hex');
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requestSignature(secret, timestamp, nonce, rawBody) {
  const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
  return hmacHex(secret, `${timestamp}.${nonce}.${bodyHash}`);
}

function authenticateRequest(req, secret, rawBody) {
  const timestamp = String(req.headers['x-verifier-timestamp'] || '');
  const nonce = String(req.headers['x-verifier-nonce'] || '');
  const supplied = String(req.headers['x-verifier-signature'] || '');
  const now = Date.now();
  if (!timestamp || !nonce || !supplied) return 'Missing request authentication.';
  if (!Number.isFinite(Number(timestamp)) || Math.abs(now - Number(timestamp)) > MAX_CLOCK_SKEW_MS) return 'Expired request timestamp.';
  if (!timingSafeHexEqual(supplied, requestSignature(secret, timestamp, nonce, rawBody))) return 'Invalid request signature.';
  for (const [key, seenAt] of replayCache) if (now - seenAt > MAX_CLOCK_SKEW_MS) replayCache.delete(key);
  if (replayCache.has(nonce)) return 'Replayed request.';
  replayCache.set(nonce, now);
  return '';
}

function validateAppsScriptUrl(value) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'https:' || url.hostname !== 'script.google.com' || !/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname)) {
    throw new Error('The document source must be an Apps Script deployment URL.');
  }
  return url.toString();
}

function callbackSignature(secret, data) {
  return hmacHex(secret, JSON.stringify([
    String(data.timestamp || ''),
    String(data.nonce || ''),
    String(data.fileId || ''),
    String(data.expectedChecksum || ''),
    String(data.applicationId || '')
  ]));
}

async function retrieveOriginalDocument(source, expectedChecksum, applicationId, secret) {
  const url = validateAppsScriptUrl(source.url);
  const data = {
    timestamp: String(Date.now()),
    nonce: crypto.randomUUID(),
    fileId: String(source.fileId || ''),
    expectedChecksum: String(expectedChecksum || '').toLowerCase(),
    applicationId: String(applicationId || '')
  };
  data.signature = callbackSignature(secret, data);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'downloadMarksheetForVerifier', data }),
    redirect: 'follow',
    signal: AbortSignal.timeout(45000)
  });
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_SOURCE_RESPONSE_BYTES) throw new Error('Document source response is too large.');
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_SOURCE_RESPONSE_BYTES) throw new Error('Document source response is too large.');
  let parsed;
  try { parsed = JSON.parse(text); } catch (_) { throw new Error('Document source returned malformed JSON.'); }
  if (!response.ok || !parsed || parsed.success !== true || !parsed.document) {
    throw new Error(String(parsed && (parsed.error || parsed.message) || `Document source failed (${response.status}).`).slice(0, 300));
  }
  return parsed.document;
}

module.exports = async function handler(req, res) {
  const secret = String(process.env.VERIFIER_HMAC_SECRET || '');
  if (req.method === 'GET') {
    let dependency = 'available';
    try { await import('@contentauth/c2pa-node'); } catch (_) { dependency = 'unavailable'; }
    const ready = Boolean(secret) && dependency === 'available';
    return send(res, ready ? 200 : 503, { ready, version: 'ggsipu-c2pa-vercel-v1', dependency });
  }
  if (req.method !== 'POST') return send(res, 405, { success: false, error: 'Method not allowed.' });
  if (!secret) return send(res, 503, { success: false, error: 'Verifier authentication is not configured.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const rawBody = JSON.stringify(body);
    const authError = authenticateRequest(req, secret, rawBody);
    if (authError) return send(res, 401, { success: false, error: authError });
    if (!body.documentSource || typeof body.documentSource !== 'object') throw new Error('Signed document source is required.');
    const document = await retrieveOriginalDocument(body.documentSource, body.expectedChecksum, body.applicationId, secret);
    const { screenDocument } = await import('../verifier/src/provenance.js');
    const screening = await screenDocument({ document, expectedChecksum: body.expectedChecksum });
    return send(res, 200, { success: true, provider: 'google-openai-c2pa-auto-verify-v2', screening });
  } catch (error) {
    return send(res, 400, { success: false, error: String(error && error.message || error).slice(0, 500) });
  }
};

module.exports._test = { authenticateRequest, callbackSignature, requestSignature, validateAppsScriptUrl };
