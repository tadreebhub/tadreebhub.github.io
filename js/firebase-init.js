// تدريب — تهيئة Firebase (SDK المتوافق v10.12.2، سكربتات كلاسيكية).
// يُحمَّل بعد vendor/firebase-*-compat.js و js/config.js.
// يكشف window.Tadreeb = { app, auth, db } و window.Tadreeb.getDb().
// التخزين المؤقت دون اتصال مفعّل: يعمل التطبيق على البيانات المخزّنة
// عند انقطاع الإنترنت، وتُزامَن الكتابات المعلّقة تلقائياً عند عودته.
(function () {
  'use strict';

  if (!window.firebase) {
    throw new Error('لم يتم تحميل Firebase SDK — تأكد من تحميل vendor/firebase-app-compat.js أولاً');
  }
  if (!window.TADREEB_CONFIG) {
    throw new Error('لم يتم تحميل إعدادات تدريب — تأكد من تحميل js/config.js أولاً');
  }

  var app = firebase.apps.length
    ? firebase.app()
    : firebase.initializeApp(window.TADREEB_CONFIG);

  var auth = firebase.auth(app);
  var db = firebase.firestore(app);

  // العمل دون اتصال: تفعيل الثبات المحلي مع مزامنة التبويبات.
  // failed-precondition: تبويب آخر فعّل الثبات — نتجاهل بهدوء.
  // unimplemented: المتصفح لا يدعم IndexedDB — نتجاهل بهدوء.
  db.enablePersistence({ synchronizeTabs: true }).catch(function (err) {
    if (err && (err.code === 'failed-precondition' || err.code === 'unimplemented')) {
      console.warn('[تدريب] تعذّر تفعيل الثبات دون اتصال:', err.code);
    } else {
      console.warn('[تدريب] خطأ غير متوقع في تفعيل الثبات:', err);
    }
  });

  // مرجع قابل للحقن: تسمح الاختبارات باستبدال قاعدة البيانات بمحاكاة
  // عبر Tadreeb.__setDb(mock) دون تغيير بقية الطبقة.
  var dbOverride = null;

  window.Tadreeb = {
    app: app,
    auth: auth,
    db: db,
    getDb: function () { return dbOverride || db; },
    __setDb: function (mockDb) { dbOverride = mockDb || null; }
  };
})();
