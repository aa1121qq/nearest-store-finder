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

/* ====== 1) المخازن الافتراضية (منطق حقيقي قابل للنقل) ====== */
const stores = [
  { id: 6015, name: "مخزن شمال الرياض",  lat: 24.8270, lng: 46.6390 },
  { id: 6022, name: "مخزن شرق الرياض",   lat: 24.7480, lng: 46.8200 },
  { id: 6033, name: "مخزن غرب الرياض",   lat: 24.6550, lng: 46.6080 },
  { id: 6044, name: "مخزن جنوب الرياض",  lat: 24.5800, lng: 46.7200 },
  { id: 6055, name: "مخزن وسط الرياض",   lat: 24.6877, lng: 46.7219 },
  { id: 6066, name: "مخزن حي الياسمين",  lat: 24.8420, lng: 46.6450 }
];

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

/* ====== 4) محاكاة سبل (Sebl) — للنموذج فقط ======
   *** هذه محاكاة فقط. ***
   - في الموقع الحقيقي: يُرسَل الرمز الوطني إلى API سبل،
     ويُسترجَع العنوان الفعلي (مدينة/حي/شارع/مبنى/إحداثيات).
   - هنا فقط نتحقق من النمط (4 أحرف لاتينية + 4 أرقام)
     ونعيد عنواناً وهمياً ثابتاً مشتقّاً من الرمز.
   ================================================ */
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
