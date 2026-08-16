const HOSTEL_KEYWORDS = /\b(hostel|room|allocation|allotment|student|application|document|notice|grievance|warden|mess|fee|curfew|reporting|campus|priority|waitlist|bed|verification|allotted)\b/i;
const OTHER_STUDENT_PATTERN = /\b(other|another|someone|friend|classmate)\b.*\b(room|status|application|allocation|document|enrollment)\b/i;

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function whitelistContext(context = {}) {
  return {
    applicationId: context.applicationId || '',
    status: context.status || '',
    priority: context.priority || '',
    category: context.category || '',
    hostel: context.hostel || '',
    room: context.room || '',
    floor: context.floor || '',
    bed: context.bed || '',
    documentStatus: context.documentStatus || '',
    aadhaarStatus: context.aadhaarStatus || '',
    photoStatus: context.photoStatus || '',
    marksheetStatus: context.marksheetStatus || '',
    pwdCertificateStatus: context.pwdCertificateStatus || '',
    probability: context.probability || null,
    notices: Array.isArray(context.notices) ? context.notices.slice(0, 3).map(notice => ({
      title: notice.title || '',
      body: notice.body || '',
      date: notice.date || ''
    })) : []
  };
}

function buildPrompt(message, context) {
  return [
    'You are the GGSIPU East Delhi Campus hostel portal assistant.',
    'Answer only hostel-related questions for the currently logged-in student.',
    'Do not reveal, infer, or request data about any other student.',
    'Do not claim to make allocation, verification, fee, or grievance decisions.',
    'If official action is needed, direct the student to the portal tab or hostel office.',
    'Keep the response concise, practical, and under 180 words.',
    '',
    'Student portal context:',
    JSON.stringify(context, null, 2),
    '',
    'Student question:',
    message
  ].join('\n');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return send(res, 405, { success: false, error: 'Method not allowed.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return send(res, 503, {
      success: false,
      error: 'Smart assistant is not configured. Please check the portal tabs or file a grievance for official help.'
    });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      return send(res, 400, { success: false, error: 'Invalid JSON body.' });
    }
  }

  const message = String(body?.message || '').trim().slice(0, 500);
  if (!message) return send(res, 400, { success: false, error: 'Message is required.' });
  if (!HOSTEL_KEYWORDS.test(message)) {
    return send(res, 400, {
      success: false,
      error: 'Please ask a hostel-related question about application status, room allotment, documents, notices, fees, reporting, or grievances.'
    });
  }
  if (OTHER_STUDENT_PATTERN.test(message)) {
    return send(res, 403, {
      success: false,
      error: 'I can only help with the logged-in student account.'
    });
  }

  const model = process.env.GEMINI_CHAT_MODEL || 'gemini-2.5-flash-lite';
  const context = whitelistContext(body?.context || {});
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  try {
    const geminiResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: buildPrompt(message, context) }]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 260
        }
      })
    });

    const data = await geminiResponse.json().catch(() => ({}));
    if (!geminiResponse.ok) {
      return send(res, 502, {
        success: false,
        error: data.error?.message || 'Smart assistant failed to respond.'
      });
    }

    const answer = data.candidates?.[0]?.content?.parts
      ?.map(part => part.text || '')
      .join('')
      .trim();

    if (!answer) {
      return send(res, 502, {
        success: false,
        error: 'Smart assistant returned an empty response.'
      });
    }

    return send(res, 200, { success: true, answer });
  } catch (error) {
    return send(res, 502, {
      success: false,
      error: 'Smart assistant is temporarily unavailable.'
    });
  }
};

