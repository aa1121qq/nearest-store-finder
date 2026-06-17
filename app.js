/* ============================================================
   app.js — منطق مشترك بين index.html و checkout.html
   ------------------------------------------------------------
   يحتوي على:
   1. مصفوفة المخازن الافتراضية (بيانات تجريبية).
   2. دالة Haversine لحساب المسافة بالكيلومتر.
   3. دوال الحفظ/القراءة في sessionStorage.
   4. محاكاة سبل (Sebl) للحصول على عنوان وهمي من رمز وطني.
   ------------------------------------------------------------
   *** نقاط الاستبدال عند النقل إلى Magento الحقيقي: ***
   - مصفوفة `stores`   → بيانات من API/قاعدة بيانات Magento.
   - sessionStorage    → Customer Session أو Quote في Magento.
   - simulateSebl()    → استدعاء API سبل الفعلي بالرمز الوطني.
   ============================================================ */

/* ====== 1) المخازن الافتراضية (إحداثيات من ملف العميل الفعلي) ====== */
const stores = [
  { id: 6015, name: "مخزن الرياض - 6015", lat: 24.6740695, lng: 46.6604273 },
  { id: 6016, name: "مخزن الرياض - 6016", lat: 24.8462459, lng: 46.6274973 },
  { id: 6014, name: "مخزن الرياض - 6014", lat: 24.7599585, lng: 46.7402353 }
];

/* ====== خريطة المنتج → المخزن (من بيانات العميل) ======
   كل منتج يُخزَّن في مخزن واحد فقط. عند تحديد موقع العميل،
   نعرض المنتجات المتوفّرة في "المخزن الأقرب" فقط.
   هذا يحاكي منطق المخزون (inventory) في Magento. */
const productStoreMap = {
  // مخصّص حسب ملف العميل: 9133006 → 6015، 5143-BF-M → 6016، 5533-2-KS → 6014
  // باقي المنتجات وُزّعت بشكل افتراضي للتجربة
  "9133006":   6015,
  "5143-G1-M": 6015,
  "5144-Y":    6015,
  "7076-9BD":  6015,

  "5143-BF-M": 6016,
  "5143-G2-M": 6016,
  "5144-M":    6016,
  "7221-10-1S":6016,

  "5533-2-KS": 6014,
  "5144-XG":   6014,
  "5657-G1-40":6014
};

function getProductsForStore(storeId, allProducts) {
  return allProducts.filter(p => productStoreMap[p.mpn] === storeId);
}

// مفتاح ثابت للتخزين (لتجنّب الكتابة الخاطئة في عدة أماكن)
const STORAGE_KEY = 'nsf_selection';

// نطاق التوفّر السريع — إن كان أقرب مخزن ضمن هذه المسافة
// نعتبر المنتجات متوفرة (in stock) للعميل
const STOCK_RADIUS_KM = 15;

/* ====== 2) Haversine — منطق حقيقي قابل للنقل ====== */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // نصف قطر الأرض بالكيلومتر
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// إيجاد أقرب مخزن من إحداثيات + إرجاع كل المخازن مرتّبة بالمسافة
function findRankedStores(userLat, userLng) {
  return stores
    .map(s => ({ ...s, distance: haversineKm(userLat, userLng, s.lat, s.lng) }))
    .sort((a, b) => a.distance - b.distance);
}

function getStoreById(id) {
  return stores.find(s => s.id === parseInt(id, 10)) || null;
}

/* ====== 3) الحفظ/القراءة — محاكاة لـ Magento Quote/Session ======
   *** ملاحظة محاكاة: ***
   هنا نستخدم sessionStorage لتمرير الاختيار بين صفحتين منفصلتين
   على GitHub Pages. في Magento الفعلي سيُحلّ هذا عبر:
     - Customer Session (\Magento\Customer\Model\Session)
     - أو حفظ على Quote (\Magento\Quote\Model\Quote)
   هذه الدوال هي نقطة الاستبدال — الواجهة لا تتغيّر.
   ========================================================== */
function saveSelection(payload) {
  // payload: { lat, lng, accuracy, storeId, storeName, distance, source }
  // source: 'auto' (من Geolocation) أو 'manual' (من القائمة المنسدلة)
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...payload,
      savedAt: new Date().toISOString()
    }));
  } catch (e) {
    console.warn('فشل الحفظ في sessionStorage:', e);
  }
}

function loadSelection() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function clearSelection() {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) {}
}

/* ====== 4) Sebl API — استدعاء الباك إند الفعلي ======
   - الباك إند موجود في `api/national-address.js` (Vercel function).
   - الـ Subscription Key محفوظ كـ env var على الخادم.
   - الواجهة هنا فقط ترسل الرمز وتعرض الرد.
   ----------------------------------------------------
   كيف يُحدَّد عنوان الخادم:
   - عند تشغيل المشروع من Vercel (نفس الدومين): مسار نسبي "/api".
   - عند GitHub Pages أو لوكال: يمكن تجاوز ذلك بضبط
     `window.SEBL_API_BASE` قبل تحميل app.js
     (مثلاً <script>window.SEBL_API_BASE="https://nsf.vercel.app"</script>).
   ==================================================== */

