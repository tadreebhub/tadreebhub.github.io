// تدريب — Service Worker (PWA).
// ذاكرة مؤقتة معنونة بالإصدار؛ ارفع رقم الإصدار عند كل نشر جديد
// ليُحدَّث التطبيق المثبّت. لا تُخزَّن أبداً طلبات Firestore/Auth
// (نفس المصدر فقط — عناوين نسبية).
// ملاحظة لوكيل الشاشات: القائمة أدناه تتضمن index.html و css/* التي
// ستُضاف لاحقاً — حافظ على أسماء الملفات هذه ثابتة. التثبيت متسامح:
// ملف غائب لا يُفشل التثبيت، لكنه لن يعمل دون اتصال حتى يُضاف.
var CACHE_NAME = 'tadreeb-v1.1';

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
  './js/app.js',
  './js/screens-dashboard.js',
  './js/screens-courses.js',
  './js/screens-calendar.js',
  './js/screens-directory.js',
  './js/screens-admin.js',
  './js/screens-session.js',
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

self.addEventListener('fetch', function (event) {
  var request = event.request;
  // نفس المصدر وGET فقط — لا تُخزَّن طلبات Firestore/Auth أو أي مصدر خارجي.
  if (request.method !== 'GET') return;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // التنقل: الشبكة أولاً مع الرجوع للذاكرة (فيعمل التطبيق دون اتصال).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(function (response) {
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(request, copy);
        });
        return response;
      }).catch(function () {
        return caches.match('./index.html').then(function (cached) {
          return cached || caches.match('./');
        });
      })
    );
    return;
  }

  // باقي الملفات: الذاكرة أولاً، ثم الشبكة مع التخزين.
  event.respondWith(
    caches.match(request).then(function (cached) {
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
    })
  );
});
