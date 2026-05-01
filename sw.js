

'use strict';

// ----------------------------------------------------------------
//  إعدادات عامة
// ----------------------------------------------------------------

const CONFIG = {
    // بادئة كل أسماء الكاش (لتسهيل التنظيف والحذف)
    cachePrefix: 'p2p-share-',

    // إصدار الكاش الحالي — تغييره يُجبر تحديث كل الملفات
    version: '1.0.3',

    // مهلة طلب الشبكة بالمللي ثانية (للNetwork-First)
    networkTimeout: 4000,

    // الحد الأقصى لعدد إدخالات الكاش الديناميكي قبل التنظيف
    maxDynamicEntries: 80,

    // العمر الأقصى لإدخالات الكاش الديناميكي (7 أيام بالمللي ثانية)
    maxDynamicAge: 7 * 24 * 60 * 60 * 1000,
};

// اسم كاش الأصول المُخزَّنة مسبقاً (pre-cache)
const PRECACHE_NAME = CONFIG.cachePrefix + 'pre-' + CONFIG.version;

// اسم كاش الموارد الديناميكية (المُجلَبة أثناء الاستخدام)
const DYNAMIC_CACHE_NAME = CONFIG.cachePrefix + 'dynamic-' + CONFIG.version;

// ----------------------------------------------------------------
//  قائمة الأصول المطلوب تخزينها مسبقاً
//  هذه الملفات تُحمَّّل وتُخزَّن فوراً عند تثبيت الـ SW
// ----------------------------------------------------------------

const PRECACHE_URLS = [
    // الصفحة الرئيسية (دائماً)
    './',
    './index.html',

    // مكتبة توليد أكواد QR — مُستخدمة لعرض رموز الاتصال
    'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js',

    // مكتبة مسح أكواد QR عبر الكاميرا — مُستخدمة لقراءة رموز الطرف الآخر
    'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',

    // خط Tajawal العربي — ثقل 400 و700 (الأكثر استخداماً)
    'https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap',
    // ملف الخط الفعلي (يُجلَب تلقائياً لكن نخزّنه صراحةً لضمان العمل أوفلاين)
    'https://fonts.gstatic.com/s/tajawal/v9/Iura6YBj_oCad4k1nzGBC45I.woff2',
    'https://fonts.gstatic.com/s/tajawal/v9/Iurf6YBj_oCad4k1l4qjHrRpiYlJ.woff2',
];

// ----------------------------------------------------------------
//  قوائم التحكم — URLs التي لا يُطبَّق عليها التخزين
// ----------------------------------------------------------------

// الروابط التي لا نريد تخزينها نهائياً (chrome-extension, إلخ)
const NEVER_CACHE = [
    /^chrome-extension:/i,
    /^moz-extension:/i,
    /^edge-extension:/i,
    /^about:/i,
    /^data:/i,
    /^blob:/i,
];

// الروابط التي نستخدم معها استراتيجية Network-First
const NETWORK_FIRST_PATTERNS = [
    /\/sw\.js(\?.*)?$/i,  // ملف SW نفسه دائماً من الشبكة
];


// ================================================================
//  مرحلة التثبيت (install)
//  تُنفَّذ مرة واحدة عند أول تسجيل للـ SW
//  تخزّن كل الأصول المحددة مسبقاً في كاش مخصص
// ================================================================

self.addEventListener('install', (event) => {
    console.log(`[SW] تثبيت الإصدار ${CONFIG.version}`);

    event.waitUntil(
        (async () => {
            try {
                // فتح كاش Pre-cache
                const cache = await caches.open(PRECACHE_NAME);
                console.log('[SW] جارٍ تخزين الأصول مسبقاً...');

                // تخزين كل URL مع معالجة الأخطاء الفردية
                // لا نريد فشل ملف واحد أن يُفشل العملية كلها
                const results = await Promise.allSettled(
                    PRECACHE_URLS.map((url) =>
                        cache.add(url).catch((err) => {
                            console.warn(`[SW] فشل تخزين: ${url}`, err.message);
                            return null;
                        })
                    )
                );

                // إحصاء النجاح والفشل
                const succeeded = results.filter(r => r.status === 'fulfilled').length;
                const failed = results.filter(r => r.status === 'rejected').length;
                console.log(`[SW] اكتمل التخزين: ${succeeded} نجح، ${failed} فشل`);

                // تفعيل الـ SW فوراً بدون انتظار إغلاق التبويبات القديمة
                await self.skipWaiting();
                console.log('[SW] تم التفعيل الفوري (skipWaiting)');

            } catch (error) {
                console.error('[SW] خطأ عام في التثبيت:', error);
            }
        })()
    );
});


