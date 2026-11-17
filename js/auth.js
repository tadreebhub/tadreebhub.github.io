// تدريب — المصادقة والأدوار (Firebase Auth — البريد/كلمة المرور).
// تسجيل الدخول باسم مستخدم + كلمة مرور؛ يُحوَّل اسم المستخدم داخلياً
// إلى بريد وهمي username@tadreeb.local لأن Firebase Auth يتطلب بريداً.
// لا تسجيل ذاتي أبداً: المدير هو من ينشئ كل الحسابات.
// كلمة المرور الجديدة/المُعاد تعيينها: 10 أحرف على الأقل + حرف
// لاتيني + رقم غربي (الأرقام المشرقية لا تُحتسب)؛ الحسابات الحالية
// لا تُفرَض عليها القاعدة بأثر رجعي.
// قفل الحساب: 5 محاولات دخول فاشلة خلال 15 دقيقة تقفل الحساب
// 15 دقيقة (مجموعة loginAttempts: بصمة SHA-256 + طابع زمني فقط).
// الإجراءات المدمّرة للمدير تتطلب إعادة مصادقة (تطبيق ثانوي مؤقت).
// يُحمَّل بعد firebase-init.js. يكشف window.TadreebAuth.
// ملاحظة: حذف مستخدم Auth نفسه غير ممكن من العميل — حذف الملف الشخصي
// (deleteUserProfile) يكفي لمنع الدخول، لأن signIn تتطلب وجود ملف شخصي.
// كذلك لا يمكن للمدير إعادة تعيين كلمة مرور مستخدم دون معرفة كلمته
// الحالية من العميل وحده (لا Admin SDK هنا) — resetUserPassword تتحقق
// من كلمة المرور الحالية عبر تطبيق ثانوي، والبديل هو تعطيل الحساب
// (setUserDisabled) وإنشاء حساب جديد.
(function () {
  'use strict';

  var ROLES = ['admin', 'editor', 'viewer'];
  var ROLE_LABELS = { admin: 'مدير', editor: 'محرر', viewer: 'عارض' };
  var USERNAME_RE = /^[A-Za-z0-9._-]{3,30}$/;

  var cachedProfile = null; // ملف المستخدم الحالي بعد تسجيل الدخول
  var lockTimer = null;
  var lockHandler = null;
  var lockMinutes = 15;
  var lockCallback = null;

  function db() { return window.Tadreeb.getDb(); }
  function auth() { return window.Tadreeb.auth; }

  // تسجيل تدقيق اختياري: يعمل فقط إن حُمّلت طبقة البيانات، ولا يكسر شيئاً أبداً.
  function audit(action, entity, entityId, details) {
    try {
      if (window.TadreebDB && typeof window.TadreebDB.logAudit === 'function') {
        window.TadreebDB.logAudit(action, entity, entityId, details);
      }
    } catch (e) { /* التدقيق لا يكسر المصادقة أبداً */ }
  }

  function usernameToEmail(username) {
    return String(username).trim().toLowerCase() + '@tadreeb.local';
  }

  function validateUsername(username) {
    var name = String(username == null ? '' : username).trim();
    if (!name) return { ok: false, error: 'اسم المستخدم مطلوب' };
    if (!USERNAME_RE.test(name)) {
      return {
        ok: false,
        error: 'اسم المستخدم من 3 إلى 30 حرفاً: أحرف لاتينية وأرقام ونقطة وشرطة سفلية وشرطة فقط'
      };
    }
    return { ok: true, error: null };
  }

  // كلمة المرور: 10 أحرف على الأقل + حرف لاتيني واحد على الأقل +
  // رقم واحد على الأقل (أرقام غربية 0-9 فقط — الأرقام العربية
  // المشرقية ٠-٩ لا تُحتسب). تُطبَّق على كلمات المرور الجديدة
  // والمُعاد تعيينها فقط؛ كلمات المرور الحالية لا تُفرَض عليها
  // بأثر رجعي (تسجيل الدخول يتحقق من عدم الفراغ فقط).
  function validatePassword(password) {
    var pw = String(password == null ? '' : password);
    if (pw.length < 10 || !/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) {
      return { ok: false, error: 'كلمة المرور يجب أن تكون 10 أحرف على الأقل وتحتوي على حرف ورقم (أحرف لاتينية وأرقام غربية فقط)' };
    }
    return { ok: true, error: null };
  }

  // ---------- قفل الحساب بعد محاولات دخول فاشلة ----------
  // مجموعة loginAttempts: كل محاولة فاشلة مستند {u, at} حيث u بصمة
  // SHA-256 لاسم المستخدم (بلا اسم مستخدم نصي — لا بيانات شخصية)
  // و at طابع زمني من الخادم. 5 محاولات فاشلة خلال 15 دقيقة تقفل
  // الحساب 15 دقيقة. القفل يُفحص قبل استدعاء Firebase أصلاً،
  // والمحاولات المرفوضة أثناء القفل لا تُسجَّل (وإلا تمدّد القفل
  // إلى ما لا نهاية). لا فهرس مركّب مطلوب: الاستعلام بمساواة u
  // فقط، وتصفية النافذة الزمنية على العميل.
  // ملاحظة أمنية صادقة: البصمة غير مملّحة، فمن يعرف اسم مستخدم
  // يستطيع حساب بصمته وكتابة محاولات مزيّفة لقفل الحساب 15 دقيقة
  // (إزعاج محدود المدة، لا اختراق). الحماية الحقيقية من التخمين
  // هي قواعد Firestore + تقييد Firebase Auth نفسه.
  var LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
  var LOCKOUT_MAX_ATTEMPTS = 5;
  var LOCKOUT_MESSAGE = 'تم قفل الحساب مؤقتاً بعد محاولات دخول فاشلة — حاول بعد 15 دقيقة';

  function hexFromBytes(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i++) {
      var h = bytes[i].toString(16);
      out += (h.length === 1 ? '0' + h : h);
    }
    return out;
  }

  // بصمة غير مشفّرة (FNV-1a مزدوجة) كبديل عند غياب crypto.subtle
  // (سياق غير آمن — لا يحدث عملياً: التطبيق على HTTPS أو localhost).
  function fallbackHash(str) {
    var h1 = 0x811c9dc5;
    var h2 = 0x01000193;
    for (var i = 0; i < str.length; i++) {
      h1 ^= str.charCodeAt(i);
      h1 = Math.imul(h1, 0x01000193);
      h2 ^= str.charCodeAt(i);
      h2 = Math.imul(h2, 0x85ebca6b);
    }
    function hex32(n) {
      var s = (n >>> 0).toString(16);
      while (s.length < 8) s = '0' + s;
      return s;
    }
    return hex32(h1) + hex32(h2);
  }

  function hashUsername(username) {
    var clean = String(username).trim().toLowerCase();
    try {
      if (window.crypto && window.crypto.subtle && typeof window.crypto.subtle.digest === 'function') {
        return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(clean)).then(function (buf) {
          return hexFromBytes(new Uint8Array(buf));
        }).catch(function () {
          return fallbackHash(clean);
        });
      }
    } catch (e) { /* بديل أدناه */ }
    return Promise.resolve(fallbackHash(clean));
  }

  // طابع زمني → ميلي ثانية: يقبل Timestamp الحقيقي (toMillis) و
  // الرقم (المحاكاة تحوّل serverTimestamp إلى Date.now()) و Date
  // وصيغة {seconds, nanoseconds}.
  function tsToMillis(v) {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    if (typeof v.toMillis === 'function') { try { return v.toMillis(); } catch (e) { return 0; } }
    if (v instanceof Date) return v.getTime();
    if (typeof v.seconds === 'number') return v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6);
    return 0;
  }

  function serverTs() {
    return firebase.firestore.FieldValue.serverTimestamp();
  }

  function listAttemptsFor(hash) {
    return db().collection('loginAttempts').where('u', '==', hash).get().then(function (snap) {
      var out = [];
      snap.forEach(function (doc) {
        var data = doc.data() || {};
        out.push({ u: data.u, at: tsToMillis(data.at), locked: data.locked === true });
      });
      return out;
    });
  }

  function checkLockout(hash) {
    return listAttemptsFor(hash).then(function (attempts) {
      var now = Date.now();
      var recent = 0;
      var hasMarker = false;
      attempts.forEach(function (a) {
        if (a.locked && a.at > now - LOCKOUT_WINDOW_MS) hasMarker = true;
        // العلامة نفسها لا تُحتسب محاولة — المحاولات الفاشلة فقط.
        if (!a.locked && a.at > now - LOCKOUT_WINDOW_MS) recent++;
      });
      return { locked: recent >= LOCKOUT_MAX_ATTEMPTS, recentCount: recent, hasMarker: hasMarker, attempts: attempts };
    });
  }

  function recordAttempt(hash, locked) {
    try {
      var doc = { u: hash, at: serverTs() };
      if (locked) doc.locked = true;
      return db().collection('loginAttempts').add(doc).catch(function () { /* أفضل جهد — لا يكسر الدخول */ });
    } catch (e) {
      return Promise.resolve();
    }
  }

  function isCredentialFailure(err) {
    var s = ((err && err.code) || '') + ' ' + ((err && err.message) || '');
    return /auth\/(wrong-password|invalid-credential|user-not-found|invalid-email)/i.test(s);
  }

  // آخر تسجيل دخول ناجح (لكل بصمة) — لتقرير القفل المؤجل مرة واحدة
  // فقط عند أول دخول ناجح بعد القفل، لا عند كل دخول لاحق.
  function lastLoginKey(hash) { return 'tadreeb:lastLogin:' + hash; }
  function readLastLogin(hash) {
    try {
      var v = window.localStorage.getItem(lastLoginKey(hash));
      return v ? parseInt(v, 10) || 0 : 0;
    } catch (e) { return 0; }
  }
  function writeLastLogin(hash, ms) {
    try { window.localStorage.setItem(lastLoginKey(hash), String(ms)); } catch (e) { /* تجاهل */ }
  }

  // بعد دخول ناجح: إن وُجدت علامة قفل منذ آخر دخول ناجح، تُسجَّل
  // مرة واحدة في سجل التدقيق (القفل نفسه مسجَّل أصلاً في loginAttempts).
  function deferredLockoutAudit(hash, attempts) {
    try {
      var last = readLastLogin(hash);
      var now = Date.now();
      var hadLockout = attempts.some(function (a) { return a.locked && a.at > last; });
      writeLastLogin(hash, now);
      if (hadLockout) {
        audit('lockout', 'users', null, 'قفل حساب بعد محاولات فاشلة');
      }
    } catch (e) { /* التدقيق المؤجل لا يكسر الدخول أبداً */ }
  }

  // محاولات الدخول الفاشلة الأخيرة (للمدير فقط) — البصمة تُقطع
  // عند العرض؛ المستندات لا تحوي اسم المستخدم أصلاً.
  function listLoginAttempts() {
    requireAdmin();
    return db().collection('loginAttempts').orderBy('at', 'desc').limit(50).get().then(function (snap) {
      var out = [];
      snap.forEach(function (doc) {
        var data = doc.data() || {};
        out.push({ id: doc.id, u: data.u || '', atMs: tsToMillis(data.at), locked: data.locked === true });
      });
      out.sort(function (a, b) { return b.atMs - a.atMs; });
      return out;
    });
  }

  function requireAdmin() {
    if (!cachedProfile || cachedProfile.role !== 'admin') {
      throw new Error('هذه العملية متاحة للمدير فقط');
    }
  }

  function loadProfile(uid) {
    return db().collection('users').doc(uid).get().then(function (snap) {
      if (!snap.exists) return null;
      var data = snap.data();
      data.uid = snap.id;
      return data;
    });
  }

  // حالة الإعداد الأولي: هل أُنشئ حساب المدير الأول؟
  // غياب المستند = لم يكتمل الإعداد بعد.
  function getSetupState() {
    return db().collection('meta').doc('setup').get().then(function (snap) {
      if (!snap.exists) return false;
      return snap.data().setupComplete === true;
    });
  }

  // الإعداد الأول: يُستدعى مرة واحدة فقط، قبل وجود أي مدير.
  // الترتيب مهم لقواعد الأمان: حساب Auth، ثم الملف الشخصي، ثم ختم الإعداد.
  function runFirstSetup(username, password) {
    var vUser = validateUsername(username);
    if (!vUser.ok) return Promise.reject(new Error(vUser.error));
    var vPass = validatePassword(password);
    if (!vPass.ok) return Promise.reject(new Error(vPass.error));
    var cleanName = String(username).trim().toLowerCase();

    return getSetupState().then(function (done) {
      if (done) throw new Error('اكتمل الإعداد مسبقاً — لا يمكن إعادة الإعداد الأولي');
      return auth().createUserWithEmailAndPassword(usernameToEmail(cleanName), password);
    }).then(function (cred) {
      var uid = cred.user.uid;
      return db().collection('users').doc(uid).set({
        username: cleanName,
        role: 'admin',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }).then(function () { return uid; });
    }).then(function (uid) {
      return db().collection('meta').doc('setup').set({ setupComplete: true }).then(function () {
        return loadProfile(uid);
      });
    }).then(function (profile) {
      cachedProfile = profile;
      audit('first_setup', 'users', profile.uid, 'إنشاء حساب المدير الأول: ' + profile.username);
      return profile;
    });
  }

  function signIn(username, password) {
    var vUser = validateUsername(username);
    if (!vUser.ok) return Promise.reject(new Error(vUser.error));
    // كلمة المرور هنا تُفحص بالفراغ فقط — قاعدة القوة الجديدة
    // (10 أحرف + حرف + رقم) لا تُفرَض بأثر رجعي على الحسابات الحالية.
    if (!password) return Promise.reject(new Error('كلمة المرور مطلوبة'));
    var cleanName = String(username).trim().toLowerCase();
    var userHash = null;
    var lockInfo = null;

    return hashUsername(cleanName).then(function (hash) {
      userHash = hash;
      // فحص القفل قبل أي محاولة دخول. عند فشل الاستعلام (انقطاع
      // مثلاً) يُسمح بالمحاولة — القفل لا يقفل الجميع عند عطل.
      return checkLockout(hash).catch(function () { return null; });
    }).then(function (info) {
      lockInfo = info;
      if (info && info.locked) {
        throw new Error(LOCKOUT_MESSAGE);
      }
      return auth().signInWithEmailAndPassword(usernameToEmail(cleanName), password);
    }).catch(function (err) {
      // محاولة فاشلة بسبب بيانات اعتماد خاطئة فقط (لا أخطاء الشبكة
      // ولا رسالة القفل نفسها) تُسجَّل في loginAttempts — دون انتظار
      // الكتابة ودون حجب خطأ الدخول الأصلي أبداً. عند بلوغ المحاولة
      // الخامسة تُكتب علامة قفل أيضاً (بعد كتابة المحاولة نفسها).
      if (err && err.message === LOCKOUT_MESSAGE) throw err;
      if (userHash && isCredentialFailure(err)) {
        var writeDone = recordAttempt(userHash, false);
        if (lockInfo && lockInfo.recentCount + 1 >= LOCKOUT_MAX_ATTEMPTS && !lockInfo.hasMarker) {
          writeDone.then(function () { recordAttempt(userHash, true); });
        }
      }
      throw err;
    }).then(function (cred) {
      return loadProfile(cred.user.uid).then(function (profile) {
        if (!profile) {
          // لا ملف شخصي = حساب محذوف أو غير مكتمل: منع الدخول.
          return auth().signOut().then(function () {
            throw new Error('هذا الحساب غير مفعّل — تواصل مع المدير');
          });
        }
        if (profile.disabled === true) {
          // حساب معطّل من المدير: منع الدخول فوراً.
          return auth().signOut().then(function () {
            throw new Error('هذا الحساب معطّل — تواصل مع المدير');
          });
        }
        cachedProfile = profile;
        audit('login_success', 'users', cred.user.uid, 'تسجيل دخول: ' + profile.username);
        if (userHash && lockInfo) deferredLockoutAudit(userHash, lockInfo.attempts);
        return { user: cred.user, profile: profile };
      });
    });
  }

  function signOut() {
    cachedProfile = null;
    stopProfileListener();
    stopAutoLock();
    return auth().signOut();
  }

  function getCurrentProfile() { return cachedProfile; }

  // مستمع حي على ملف المستخدم نفسه فقط: إن عطّل المدير الحساب (أو حذف
  // ملفه) أثناء جلسة نشطة، يُبلَّغ التطبيق فوراً عبر cb(user, null, reason)
  // فيسجّل الخروج. اختياري تماماً — أي فشل يُتجاهل ويبقى فحص signIn هو الأساس.
  var profileUnsub = null;

  function stopProfileListener() {
    if (typeof profileUnsub === 'function') {
      try { profileUnsub(); } catch (e) { /* تجاهل */ }
    }
    profileUnsub = null;
  }

  function startProfileListener(user, cb) {
    stopProfileListener();
    try {
      var ref = db().collection('users').doc(user.uid);
      if (typeof ref.onSnapshot !== 'function') return;
      profileUnsub = ref.onSnapshot(function (snap) {
        try {
          if (!snap.exists) {
            cb(user, null, 'deleted');
            return;
          }
          var data = snap.data() || {};
          if (data.disabled === true) {
            cb(user, null, 'disabled');
            return;
          }
          data.uid = snap.id;
          cachedProfile = data; // تحديث حي للملف (مثلاً عند تغيير الدور)
        } catch (e) { /* تجاهل */ }
      }, function () { /* أخطاء المستمع تُتجاهل */ });
    } catch (e) { /* المستمع اختياري */ }
  }

  // يُستدعى cb(user, profile, reason) بعد حلّ الملف الشخصي (profile قد يكون
  // null؛ reason = 'disabled' أو 'deleted' عند رصد التعطيل/الحذف أثناء جلسة نشطة).
  function onAuthChange(cb) {
    return auth().onAuthStateChanged(function (user) {
      if (!user) {
        cachedProfile = null;
        stopProfileListener();
        cb(null, null);
        return;
      }
      loadProfile(user.uid).then(function (profile) {
        if (profile && profile.disabled === true) {
          // عُطّل الحساب بين تسجيل الدخول وحلّ الملف: يُعامل كحساب معطّل.
          cachedProfile = null;
          cb(user, null, 'disabled');
          return;
        }
        cachedProfile = profile;
        if (profile) startProfileListener(user, cb);
        cb(user, profile);
      }).catch(function () {
        cachedProfile = null;
        cb(user, null);
      });
    });
  }

  // إنشاء حساب جديد دون تسجيل خروج المدير: تطبيق Firebase ثانوي مؤقت.
  function provisionUser(username, password, role) {
    requireAdmin();
    var vUser = validateUsername(username);
    if (!vUser.ok) return Promise.reject(new Error(vUser.error));
    var vPass = validatePassword(password);
    if (!vPass.ok) return Promise.reject(new Error(vPass.error));
    if (ROLES.indexOf(role) === -1) {
      return Promise.reject(new Error('الدور غير صالح — اختر مديراً أو محرراً أو عارضاً'));
    }
    var cleanName = String(username).trim().toLowerCase();
    var secondary = null;

    try {
      secondary = firebase.initializeApp(window.TADREEB_CONFIG, 'secondary');
    } catch (e) {
      secondary = firebase.app('secondary');
    }

    return secondary.auth().createUserWithEmailAndPassword(usernameToEmail(cleanName), password)
      .then(function (cred) {
        var uid = cred.user.uid;
        return db().collection('users').doc(uid).set({
          username: cleanName,
          role: role,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(function () { return uid; });
      })
      .then(function (uid) {
        audit('user_create', 'users', uid, 'إنشاء حساب: ' + cleanName + ' — الدور: ' + (ROLE_LABELS[role] || role));
        return uid;
      })
      .finally(function () {
        // حذف التطبيق الثانوي دائماً (نجاحاً أو فشلاً) ليبقى المدير مسجلاً دخوله.
        return secondary.delete().catch(function () { /* تجاهل */ });
      });
  }

  function listUsers() {
    requireAdmin();
    return db().collection('users').orderBy('username').get().then(function (snap) {
      var out = [];
      snap.forEach(function (doc) {
        var data = doc.data();
        data.uid = doc.id;
        out.push(data);
      });
      return out;
    });
  }

  function setUserRole(uid, role) {
    requireAdmin();
    if (ROLES.indexOf(role) === -1) {
      return Promise.reject(new Error('الدور غير صالح — اختر مديراً أو محرراً أو عارضاً'));
    }
    return db().collection('users').doc(uid).update({ role: role }).then(function () {
      audit('user_role', 'users', uid, 'تغيير الدور إلى: ' + (ROLE_LABELS[role] || role));
    });
  }

  // يحذف الملف الشخصي فقط؛ حساب Auth يبقى في Firebase لكنه لا يستطيع
  // الدخول لأن signIn تتطلب ملفاً شخصياً. لحذف حساب Auth نهائياً،
  // يحذفه المدير من وحدة تحكم Firebase (Authentication ← Users).
  function deleteUserProfile(uid) {
    requireAdmin();
    return db().collection('users').doc(uid).delete().then(function () {
      audit('user_delete', 'users', uid, 'حذف الملف الشخصي (حساب Auth ما زال موجوداً في وحدة التحكم)');
    });
  }

  // تعطيل/تفعيل حساب: حقل disabled على الملف الشخصي. الحساب المعطّل
  // يُمنع من تسجيل الدخول في signIn، وتُنهى جلسته النشطة فوراً عبر
  // مستمع الملف في onAuthChange. لا يمكن للمدير تعطيل حسابه الحالي.
  function setUserDisabled(uid, disabled) {
    requireAdmin();
    if (disabled && cachedProfile && uid === cachedProfile.uid) {
      return Promise.reject(new Error('لا يمكنك تعطيل حسابك الحالي'));
    }
    return db().collection('users').doc(uid).update({ disabled: !!disabled }).then(function () {
      audit(disabled ? 'user_disable' : 'user_enable', 'users', uid,
        disabled ? 'تعطيل الحساب' : 'تفعيل الحساب');
    });
  }

  // إعادة تعيين كلمة مرور مستخدم — تتطلب كلمة المرور الحالية.
  // القيد صادق: من العميل وحده (بلا Admin SDK) لا توجد طريقة إدارية
  // لتغيير كلمة مرور مستخدم آخر دون معرفة كلمته الحالية. التدفق هنا:
  // تطبيق Firebase ثانوي مؤقت يسجّل الدخول بالحساب المستهدف وكلمة
  // مروره الحالية، ثم يحدّث كلمة المرور ويسجّل الخروج — فيبقى المدير
  // مسجلاً دخوله في التطبيق الرئيسي. البديل عند جهل كلمة المرور
  // الحالية: تعطيل الحساب وإنشاء حساب جديد.
  function resetUserPassword(username, currentPassword, newPassword) {
    requireAdmin();
    var vUser = validateUsername(username);
    if (!vUser.ok) return Promise.reject(new Error(vUser.error));
    if (!currentPassword) return Promise.reject(new Error('كلمة المرور الحالية مطلوبة'));
    var vPass = validatePassword(newPassword);
    if (!vPass.ok) return Promise.reject(new Error(vPass.error));
    var cleanName = String(username).trim().toLowerCase();
    var secondary = null;

    try {
      secondary = firebase.initializeApp(window.TADREEB_CONFIG, 'secondary');
    } catch (e) {
      secondary = firebase.app('secondary');
    }

    return secondary.auth().signInWithEmailAndPassword(usernameToEmail(cleanName), currentPassword)
      .then(function (cred) {
        return cred.user.updatePassword(newPassword);
      })
      .then(function () {
        return secondary.auth().signOut();
      })
      .then(function () {
        audit('user_password_reset', 'users', cleanName, 'إعادة تعيين كلمة مرور: ' + cleanName);
      })
      .catch(function (err) {
        var msg = err && err.message ? err.message : '';
        if (/auth\/wrong-password|auth\/invalid-credential|auth\/user-not-found/i.test(msg)) {
          throw new Error('كلمة المرور الحالية غير صحيحة');
        }
        throw err;
      })
      .finally(function () {
        // حذف التطبيق الثانوي دائماً (نجاحاً أو فشلاً) ليبقى المدير مسجلاً دخوله.
        return secondary.delete().catch(function () { /* تجاهل */ });
      });
  }

  // --- القفل التلقائي بعد الخمول ---
  function resetLockTimer() {
    if (lockTimer) clearTimeout(lockTimer);
    lockTimer = setTimeout(function () {
      if (typeof lockCallback === 'function') lockCallback();
    }, lockMinutes * 60 * 1000);
  }

  function startAutoLock(onLock, minutes) {
    stopAutoLock();
    lockCallback = onLock;
    lockMinutes = (typeof minutes === 'number' && minutes > 0) ? minutes : 15;
    lockHandler = function () { resetLockTimer(); };
    ['click', 'keydown', 'touchstart'].forEach(function (ev) {
      window.addEventListener(ev, lockHandler, { passive: true });
    });
    resetLockTimer();
  }

  function stopAutoLock() {
    if (lockTimer) { clearTimeout(lockTimer); lockTimer = null; }
    if (lockHandler) {
      ['click', 'keydown', 'touchstart'].forEach(function (ev) {
        window.removeEventListener(ev, lockHandler);
      });
      lockHandler = null;
    }
    lockCallback = null;
  }

  // إعادة المصادقة: التحقق من كلمة مرور المستخدم الحالي عبر تطبيق
  // Firebase ثانوي مؤقت (النمط نفسه المستخدم في resetUserPassword —
  // لا reauthenticateWithCredential هنا لأن النمط الثانوي مثبَت في
  // قاعدة الكود). يبقى المستخدم مسجلاً دخوله في التطبيق الرئيسي
  // دائماً: التطبيق الثانوي يُسجَّل خروجه ويُحذف في finally.
  // يُستخدم لفتح القفل ولتأكيد الإجراءات المدمّرة للمدير.
  function reauthenticate(password) {
    var user = auth().currentUser;
    if (!user || !user.email) return Promise.reject(new Error('لا يوجد مستخدم مسجل دخوله'));
    if (!password) return Promise.reject(new Error('كلمة المرور غير صحيحة'));
    var secondary = null;
    try {
      secondary = firebase.initializeApp(window.TADREEB_CONFIG, 'secondary');
    } catch (e) {
      try {
        secondary = firebase.app('secondary');
      } catch (e2) {
        return Promise.reject(new Error('تعذّر التحقق — أعد المحاولة'));
      }
    }
    return secondary.auth().signInWithEmailAndPassword(user.email, password)
      .then(function () {
        return secondary.auth().signOut();
      })
      .catch(function (err) {
        var s = ((err && err.code) || '') + ' ' + ((err && err.message) || '');
        if (/auth\/(wrong-password|invalid-credential|user-not-found)/i.test(s)) {
          throw new Error('كلمة المرور غير صحيحة');
        }
        throw err;
      })
      .finally(function () {
        // حذف التطبيق الثانوي دائماً (نجاحاً أو فشلاً) ليبقى المستخدم
        // مسجلاً دخوله في التطبيق الرئيسي.
        return secondary.delete().catch(function () { /* تجاهل */ });
      });
  }

  // --- مساعدات الأدوار (تعتمد على الملف المخزّن) ---
  function isAdmin() { return !!cachedProfile && cachedProfile.role === 'admin'; }
  function isEditor() { return !!cachedProfile && cachedProfile.role === 'editor'; }
  function isViewer() { return !!cachedProfile && cachedProfile.role === 'viewer'; }
  function canWrite() { return isAdmin() || isEditor(); }

  window.TadreebAuth = {
    usernameToEmail: usernameToEmail,
    validateUsername: validateUsername,
    validatePassword: validatePassword,
    getSetupState: getSetupState,
    runFirstSetup: runFirstSetup,
    signIn: signIn,
    signOut: signOut,
    getCurrentProfile: getCurrentProfile,
    onAuthChange: onAuthChange,
    provisionUser: provisionUser,
    listUsers: listUsers,
    setUserRole: setUserRole,
    deleteUserProfile: deleteUserProfile,
    setUserDisabled: setUserDisabled,
    resetUserPassword: resetUserPassword,
    listLoginAttempts: listLoginAttempts,
    startAutoLock: startAutoLock,
    stopAutoLock: stopAutoLock,
    reauthenticate: reauthenticate,
    isAdmin: isAdmin,
    isEditor: isEditor,
    isViewer: isViewer,
    canWrite: canWrite
  };
})();
