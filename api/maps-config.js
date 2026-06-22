/* ============================================================
   Vercel Serverless Function — Google Maps config
   ------------------------------------------------------------
   GET /api/maps-config
   ------------------------------------------------------------
   تُعيد مفتاح Google Maps وقت التشغيل بدل وضعه في كود الصفحة
   الثابت (حتى لا يُرفع المفتاح إلى GitHub).

   ملاحظة أمنية:
   - مفتاح Google Maps JS مصمَّم ليكون عاماً (يظهر في المتصفّح).
     التأمين يكون بـ "تقييد المفتاح": HTTP referrer = نطاق موقعك،
     وتقييد الـ APIs المسموح بها (Maps JavaScript + Places + Geocoding).
     اضبط ذلك من Google Cloud Console → Credentials.
   ------------------------------------------------------------
   المتغيّر: GOOGLE_MAPS_API_KEY (أو MAPS_API_KEY كبديل).
   ============================================================ */

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.MAPS_API_KEY;
  if (!key) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({
      success: false,
      code: 'NO_KEY',
      error: 'لا يوجد مفتاح خريطة. أضف GOOGLE_MAPS_API_KEY في Vercel Environment Variables.'
    });
  }

  // كاش قصير — المفتاح لا يتغيّر كثيراً
  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.status(200).json({ success: true, apiKey: key });
};
