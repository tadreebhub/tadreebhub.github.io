// تدريب — المصادقة والأدوار (Firebase Auth — البريد/كلمة المرور).
// تسجيل الدخول باسم مستخدم + كلمة مرور؛ يُحوَّل اسم المستخدم داخلياً
// إلى بريد وهمي username@tadreeb.local لأن Firebase Auth يتطلب بريداً.
// لا تسجيل ذاتي أبداً: المدير هو من ينشئ كل الحسابات.
// يُحمَّل بعد firebase-init.js. يكشف window.TadreebAuth.
// ملاحظة: حذف مستخدم Auth نفسه غير ممكن من العميل — حذف الملف الشخصي
// (deleteUserProfile) يكفي لمنع الدخول، لأن signIn تتطلب وجود ملف شخصي.
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

  function validatePassword(password) {
    var pw = String(password == null ? '' : password);
    if (pw.length < 8) return { ok: false, error: 'كلمة المرور 8 أحرف على الأقل' };
    return { ok: true, error: null };
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
    var vPass = validatePassword(password);
    if (!vPass.ok) return Promise.reject(new Error(vPass.error));
    var cleanName = String(username).trim().toLowerCase();

    return auth().signInWithEmailAndPassword(usernameToEmail(cleanName), password)
      .then(function (cred) {
        return loadProfile(cred.user.uid).then(function (profile) {
          if (!profile) {
            // لا ملف شخصي = حساب محذوف أو غير مكتمل: منع الدخول.
            return auth().signOut().then(function () {
              throw new Error('هذا الحساب غير مفعّل — تواصل مع المدير');
            });
          }
          cachedProfile = profile;
          audit('login', 'users', cred.user.uid, 'تسجيل دخول: ' + profile.username);
          return { user: cred.user, profile: profile };
        });
      });
  }

  function signOut() {
    cachedProfile = null;
    stopAutoLock();
    return auth().signOut();
  }

  function getCurrentProfile() { return cachedProfile; }

  // يُستدعى cb(user, profile) بعد حلّ الملف الشخصي (profile قد يكون null).
  function onAuthChange(cb) {
    return auth().onAuthStateChanged(function (user) {
      if (!user) {
        cachedProfile = null;
        cb(null, null);
        return;
      }
      loadProfile(user.uid).then(function (profile) {
        cachedProfile = profile;
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

  // إعادة المصادقة لفتح القفل (دون تسجيل خروج).
  function reauthenticate(password) {
    var user = auth().currentUser;
    if (!user) return Promise.reject(new Error('لا يوجد مستخدم مسجل دخوله'));
    var cred = firebase.auth.EmailAuthProvider.credential(user.email, password);
    return user.reauthenticateWithCredential(cred);
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
    startAutoLock: startAutoLock,
    stopAutoLock: stopAutoLock,
    reauthenticate: reauthenticate,
    isAdmin: isAdmin,
    isEditor: isEditor,
    isViewer: isViewer,
    canWrite: canWrite
  };
})();
