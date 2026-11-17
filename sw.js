// ============================================================
// تدريب — Service Worker (PWA) — v2.
// قاعدة نشر ثابتة: ملف sw.js يُرفَع أخيراً في أي نشر، بعد كل الملفات
// الأخرى بلا استثناء. تثبيت عامل الخدمة أثناء رفع متعدد الملفات
// يجمّد مزيجاً من إصدارين في الذاكرة المؤقتة (حادثة 21:36 في v1.1:
// ذاكرة مختلطة من v1 وv1.1 على هاتف المستخدم) — رفع sw.js أخيراً
// يضمن أن التثبيت لا يخزّن إلا المجموعة الجديدة الكاملة.
// الاستراتيجية (v2): الشبكة أولاً للتنقل وكل ملفات HTML/JS/CSS من
// نفس المصدر، مع الرجوع للذاكرة عند انقطاع الشبكة — فيُحدَّث التطبيق
// فور النشر دون انتظار. الذاكرة أولاً فقط للأصول الثابتة حقاً:
// الخطوط والأيقونات وحزم vendor وملف manifest. لا تُخزَّن أبداً
// طلبات Firestore/Auth (مصادر خارجية — مستثناة أصلاً).
// ============================================================
var CACHE_NAME = 'tadreeb-v2.0.0';

var SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './css/export.css',
  './js/config.js',
  './js/firebase-init.js',
  './js/auth.js',
  './js/db.js',
  './js/notes.js',
  './js/export.js',
  './js/ui-helpers.js',
  './js/datetime.js',
  './js/app.js',
  './js/screens-dashboard.js',
  './js/screens-courses.js',
  './js/screens-calendar.js',
  './js/screens-directory.js',
  './js/screens-admin.js',
  './js/screens-session.js',
  './js/sw-register.js',
  './vendor/firebase-app-compat.js',
  './vendor/firebase-auth-compat.js',
  './vendor/firebase-firestore-compat.js',
  './vendor/exceljs.min.js',
  './fonts/IBM-Plex-Sans-Arabic-600.ttf',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // إضافة متسامحة: كل ملف على حدة، فلا يُفشل ملفٌ غائب التثبيت.
      return Promise.all(SHELL_FILES.map(function (url) {
        return cache.add(url).catch(function () {
          console.warn('[تدريب SW] تعذّر تخزين الملف مؤقتاً:', url);
        });
      }));
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE_NAME) return caches.delete(key);
        return Promise.resolve();
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// هل الطلب لأصل ثابت حقاً (خطوط/أيقونات/vendor/manifest)؟
function isStaticAsset(url) {
  var path = url.pathname;
  if (path.indexOf('/fonts/') !== -1) return true;
  if (path.indexOf('/icons/') !== -1) return true;
  if (path.indexOf('/vendor/') !== -1) return true;
  if (path.slice(-13) === 'manifest.json') return true;
  return false;
}

// الشبكة أولاً: يُجلَب من الشبكة وتُحفَظ نسخة ناجحة في الذاكرة،
// وعند فشل الشبكة يُرجَع للنسخة المخزَّنة، ثم لصفحة الاحتياطي
// (fallbackUrl) إن وُجدت. يُستخدم للتنقل وملفات HTML/JS/CSS.
function networkFirst(request, fallbackUrl) {
  return fetch(request).then(function (response) {
    if (response && response.ok) {
      var copy = response.clone();
      caches.open(CACHE_NAME).then(function (cache) {
        cache.put(request, copy);
      });
    }
    return response;
  }).catch(function (err) {
    return caches.match(request).then(function (cached) {
      if (cached) return cached;
      if (!fallbackUrl) throw err;
      return caches.match(fallbackUrl).then(function (fallback) {
        return fallback || caches.match('./');
      });
    });
  });
}

// الذاكرة أولاً، ثم الشبكة مع التخزين — للأصول الثابتة فقط.
function cacheFirst(request) {
  return caches.match(request).then(function (cached) {
    if (cached) return cached;
    return fetch(request).then(function (response) {
      if (response && response.ok) {
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(request, copy);
        });
      }
      return response;
    });
  });
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  // نفس المصدر وGET فقط — لا تُخزَّن طلبات Firestore/Auth أو أي مصدر خارجي.
  if (request.method !== 'GET') return;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // التنقل: الشبكة أولاً، والرجوع لنسخة index.html المخزَّنة دون اتصال.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, './index.html'));
    return;
  }

  // الأصول الثابتة حقاً: الذاكرة أولاً.
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // كل ما عداها من نفس المصدر (HTML/JS/CSS): الشبكة أولاً، والرجوع
  // للذاكرة عند انقطاع الشبكة — فلا تُجمَّد نسخة قديمة أبداً.
  event.respondWith(networkFirst(request, null));
});
