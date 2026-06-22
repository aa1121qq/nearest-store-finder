/* ============================================================
   Vercel Serverless Function — Sebl reverse geocode (coords → NA)
   ------------------------------------------------------------
   GET /api/reverse-geocode?lat=24.6738&long=46.6607&language=A
   ------------------------------------------------------------
   الحركة الذكية: نأخذ إحداثيات (من خريطة Google مثلاً) ونُرجع
   العنوان الوطني الرسمي + الرمز المختصر من خدمة العنوان الوطني.

   - الاستدعاء خادم-لـ-خادم: المفتاح يبقى سرّياً على الخادم.
   - يتطلّب أن يشمل اشتراكك خدمة "Address Geocode" في بوابة
     العنوان الوطني (منتج منفصل عن FullNAByShortAddress).
   ============================================================ */

const GEOCODE_URL =
  'https://apina.address.gov.sa/NationalAddress/v3.1/address/address-geocode';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
function noCache(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // 1) قراءة الإحداثيات والتحقّق
  const lat  = parseFloat(req.query.lat);
  const long = parseFloat(req.query.long != null ? req.query.long : req.query.lng);
  if (isNaN(lat) || isNaN(long)) {
    noCache(res);
    return res.status(400).json({
      success: false, code: 'BAD_COORDS',
      error: 'الرجاء إرسال lat و long صحيحين.'
    });
  }
  const language = (req.query.language || 'A').toString().toUpperCase() === 'E' ? 'E' : 'A';

  // 2) المفتاح — مفتاح geocoding منفصل إن وُجد، وإلا مفتاح سبل نفسه
  const SEBL_KEY = process.env.GEOCODE_API_KEY || process.env.SEBL_API_KEY;
  if (!SEBL_KEY) {
    noCache(res);
    return res.status(500).json({
      success: false, code: 'NO_KEY',
      error: 'GEOCODE_API_KEY / SEBL_API_KEY غير مضبوط على الخادم.'
    });
  }

  // 3) بناء الطلب
  const url = new URL(GEOCODE_URL);
  url.searchParams.set('language', language);
  url.searchParams.set('format', 'JSON');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('long', String(long));
  url.searchParams.set('encode', 'utf8');

  let upstream;
  try {
    upstream = await fetch(url.toString(), {
      headers: {
        'Ocp-Apim-Subscription-Key': SEBL_KEY,
        'api_key': SEBL_KEY,
        'Accept': 'application/json'
      }
    });
  } catch (e) {
    noCache(res);
    return res.status(502).json({
      success: false, code: 'UPSTREAM_NETWORK',
      error: 'تعذّر الوصول إلى خادم العنوان الوطني: ' + e.message
    });
  }

  if (!upstream.ok) {
    noCache(res);
    const text = await upstream.text().catch(() => '');
    const map = {
      401: 'الاشتراك لا يشمل خدمة Address Geocode (فعّلها في بوابة العنوان الوطني).',
      403: 'تم استنفاد حد الطلبات.',
      404: 'المسار غير موجود.',
      500: 'خطأ داخلي في خادم العنوان الوطني.',
      503: 'الخدمة غير متاحة حالياً.'
    };
    return res.status(upstream.status).json({
      success: false, code: 'UPSTREAM_ERROR', status: upstream.status,
      error: map[upstream.status] || `خطأ من العنوان الوطني (${upstream.status}).`,
      detail: text.slice(0, 300)
    });
  }

  let data;
  try { data = await upstream.json(); }
  catch {
    noCache(res);
    return res.status(502).json({ success: false, code: 'BAD_JSON', error: 'رد غير صالح.' });
  }

  if (!data.success || !Array.isArray(data.Addresses) || data.Addresses.length === 0) {
    noCache(res);
    return res.status(404).json({
      success: false, code: 'NOT_FOUND',
      error: data.statusdescription || 'لا يوجد عنوان وطني لهذا الموقع.'
    });
  }

  // 4) تطبيع — نفس شكل /api/national-address
  const a = data.Addresses[0];
  const mainIsArabic = (language === 'A');
  const mainBlock = {
    regionName: a.RegionName, city: a.City, district: a.District,
    street: a.Street, address1: a.Address1, address2: a.Address2
  };
  const l2Block = {
    regionName: a.RegionName_L2, city: a.City_L2,
    district: a.District_L2, street: a.Street_L2
  };
  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.status(200).json({
    success: true,
    data: {
      shortAddress: a.ShortAddress,
      latitude: parseFloat(a.Latitude), longitude: parseFloat(a.Longitude),
      buildingNumber: a.BuildingNumber, postCode: a.PostCode,
      additionalNumber: a.AdditionalNumber,
      ar: mainIsArabic ? mainBlock : l2Block,
      en: mainIsArabic ? l2Block : mainBlock
    }
  });
};