// قاعدة عنوان الـ API. فارغة = نفس الأصل (يعمل على Vercel/local).
// عند نشر الواجهة على GitHub Pages مع الباك إند على Vercel — اضبط هذا.
const SEBL_API_BASE = (typeof window !== 'undefined' && window.SEBL_API_BASE) || '';

async function fetchSeblAddress(code, language) {
  language = language || 'A'; // A = العربية كأساس، E = الإنجليزية

  if (!code || typeof code !== 'string') {
    return { ok: false, error: 'الرجاء إدخال رمز العنوان الوطني.' };
  }
  const trimmed = code.trim().toUpperCase();
  if (!/^[A-Z]{4}[0-9]{4}$/.test(trimmed)) {
    return {
      ok: false,
      error: 'تنسيق الرمز غير صحيح. مثال صالح: RRRD3005 (4 أحرف + 4 أرقام).'
    };
  }

  const url = `${SEBL_API_BASE}/api/national-address?shortaddress=${encodeURIComponent(trimmed)}&language=${language}`;

  try {
    const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    const body = await resp.json().catch(() => ({}));

    if (!resp.ok || !body.success) {
      return {
        ok: false,
        code: trimmed,
        error: body.error || `خطأ من الخادم (HTTP ${resp.status}).`,
        status: resp.status
      };
    }

    const d = body.data;
    // اختر اللغة المرغوبة (العربية كأساس لأن المستخدم عربي)
    const useAr = (language === 'A');
    const region   = (useAr ? d.ar.regionName : d.en.regionName) || d.ar.regionName || d.en.regionName;
    const city     = (useAr ? d.ar.city       : d.en.city)       || d.ar.city       || d.en.city;
    const district = (useAr ? d.ar.district   : d.en.district)   || d.ar.district   || d.en.district;
    const street   = (useAr ? d.ar.street     : d.en.street)     || d.ar.street     || d.en.street;

    return {
      ok: true,
      code: d.shortAddress,
      address: `${city}، حي ${district}، شارع ${street}، مبنى ${d.buildingNumber}`,
      city, district, street,
      region,
      building: d.buildingNumber,
      postCode: d.postCode,
      additionalNumber: d.additionalNumber,
      lat: d.latitude,
      lng: d.longitude,
      raw: d
    };
  } catch (e) {
    return {
      ok: false,
      code: trimmed,
      error: 'تعذّر الاتصال بالخادم. تأكّد أن الباك إند منشور وأن الرابط صحيح.'
    };
  }
}

/* ====== 4-bis) محاكاة سبل — احتياطي عند تعطل الباك إند ======
   تبقى متاحة لأغراض العرض/الديمو فقط. لن تُستخدم تلقائياً —
   الواجهة تستدعي fetchSeblAddress الفعلية أوّلاً، وفي حالة
   الفشل تُعرض رسالة خطأ. لو أردت العودة للمحاكاة (مثلاً لعرض
   الأقرباء بدون مفتاح): استخدم simulateSebl يدوياً.
   ============================================================= */
function simulateSebl(code) {
  if (!code || typeof code !== 'string') {
    return { ok: false, error: 'الرجاء إدخال رمز العنوان الوطني.' };
  }

  const trimmed = code.trim().toUpperCase();
  // النمط المطلوب: 4 أحرف لاتينية ثم 4 أرقام (مثال: RRRD2929)
  const pattern = /^[A-Z]{4}[0-9]{4}$/;
  if (!pattern.test(trimmed)) {
    return {
      ok: false,
      error: 'تنسيق الرمز غير صحيح. مثال صالح: RRRD2929 (4 أحرف + 4 أرقام).'
    };
  }

  // أحياء/شوارع وهمية للمحاكاة فقط
  const districts = ['العارض', 'النخيل', 'الياسمين', 'الملقا', 'الورود', 'الربيع'];
  const streets   = ['الأمير محمد', 'الملك فهد', 'العليا', 'التحلية', 'الإمام سعود', 'الأمير سلطان'];

  // اشتقاق ثابت من الرمز ليعطي نفس النتيجة لنفس الرمز
  const sum = trimmed.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const district = districts[sum % districts.length];
  const street   = streets[(sum * 3) % streets.length];
  const building = (sum % 900) + 100; // رقم بين 100 و 999

  return {
    ok: true,
    code: trimmed,
    address: `الرياض، حي ${district}، شارع ${street}، مبنى ${building}`,
    city: 'الرياض',
    district,
    street,
    building: String(building)
  };
}