// ================================================================
//  مرحلة التنشيط (activate)
//  تُنفَّذ عندما يصبح الـ SW هو النشط (بعد التثبيت أو التحديث)
//  تنظف الكاش القديم وتُعلّم التبويبات المفتوحة
// ================================================================

self.addEventListener('activate', (event) => {
    console.log(`[SW] تنشيط الإصدار ${CONFIG.version}`);

    event.waitUntil(
        (async () => {
            try {
                // 1. الحصول على كل أسماء الكاش الموجودة
                const allCacheNames = await caches.keys();
                console.log('[SW] الكاش الموجود:', allCacheNames);

                // 2. حذف الكاش القديم (الذي يحتوي بادئتنا لكن بإصدار مختلف)
                const oldCaches = allCacheNames.filter((name) => {
                    return name.startsWith(CONFIG.cachePrefix) &&
                           name !== PRECACHE_NAME &&
                           name !== DYNAMIC_CACHE_NAME;
                });

                if (oldCaches.length > 0) {
                    console.log('[SW] حذف الكاش القديم:', oldCaches);
                    await Promise.all(oldCaches.map(name => caches.delete(name)));
                }

                // 3. تنظيف الكاش الديناميكي من الإدخالات المنتهية الصلاحية
                await pruneDynamicCache();

                // 4. السيطرة على كل التبويبات/النوافذ المفتوحة فوراً
                await self.clients.claim();

                // 5. إبلاغ كل صفحة مفتوحة بوجود تحديث جديد
                //    الصفحة يمكنها أن تعرض "تحديث متاح" للمستخدم
                const clients = await self.clients.matchAll({ type: 'window' });
                clients.forEach((client) => {
                    client.postMessage({
                        type: 'SW_UPDATED',
                        version: CONFIG.version,
                    });
                });

                console.log('[SW] اكتمل التنشيط بنجاح');

            } catch (error) {
                console.error('[SW] خطأ في التنشيط:', error);
            }
        })()
    );
});


// ================================================================
//  مرحلة اعتراض الطلبات (fetch)
//  كل طلب HTTP يمر من هنا — نختار الاستراتيجية المناسبة
// ================================================================

self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // ----------------------------------------------------------------
    //  تجاهل الطلبات غير HTTP/HTTPS
    // ----------------------------------------------------------------
    if (!request.url.startsWith('http://') && !request.url.startsWith('https://')) {
        return;
    }

    // ----------------------------------------------------------------
    //  تجاهل الطلبات التي لا يجب تخزينها نهائياً
    // ----------------------------------------------------------------
    if (NEVER_CACHE.some(pattern => pattern.test(request.url))) {
        return;
    }

    // ----------------------------------------------------------------
    //  تجاهل طلبات POST/PUT/DELETE (لا نخزّنها)
    // ----------------------------------------------------------------
    if (request.method !== 'GET') {
        return;
    }

    // ----------------------------------------------------------------
    //  اختيار الاستراتيجية حسب نوع الطلب
    // ----------------------------------------------------------------

    // استراتيجية 1: Network-First — لملف SW نفسه
    if (NETWORK_FIRST_PATTERNS.some(pattern => pattern.test(request.url))) {
        event.respondWith(networkFirstStrategy(request));
        return;
    }

    // استراتيجية 2: Stale-While-Revalidate — للصفحة الرئيسية فقط
    if (isNavigationRequest(request, url)) {
        event.respondWith(staleWhileRevalidateStrategy(request));
        return;
    }

    // استراتيجية 3: Cache-First — لكل شيء آخر (JS, CSS, خطوط, صور)
    event.respondWith(cacheFirstStrategy(request, url));
});


// ================================================================
//  الاستراتيجيات
// ================================================================

