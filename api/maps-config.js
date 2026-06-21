/* ============================================================
   Vercel Serverless Function — National Address Maps config
   ------------------------------------------------------------
   GET /api/maps-config
   ------------------------------------------------------------
   تُعيد مفتاح خريطة العنوان الوطني وقت التشغيل بدل وضعه في
   كود الصفحة الثابت (حتى لا يُرفع المفتاح إلى GitHub).

   ملاحظة أمنية مهمة:
   - محرّك خريطة العنوان الوطني (map-engine) يُحمَّل في المتصفّح،
     ويتطلّب المفتاح في طرف العميل — هذا أمر متأصّل في كل SDK
     خرائط يعمل من المتصفح. لذا المفتاح سيظهر في طلبات الشبكة.
   - للنموذج التجريبي هذا مقبول. عند الإنتاج: قيّد المفتاح على
     نطاق موقعك (domain restriction) من بوابة العنوان الوطني،
     أو استخدم proxyUrl لتمرير طلبات المحرّك عبر خادمك.
   ------------------------------------------------------------
   المتغيّر: MAPS_API_KEY إن وُجد، وإلا يستعمل SEBL_API_KEY نفسه.
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

  const key = process.env.MAPS_API_KEY || process.env.SEBL_API_KEY;
  if (!key) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({
      success: false,
      code: 'NO_KEY',
      error: 'لا يوجد مفتاح خريطة. أضف MAPS_API_KEY (أو SEBL_API_KEY) في Vercel Environment Variables.'
    });
  }

  // كاش قصير — المفتاح لا يتغيّر كثيراً
  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.status(200).json({ success: true, apiKey: key });
};
