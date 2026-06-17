/* ============================================================
   Vercel Serverless Function — Sebl National Address proxy
   ------------------------------------------------------------
   GET /api/national-address?shortaddress=RRRD3005&language=A
   ------------------------------------------------------------
   لماذا proxy على الخادم بدل استدعاء سبل من المتصفح مباشرة:
   1) لإخفاء الـ Subscription Key (يبقى كـ env var سرّي).
   2) لتجاوز قيود CORS التي تمنع المتصفح من نداء سبل مباشرة.
   3) للتطبيع — نُرجع شكلاً منظّماً للواجهة (ar/en).
   ============================================================ */

const SEBL_BASE_URL =
  'https://apina.address.gov.sa/NationalAddress/FullNAByShortAddress/FullNAByShortAddress';

// نمط الرمز الوطني الصحيح: 4 أحرف + 4 أرقام
const SHORTADDR_PATTERN = /^[A-Z]{4}[0-9]{4}$/;

function setCors(res) {
  // GitHub Pages قد ينادي هذا الـ endpoint من نطاق مختلف — لذا نسمح بالكل.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function cacheSuccess(res) {
  // كاش للردود الناجحة فقط (5 دقائق)
  res.setHeader('Cache-Control', 'public, max-age=300');
}
function noCache(res) {
  // رسائل الخطأ لا تُكاش حتى يصلح المستخدم المشكلة فوراً
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // 1) قراءة المدخلات والتحقّق من النمط
  const raw = (req.query.shortaddress || '').toString().trim().toUpperCase();
  if (!raw) {
    noCache(res);
    return res.status(400).json({
      success: false,
      code: 'MISSING_SHORTADDRESS',
      error: 'الرجاء إرسال shortaddress كمعامل.'
    });
  }
  if (!SHORTADDR_PATTERN.test(raw)) {
    noCache(res);
    return res.status(400).json({
      success: false,
      code: 'INVALID_FORMAT',
      error: 'تنسيق الرمز غير صحيح. مثال صالح: RRRD3005 (4 أحرف + 4 أرقام).'
    });
  }

  const language = (req.query.language || 'A').toString().toUpperCase() === 'E' ? 'E' : 'A';

  // 2) التأكّد من وجود الـ Subscription Key
  const SEBL_KEY = process.env.SEBL_API_KEY;
  if (!SEBL_KEY) {
    noCache(res);
    return res.status(500).json({
      success: false,
      code: 'NO_KEY',
      error: 'SEBL_API_KEY غير مضبوط على الخادم. أضفه في Vercel Environment Variables.'
    });
  }

  // 3) بناء طلب سبل
  const url = new URL(SEBL_BASE_URL);
  url.searchParams.set('format', 'json');
  url.searchParams.set('language', language);
  url.searchParams.set('page', '1');
  url.searchParams.set('encode', 'utf8');
  url.searchParams.set('shortaddress', raw);

  let upstreamRes;
  try {
    upstreamRes = await fetch(url.toString(), {
      headers: {
        'Ocp-Apim-Subscription-Key': SEBL_KEY,
        'api_key': SEBL_KEY, // بعض إصدارات apim تتطلّب اسماً مختلفاً للـ header
        'Accept': 'application/json'
      }
    });
  } catch (e) {
    noCache(res);
    return res.status(502).json({
      success: false,
      code: 'UPSTREAM_NETWORK',
      error: 'تعذّر الوصول إلى خادم سبل: ' + e.message
    });
  }

  // 4) ترجمة أخطاء سبل
  if (!upstreamRes.ok) {
    noCache(res);
    const text = await upstreamRes.text().catch(() => '');
    const map = {
      400: 'طلب غير صحيح (تنسيق الرمز خاطئ أو الرمز غير موجود).',
      401: 'الـ Subscription Key غير صالح. تحقق من قيمة SEBL_API_KEY.',
      403: 'تم استنفاد حد طلبات اشتراك سبل.',
      404: 'المسار غير موجود في سبل (تحقق من الـ endpoint).',
      500: 'خطأ داخلي في خادم سبل.',
      503: 'خدمة سبل غير متاحة حالياً.'
    };
    return res.status(upstreamRes.status).json({
      success: false,
      code: 'UPSTREAM_ERROR',
      status: upstreamRes.status,
      error: map[upstreamRes.status] || `خطأ من سبل (${upstreamRes.status}).`,
      detail: text.slice(0, 500)
    });
  }

  // 5) معالجة الرد الناجح
  let data;
  try {
    data = await upstreamRes.json();
  } catch {
    noCache(res);
    return res.status(502).json({
      success: false,
      code: 'BAD_UPSTREAM_JSON',
      error: 'رد غير صالح من سبل.'
    });
  }

  if (!data.success || !Array.isArray(data.Addresses) || data.Addresses.length === 0) {
    noCache(res);
    return res.status(404).json({
      success: false,
      code: 'NOT_FOUND',
      error: data.statusdescription || 'لم يُعثر على عنوان لهذا الرمز.'
    });
  }

  const a = data.Addresses[0];

  // 6) تطبيع للواجهة — حقول مرتّبة بالعربي والإنجليزي
  cacheSuccess(res);
  return res.status(200).json({
    success: true,
    data: {
      shortAddress: a.ShortAddress,
      latitude:  parseFloat(a.Latitude),
      longitude: parseFloat(a.Longitude),
      buildingNumber:   a.BuildingNumber,
      postCode:         a.PostCode,
      additionalNumber: a.AdditionalNumber,
      // الحقول حسب اللغة المطلوبة (الإنجليزية كقيمة افتراضية في سبل)
      en: {
        regionName: a.RegionName,
        city:       a.City,
        district:   a.District,
        street:     a.Street,
        address1:   a.Address1,
        address2:   a.Address2
      },
      // L2 = اللغة الثانية (العربية إن كانت الأساسية إنجليزية)
      ar: {
        regionName: a.RegionName_L2,
        city:       a.City_L2,
        district:   a.District_L2,
        street:     a.Street_L2
      }
    }
  });
};