/**
 * استراتيجية Cache-First (الكاش أولاً)
 *
 * تُستخدم للأصول الثابتة: ملفات JS, CSS, الخطوط, الصور
 *
 * التدفق:
 *   1. البحث في الكاش → وُجد؟ نُعيده فوراً
 *   2. غير موجود → نطلبه من الشبكة
 *   3. نجح الشبكة → نخزّن نسخة في الكاش الديناميكي ونُعيدها
 *   4. فشلت الشبكة → نُرجع خطأ 503
 *
 * الميزة: أسرع استجابة، لا حاجة للشبكة بعد أول تحميل
 */
async function cacheFirstStrategy(request, url) {
    // تجربة الكاش أولاً
    const cachedResponse = await searchAllCaches(request);

    if (cachedResponse) {
        return cachedResponse;
    }

    // غير موجود في الكاش — نحاول الشبكة
    try {
        const networkResponse = await fetch(request);

        // نحفظ فقط الاستجابات الناجحة
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const cache = await caches.open(DYNAMIC_CACHE_NAME);
            // نسخ الاستجابة لأنها تُستهلك مرة واحدة
            const responseToCache = networkResponse.clone();
            // تخزين مع طابع زمني (في التعليقات) لغرض التنظيف لاحقاً
            cache.put(request, addTimestamp(responseToCache));
        }

        return networkResponse;

    } catch (networkError) {
        // الشبكة غير متاحة والمورد غير مخزن
        console.warn(`[SW] غير متاح أوفلاين: ${url.pathname}`);
        return new Response(generateOfflineFallbackHTML(), {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    }
}


/**
 * استراتيجية Network-First (الشبكة أولاً)
 *
 * تُستخدم لموارد قد تتغير (مثل ملف SW نفسه)
 *
 * التدفق:
 *   1. نطلب من الشبكة مع مهلة محددة
 *   2. نجح الشبكة خلال المهلة → نُخزّن ونُرجع
 *   3. انتهت المهلة أو فشلت → نبحث في الكاش
 *   4. الكاش فارغ → نُرجع ما توفر من الشبكة (حتى لو بطيء)
 */
async function networkFirstStrategy(request) {
    // محاولة الشبكة مع مهلة
    try {
        const networkResponse = await fetchWithTimeout(request, CONFIG.networkTimeout);

        if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(DYNAMIC_CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;

    } catch (networkError) {
        // الشبكة فشلت أو انتهت المهلة — نلجأ للكاش
        const cachedResponse = await searchAllCaches(request);

        if (cachedResponse) {
            console.log(`[SW] Network-First: رجوع للكاش — ${request.url}`);
            return cachedResponse;
        }

        // لا كاش ولا شبكة — إعادة محاولة بدون مهلة (آخر أمل)
        console.warn(`[SW] Network-First: إعادة محاولة بدون مهلة — ${request.url}`);
        return fetch(request);
    }
}


/**
 * استراتيجية Stale-While-Revalidate (القديم مع تحديث خلفي)
 *
 * تُستخدم للصفحة الرئيسية (navigation requests)
 *
 * التدفق:
 *   1. نُعيد النسخة المخزنة فوراً (سريع جداً)
 *   2. بالتوازي نطلب النسخة الجديدة من الشبكة
 *   3. نجح الشبكة → نُحدّث الكاش للزيارة القادمة
 *   4. لا يوجد كاش → ننتظر الشبكة
 */
async function staleWhileRevalidateStrategy(request) {
    const cache = await caches.open(DYNAMIC_CACHE_NAME);
    const cachedResponse = await cache.match(request);

    // تحديث خلفي بالتوازي (لا ننتظره)
    const backgroundUpdate = fetch(request)
        .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
                cache.put(request, addTimestamp(networkResponse));
            }
            return networkResponse;
        })
        .catch(() => null);

    // إذا وُجد في الكاش، نُعيده فوراً (التحديث يجري بالخلفية)
    if (cachedResponse) {
        return cachedResponse;
    }

    // لا كاش — ننتظر الشبكة
    try {
        return await backgroundUpdate;
    } catch (error) {
        // لا شبكة ولا كاش — صفحة أوفلاين بديلة
        return new Response(generateOfflineFallbackHTML(), {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    }
}


// ================================================================
//  دوال مساعدة
// ================================================================

/**
 * البحث عن طلب في كل الكاش المتاح (pre-cache + dynamic)
 * يُفيد عندما لا نعرف أي كاش يحتوي المورد
 */
async function searchAllCaches(request) {
    const cacheNames = [PRECACHE_NAME, DYNAMIC_CACHE_NAME];

    for (const name of cacheNames) {
        try {
            const cache = await caches.open(name);
            const response = await cache.match(request);
            if (response) return response;
        } catch (e) {
            // تجاهل أخطاء الكاش غير الموجود
        }
    }

    return null;
}

/**
 * طلب شبكة مع مهلة (timeout)
 * يُستخدم في استراتيجية Network-First لعدم التعليق طويلاً
 */
function fetchWithTimeout(request, timeout) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`انتهت مهلة الطلب (${timeout}ms)`));
        }, timeout);

        fetch(request)
            .then((response) => {
                clearTimeout(timer);
                resolve(response);
            })
            .catch((error) => {
                clearTimeout(timer);
                reject(error);
            });
    });
}

