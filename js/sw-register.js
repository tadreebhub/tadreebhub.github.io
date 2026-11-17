// تدريب — تسجيل عامل الخدمة (PWA).
// ملف خارجي عمداً (لا سكربت مضمّن في index.html) حتى تعمل سياسة
// أمن المحتوى script-src 'self' دون 'unsafe-inline'. لا يكسر
// التطبيق أبداً عند الفشل.
(function () {
  'use strict';
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      try {
        navigator.serviceWorker.register('sw.js').catch(function (err) {
          if (window.console) console.warn('[تدريب] تعذّر تسجيل عامل الخدمة:', err && err.message);
        });
      } catch (err) {
        if (window.console) console.warn('[تدريب] تعذّر تسجيل عامل الخدمة:', err && err.message);
      }
    });
  }
})();
