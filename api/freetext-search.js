/* ============================================================
   Vercel Serverless Function — National Address free-text search
   ------------------------------------------------------------
   GET /api/freetext-search?q=حي المعذر الرياض&language=A
   ------------------------------------------------------------
   نص عنوان → عناوين وطنية مطابقة (مع الرمز المختصر إن توفّر).
   نستخدمه كبديل: نأخذ نص عنوان Google ونبحث عن الرمز الوطني.
   المفتاح يبقى سرّياً على الخادم.
   ============================================================ */

const URL_BASE =
  'https://apina.address.gov.sa/NationalAddress/v3.1/address/address-free-text';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const q = (req.query.q || req.query.addressstring || '').toString().trim();
  if (!q) {
    return res.status(400).json({ success: false, code: 'MISSING_Q', error: 'الرجاء إرسال q (نص العنوان).' });
  }
  const language = (req.query.language || 'A').toString().toUpperCase() === 'E' ? 'E' : 'A';

  const KEY = process.env.GEOCODE_API_KEY || process.env.SEBL_API_KEY;
  if (!KEY) {
    return res.status(500).json({ success: false, code: 'NO_KEY', error: 'لا يوجد مفتاح على الخادم.' });
  }

  const url = new URL(URL_BASE);
  url.searchParams.set('language', language);
  url.searchParams.set('format', 'JSON');
  url.searchParams.set('addressstring', q);
  url.searchParams.set('page', '1');
  url.searchParams.set('encode', 'utf8');

  let upstream;
  try {
    upstream = await fetch(url.toString(), {
      headers: {
        'Ocp-Apim-Subscription-Key': KEY,
        'api_key': KEY,
        'Accept': 'application/json'
      }
    });
  } catch (e) {
    return res.status(502).json({ success: false, code: 'UPSTREAM_NETWORK', error: e.message });
  }

  const text = await upstream.text().catch(() => '');
  if (!upstream.ok) {
    return res.status(upstream.status).json({
      success: false, code: 'UPSTREAM_ERROR', status: upstream.status,
      error: `خطأ من العنوان الوطني (${upstream.status}).`, detail: text.slice(0, 300)
    });
  }

  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 400) }; }
  return res.status(200).json({ success: true, data });
};