/**
 * هل الطلب هو طلب تنقل (navigation)؟
 * أي: طلب الصفحة الرئيسية (HTML) وليس ملفاً فرعياً
 */
function isNavigationRequest(request, url) {
    return (
        request.mode === 'navigate' ||
        (request.method === 'GET' &&
         request.headers.get('accept') &&
         request.headers.get('accept').includes('text/html'))
    );
}

/**
 * إضافة طابع زمني للاستجابة قبل تخزينها
 * نستخدم header مخصص لأن Response لا يدعم metadata مباشرة
 * يُستخدم لاحقاً في تنظيف الكاش حسب العمر
 */
function addTimestamp(response) {
    const headers = new Headers(response.headers);
    headers.set('sw-timestamp', Date.now().toString());
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: headers,
    });
}


/**
 * تنظيف الكاش الديناميكي من الإدخالات القديمة أو الزائدة
 * يُنفَّذ عند كل تنشيط للـ SW
 *
 * القواعد:
 *   1. حذف الإدخالات الأقدم من maxDynamicAge
 *   2. إذا زاد العدد عن maxDynamicEntries، نحذف الأقدم
 */
async function pruneDynamicCache() {
    try {
        const cache = await caches.open(DYNAMIC_CACHE_NAME);
        const keys = await cache.keys();
        const now = Date.now();

        // تجميع معلومات كل إدخال: المفتاح والعمر
        const entries = keys.map((key) => {
            const timestamp = parseInt(
                key.headers.get('sw-timestamp') || '0',
                10
            );
            return { key, timestamp: timestamp || now };
        });

        // فرز تنازلياً حسب العمر (الأحدث أولاً)
        entries.sort((a, b) => b.timestamp - a.timestamp);

        const toDelete = [];

        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const age = now - entry.timestamp;

            // حذف إذا تجاوز العمر الأقصى
            if (age > CONFIG.maxDynamicAge) {
                toDelete.push(entry.key);
                continue;
            }

            // حذف إذا تجاوز العدد الأقصى (نحذف الأقدم أولاً)
            if (i >= CONFIG.maxDynamicEntries) {
                toDelete.push(entry.key);
            }
        }

        if (toDelete.length > 0) {
            console.log(`[SW] تنظيف الكاش الديناميكي: حذف ${toDelete.length} إدخال قديم`);
            await Promise.all(toDelete.map(key => cache.delete(key)));
        }

    } catch (error) {
        console.warn('[SW] خطأ في تنظيف الكاش الديناميكي:', error);
    }
}


/**
 * توليد HTML بديل يُعرض عند عدم توفر الشبكة والكاش
 * صفحة بسيطة تخبر المستخدم بالوضع مع زر إعادة محاولة
 */
