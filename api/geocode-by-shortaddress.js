/* ============================================================
   Vercel Serverless Function — Geocode By ShortAddress proxy
   ------------------------------------------------------------
   GET /api/geocode-by-shortaddress?shortaddress=RRRD3005
   ------------------------------------------------------------
   رمز وطني → إحداثيات (Latitude/Longitude). مفيد للتحقّق من رمز،
   ويُستخدم هنا أيضاً لتأكيد أن GEOCODE_API_KEY صالح للخدمة.
   المفتاح يبقى سرّياً على الخادم.
   ============================================================ */

const URL_BASE =
  'https://apina.address.gov.sa/NationalAddress/GeoCodeByShortAddress/GeoCodeByShortlAddress';

const SHORTADDR_PATTERN = /^[A-Z]{4}[0-9]{4}$/;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const raw = (req.query.shortaddress || '').toString().trim().toUpperCase();
  if (!SHORTADDR_PATTERN.test(raw)) {
    return res.status(400).json({
      success: false, code: 'INVALID_FORMAT',
      error: 'تنسيق الرمز غير صحيح. مثال: RRRD3005.'
    });
  }

  const KEY = process.env.GEOCODE_API_KEY || process.env.SEBL_API_KEY;
  if (!KEY) {
    return res.status(500).json({ success: false, code: 'NO_KEY', error: 'لا يوجد مفتاح على الخادم.' });
  }

  const url = new URL(URL_BASE);
  url.searchParams.set('format', 'json');
  url.searchParams.set('shortaddress', raw);

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
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 300) }; }
  return res.status(200).json({ success: true, data });
};