function generateOfflineFallbackHTML() {
    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>غير متاح أوفلاين</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;background:#0a0e17;color:#e4eaf4;
display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
.box{text-align:center;max-width:380px}
.icon{width:64px;height:64px;margin:0 auto 20px;border-radius:16px;
background:rgba(255,77,94,0.1);display:flex;align-items:center;justify-content:center;
border:1px solid rgba(255,77,94,0.2)}
.icon svg{width:32px;height:32px;fill:#ff4d5e}
h1{font-size:20px;font-weight:700;margin-bottom:8px}
p{font-size:14px;color:#6b7fa0;line-height:1.7;margin-bottom:24px}
button{padding:12px 28px;background:#00dfa2;color:#0a0e17;border:none;
border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit}
button:hover{background:#00b882}
</style>
</head>
<body>
<div class="box">
<div class="icon"><svg viewBox="0 0 24 24"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4
9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76
0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg></div>
<h1>غير متاح حالياً</h1>
<p>الصفحة المطلوبة غير محفوظة للعمل بدون إنترنت. تأكد من اتصالك بالإنترنت ثم أعد المحاولة.</p>
<button onclick="location.reload()">إعادة المحاولة</button>
</div>
</body>
</html>`;
}


// ================================================================
//  الاستماع لرسائل من الصفحة
//  تُستخدم للتواصل بين الصفحة والـ Service Worker
// ================================================================

self.addEventListener('message', (event) => {
    const data = event.data;

    if (!data || !data.type) return;

    switch (data.type) {

        // الصفحة تطلب تخزين URL محدد في الكاش (manual cache)
        case 'CACHE_URL':
            cacheUrlManual(data.url)
                .then(() => {
                    event.ports[0]?.postMessage({ success: true, url: data.url });
                })
                .catch((err) => {
                    event.ports[0]?.postMessage({ success: false, error: err.message });
                });
            break;

        // الصفحة تطلب حذف كل الكاش
        case 'CLEAR_ALL_CACHES':
            clearAllCaches()
                .then(() => {
                    event.ports[0]?.postMessage({ success: true });
                })
                .catch((err) => {
                    event.ports[0]?.postMessage({ success: false, error: err.message });
                });
            break;

        // الصفحة تطلب تخطي الانتظار وتفعيل الـ SW الجديد فوراً
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;

        // الصفحة تسأل عن إصدار الـ SW الحالي
        case 'GET_VERSION':
            event.ports[0]?.postMessage({ version: CONFIG.version });
            break;
    }
});


/**
 * تخزين URL يدوياً في الكاش الديناميكي
 * يُستخدم مثلاً عندما يُحمَّل مورد جديد والصفحة تريد حفظه
 */
async function cacheUrlManual(url) {
    if (!url) throw new Error('URL مطلوب');

    try {
        const response = await fetch(url);
        if (!response || response.status !== 200) {
            throw new Error(`فشل الجلب: HTTP ${response?.status}`);
        }

        const cache = await caches.open(DYNAMIC_CACHE_NAME);
        // إنشاء Request جديد لضمان تطابق المفتاح
        const request = new Request(url, { mode: 'cors' });
        cache.put(request, addTimestamp(response));

        console.log(`[SW] تم تخزين يدوي: ${url}`);
    } catch (error) {
        console.error(`[SW] فشل التخزين اليدوي: ${url}`, error);
        throw error;
    }
}


/**
 * حذف كل الكاش الخاص بالتطبيق
 * يُستخدم من زر "حذف بيانات التطبيق"
 */
async function clearAllCaches() {
    const allNames = await caches.keys();
    const appCaches = allNames.filter(name => name.startsWith(CONFIG.cachePrefix));

    await Promise.all(appCaches.map(name => caches.delete(name)));
    console.log(`[SW] تم حذف ${appCaches.length} كاش:`, appCaches);
}


// ================================================================
//  معالجة الأحداث الإضافية
// ================================================================

// عند فقدان الاتصال بالإنترنت — إبلاغ الصفحات
self.addEventListener('offline', () => {
    self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
            client.postMessage({ type: 'SW_OFFLINE' });
        });
    });
});

// عند عودة الاتصال
self.addEventListener('online', () => {
    self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
            client.postMessage({ type: 'SW_ONLINE' });
        });
    });
});

// التقاط أخطاء غير معالَجة (لمنع تعطيل الـ SW)
self.addEventListener('error', (event) => {
    console.error('[SW] خطأ غير معالَج:', event.error || event.message);
});

self.addEventListener('unhandledrejection', (event) => {
    console.error('[SW] Promise مرفوض غير معالَج:', event.reason);
});