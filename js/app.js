// تدريب — التطبيق الرئيسي: الإقلاع، المصادقة، المتجر، التنقل، القفل.
// يُحمَّل بعد ui-helpers.js وقبل شاشات screens-*.js. يكشف window.App.
// الشاشات تُسجَّل في window.Screens من ملفاتها الخاصة.
(function () {
  'use strict';

  var DB = function () { return window.TadreebDB; };
  var Auth = function () { return window.TadreebAuth; };

  // ---------- المتجر: نسخة محلية من كل المجموعات ----------
  var COLLECTIONS = [
    'courses', 'sessions', 'meetings', 'trainees', 'trainers', 'directorates', 'groups', 'levels',
    'halls', 'periods', 'holidays', 'expenses', 'budgetCategories'
  ];

  var Store = {
    data: {},
    loaded: false,
    loading: null,
    unsubscribes: [],

    getAll: function (col) { return this.data[col] || []; },
    get: function (col, id) {
      var list = this.data[col] || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) return list[i];
      }
      return null;
    },
    byIdMap: function (col) {
      var map = {};
      (this.data[col] || []).forEach(function (item) { map[item.id] = item; });
      return map;
    }
  };

  function loadAll() {
    if (Store.loading) return Store.loading;
    Store.loading = Promise.all(COLLECTIONS.map(function (col) {
      var order = (col === 'periods') ? 'order' : (col === 'halls' ? 'name' : null);
      return DB().list(col, order).then(function (items) {
        Store.data[col] = items;
      });
    })).then(function () {
      Store.loaded = true;
      Store.loading = null;
    }).catch(function (err) {
      Store.loading = null;
      throw err;
    });
    return Store.loading;
  }

  var rerenderTimer = null;
  function scheduleRerender() {
    // لا نعيد الرسم أثناء الكتابة داخل الشاشة (حتى لا تضيع مدخلات غير محفوظة).
    var active = document.activeElement;
    if (active && active.closest && active.closest('#screen-container') &&
        /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) {
      return;
    }
    if (rerenderTimer) clearTimeout(rerenderTimer);
    rerenderTimer = setTimeout(function () {
      rerenderTimer = null;
      if (App.currentScreen) renderScreen(App.currentScreen, App.currentParams, true);
    }, 350);
  }

  function subscribeAll() {
    unsubscribeAll();
    COLLECTIONS.forEach(function (col) {
      try {
        var order = (col === 'periods') ? 'order' : null;
        var unsub = DB().subscribe(col, function (items) {
          Store.data[col] = items;
          scheduleRerender();
        }, order);
        if (typeof unsub === 'function') Store.unsubscribes.push(unsub);
      } catch (e) { /* الاشتراك المباشر اختياري — القوائم تُحمَّل عند الحاجة */ }
    });
  }

  function unsubscribeAll() {
    Store.unsubscribes.forEach(function (fn) { try { fn(); } catch (e) {} });
    Store.unsubscribes = [];
  }

  // ---------- مساعدات بيانات ----------
  function sessionsForCourse(courseId) {
    return Store.getAll('sessions').filter(function (s) { return s.courseId === courseId; })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }

  // حالة الإنجاز المشتقة للدورة (إدارة الدورات v1.1): القيم المخزّنة
  // فعلياً هي active/completed/cancelled فقط (لا قيمة «متوقفة» في
  // النموذج) — 'paused' هنا دفاعي لتوافق مستقبلي. ملغاة تبقى ملغاة،
  // والمكتملة المخزّنة تبقى مكتملة، وإلا تُشتق من الجلسات: كل الجلسات
  // مكتملة (مع وجود جلسة واحدة على الأقل) ← مكتملة، وإلا جارية.
  // دورة بلا جلسات جارية (0%) ما لم تكن ملغاة أو متوقفة.
  function completionStatus(course, done, sessionsTotal) {
    var st = course ? course.status : null;
    if (st === 'cancelled') return 'cancelled';
    if (st === 'paused') return 'paused';
    if (st === 'completed') return 'completed';
    if (sessionsTotal > 0 && done === sessionsTotal) return 'completed';
    return 'in-progress';
  }

  function courseProgress(courseOrId) {
    var course = (courseOrId && typeof courseOrId === 'object')
      ? courseOrId : Store.get('courses', courseOrId);
    var courseId = course ? course.id : courseOrId;
    var sessions = sessionsForCourse(courseId);
    var done = sessions.filter(function (s) { return s.state === 'done'; }).length;
    var total = course ? (Number(course.sessionCount) || sessions.length) : sessions.length;
    // إنجاز الجلسات الفعلية (أساس أعمدة الإدارة والإحصائيات):
    // الإجمالي = كل جلسات الدورة الموجودة، لا العدد المخطط.
    var sessionsTotal = sessions.length;
    var sessionsRemaining = Math.max(0, sessionsTotal - done);
    var pct = sessionsTotal > 0 ? Math.round((done / sessionsTotal) * 100) : 0;
    return {
      done: done,
      total: total,
      generated: sessions.length,
      remaining: Math.max(0, total - done),
      percent: total > 0 ? Math.round((done / total) * 100) : 0,
      sessionsTotal: sessionsTotal,
      sessionsRemaining: sessionsRemaining,
      pct: pct,
      status: completionStatus(course, done, sessionsTotal)
    };
  }

  function periodFor(course) {
    return course && course.periodId ? Store.get('periods', course.periodId) : null;
  }

  function trainerFeeFor(course) {
    var period = periodFor(course);
    try {
      return DB().trainerFeeDue(course, period) || 0;
    } catch (e) { return 0; }
  }

  function budgetFromCache(courseId) {
    var course = Store.get('courses', courseId);
    var allocated = course ? (Number(course.budget) || 0) : 0;
    var expenses = Store.getAll('expenses').filter(function (e) { return e.courseId === courseId; })
      .sort(function (a, b) { return (a.date || '') < (b.date || '') ? -1 : 1; });
    var byCategory = {};
    var totalSpent = 0;
    var feeRecorded = false;
    expenses.forEach(function (e) {
      var amount = Number(e.amount) || 0;
      totalSpent += amount;
      byCategory[e.category] = (byCategory[e.category] || 0) + amount;
      if (e.category === 'أجور المدربين') feeRecorded = true;
    });
    var computedFee = course ? trainerFeeFor(course) : 0;
    var feeDue = feeRecorded ? 0 : computedFee;
    return {
      allocated: allocated,
      byCategory: byCategory,
      totalSpent: totalSpent,
      remaining: allocated - totalSpent,
      expenses: expenses,
      trainerFeeDue: feeDue,
      trainerFeeAlreadyRecorded: feeRecorded,
      totalWithFees: totalSpent + feeDue,
      remainingWithFees: allocated - totalSpent - feeDue,
      percent: allocated > 0 ? Math.round((totalSpent / allocated) * 100) : 0
    };
  }

  function hallsUsedByCourse(courseId) {
    var names = [];
    sessionsForCourse(courseId).forEach(function (s) {
      if (!s.hallId) return;
      var hall = Store.get('halls', s.hallId);
      var name = hall ? hall.name : s.hallId;
      if (names.indexOf(name) === -1) names.push(name);
    });
    return names;
  }

  // ---------- التنقل بين الشاشات ----------
  var Screens = window.Screens || {};
  window.Screens = Screens;

  var currentCleanup = null;

  function renderScreen(name, params, isLiveUpdate) {
    var screen = Screens[name];
    var container = document.getElementById('screen-container');
    var loading = document.getElementById('main-loading');
    if (!screen || !container) return;
    if (typeof currentCleanup === 'function') {
      try { currentCleanup(); } catch (e) {}
      currentCleanup = null;
    }
    if (loading) loading.hidden = true;
    App.currentScreen = name;
    App.currentParams = params || {};
    document.querySelectorAll('.nav-link').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-screen') === name);
    });
    if (!isLiveUpdate) window.scrollTo(0, 0);
    try {
      var result = screen.render(container, App.currentParams);
      if (typeof result === 'function') currentCleanup = result;
    } catch (err) {
      console.error('[تدريب] خطأ في عرض الشاشة:', err);
      container.innerHTML = '<div class="error-view"><div class="error-title">تعذّر عرض هذه الشاشة</div>' +
        '<p>حدث خطأ غير متوقع أثناء تحميل البيانات.</p>' +
        '<button class="btn" type="button" id="screen-retry-btn">إعادة المحاولة</button></div>';
      var retry = document.getElementById('screen-retry-btn');
      if (retry) retry.addEventListener('click', function () { App.refresh(); });
    }
  }

  function showScreen(name, params) {
    if (name === 'admin' && !Auth().isAdmin()) {
      UI.toast('شاشة الإدارة متاحة للمدير فقط', 'error');
      return;
    }
    if (name === 'settings' && !Auth().isAdmin()) {
      UI.toast('إعدادات المنصة متاحة للمدير فقط', 'error');
      return;
    }
    renderScreen(name, params || {}, false);
  }

  // ---------- عرض أقسام الإقلاع ----------
  function showView(view) {
    // view: 'boot' | 'offline' | 'login' | 'setup' | 'app'
    document.getElementById('boot-view').hidden = view !== 'boot';
    document.getElementById('offline-view').hidden = view !== 'offline';
    document.getElementById('screen-login').hidden = view !== 'login';
    document.getElementById('screen-setup').hidden = view !== 'setup';
    document.getElementById('app').hidden = view !== 'app';
    if (view === 'login') document.getElementById('screen-login').classList.add('active');
    else document.getElementById('screen-login').classList.remove('active');
    if (view === 'setup') document.getElementById('screen-setup').classList.add('active');
    else document.getElementById('screen-setup').classList.remove('active');
  }

  function withTimeout(promise, ms, msg) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (!done) { done = true; reject(new Error(msg || 'انتهت مهلة الاتصال')); }
      }, ms);
      promise.then(function (v) {
        if (!done) { done = true; clearTimeout(timer); resolve(v); }
      }, function (e) {
        if (!done) { done = true; clearTimeout(timer); reject(e); }
      });
    });
  }

  // ---------- القفل ----------
  var locked = false;

  function showLock() {
    if (locked) return;
    locked = true;
    Auth().stopAutoLock();
    document.getElementById('lock-error').textContent = '';
    document.getElementById('lock-password').value = '';
    document.getElementById('lock-overlay').hidden = false;
    var input = document.getElementById('lock-password');
    if (input) input.focus();
  }

  function hideLock() {
    locked = false;
    document.getElementById('lock-overlay').hidden = true;
    Auth().startAutoLock(showLock, 15);
  }

  function startSession() {
    Auth().startAutoLock(showLock, 15);
  }

  // ---------- الدخول إلى التطبيق ----------
  var entered = false;

  function enterApp() {
    if (entered) return;
    var profile = Auth().getCurrentProfile();
    if (!profile) return;
    entered = true;
    UI.closeAllModals();
    document.getElementById('topbar-username').textContent = profile.username;
    document.getElementById('topbar-role').textContent = UI.roleLabel(profile.role);
    document.getElementById('nav-admin').hidden = profile.role !== 'admin';
    document.getElementById('nav-settings').hidden = profile.role !== 'admin';
    showView('app');
    document.getElementById('main-loading').hidden = false;
    document.getElementById('screen-container').innerHTML = '';

    var seedP = Promise.resolve();
    if (profile.role === 'admin') {
      seedP = DB().seedDefaults().catch(function (err) {
        console.warn('[تدريب] تعذّرت القيم الافتراضية:', err && err.message);
      });
    }
    seedP.then(function () { return withTimeout(loadAll(), 30000, 'تعذّر تحميل البيانات'); })
      .then(function () {
        subscribeAll();
        startSession();
        showScreen('dashboard');
      })
      .catch(function (err) {
        console.error('[تدريب] تعذّر تحميل البيانات:', err);
        document.getElementById('main-loading').hidden = true;
        document.getElementById('screen-container').innerHTML =
          '<div class="error-view"><div class="error-title">تعذّر الاتصال</div>' +
          '<p>تعذّر تحميل بيانات المنصة — تحقق من الاتصال بالإنترنت ثم أعد المحاولة.</p>' +
          '<button class="btn" type="button" id="data-retry-btn">إعادة المحاولة</button></div>';
        var retry = document.getElementById('data-retry-btn');
        if (retry) retry.addEventListener('click', function () {
          document.getElementById('main-loading').hidden = false;
          document.getElementById('screen-container').innerHTML = '';
          loadAll().then(function () { subscribeAll(); showScreen('dashboard'); }).catch(function () {
            document.getElementById('main-loading').hidden = true;
            UI.toast('تعذّر الاتصال — تحقق من الاتصال بالإنترنت', 'error');
          });
        });
      });
  }

  function exitApp() {
    entered = false;
    locked = false;
    Auth().stopAutoLock();
    unsubscribeAll();
    Store.data = {};
    Store.loaded = false;
    UI.closeAllModals();
    document.getElementById('lock-overlay').hidden = true;
    showView('login');
  }

  // ---------- الإقلاع ----------
  var authListenerAttached = false;

  function attachAuthListener() {
    if (authListenerAttached) return;
    authListenerAttached = true;
    Auth().onAuthChange(function (user, profile, reason) {
      if (user && profile) {
        enterApp();
      } else if (user && !profile) {
        // حساب بلا ملف شخصي، أو عُطّل/حُذف أثناء جلسة نشطة: يُمنع الدخول ويُسجَّل الخروج.
        Auth().signOut().catch(function () {}).finally(function () {
          entered = false;
          showView('login');
          document.getElementById('login-error').textContent =
            reason === 'disabled' ? 'هذا الحساب معطّل — تواصل مع المدير' : 'هذا الحساب غير مفعّل — تواصل مع المدير';
        });
      } else {
        entered = false;
        showView('login');
      }
    });
  }

  function boot() {
    showView('boot');
    withTimeout(Auth().getSetupState(), 20000, 'تعذّر الاتصال')
      .then(function (done) {
        if (!done) {
          showView('setup');
          return;
        }
        attachAuthListener();
      })
      .catch(function (err) {
        console.error('[تدريب] تعذّر الإقلاع:', err);
        showView('offline');
      });
  }

  // ---------- معالجات النماذج ----------
  function bindForms() {
    var loginForm = document.getElementById('login-form');
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var errEl = document.getElementById('login-error');
      errEl.textContent = '';
      var username = document.getElementById('login-username').value.trim();
      var password = document.getElementById('login-password').value;
      var vUser = Auth().validateUsername(username);
      if (!vUser.ok) { errEl.textContent = vUser.error; return; }
      // كلمة المرور تُفحص بالفراغ فقط عند الدخول — قاعدة القوة
      // الجديدة لا تُفرَض بأثر رجعي على الحسابات الحالية.
      if (!password) { errEl.textContent = 'كلمة المرور مطلوبة'; return; }
      var btn = document.getElementById('login-btn');
      UI.setBtnLoading(btn, true, 'جارٍ تسجيل الدخول…');
      Auth().signIn(username, password).then(function () {
        // onAuthChange سيتولى الدخول؛ نعيد الزر تحسباً.
        UI.setBtnLoading(btn, false);
      }).catch(function (err) {
        UI.setBtnLoading(btn, false);
        var msg = err && err.message ? err.message : 'تعذّر تسجيل الدخول';
        if (/network|unavailable|failed to fetch/i.test(msg)) {
          msg = 'تعذّر الاتصال — تحقق من الاتصال بالإنترنت';
        } else if (/auth\/wrong-password|auth\/user-not-found|auth\/invalid-credential|auth\/invalid-email/i.test(msg)) {
          msg = 'اسم المستخدم أو كلمة المرور غير صحيحة';
        }
        errEl.textContent = msg;
      });
    });

    var setupForm = document.getElementById('setup-form');
    setupForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var errEl = document.getElementById('setup-error');
      errEl.textContent = '';
      var username = document.getElementById('setup-username').value.trim();
      var password = document.getElementById('setup-password').value;
      var confirm = document.getElementById('setup-password-confirm').value;
      var vUser = Auth().validateUsername(username);
      if (!vUser.ok) { errEl.textContent = vUser.error; return; }
      var vPass = Auth().validatePassword(password);
      if (!vPass.ok) { errEl.textContent = vPass.error; return; }
      if (password !== confirm) { errEl.textContent = 'كلمتا المرور غير متطابقتين'; return; }
      var btn = document.getElementById('setup-btn');
      UI.setBtnLoading(btn, true, 'جارٍ إنشاء الحساب…');
      Auth().runFirstSetup(username, password).then(function () {
        return DB().seedDefaults().catch(function (err) {
          console.warn('[تدريب] تعذّرت القيم الافتراضية:', err && err.message);
        });
      }).then(function () {
        UI.setBtnLoading(btn, false);
        attachAuthListener();
        enterApp();
      }).catch(function (err) {
        UI.setBtnLoading(btn, false);
        var msg = err && err.message ? err.message : 'تعذّر إنشاء الحساب';
        if (/network|unavailable|failed to fetch/i.test(msg)) {
          msg = 'تعذّر الاتصال — تحقق من الاتصال بالإنترنت';
        } else if (/auth\/email-already-in-use/i.test(msg)) {
          msg = 'اسم المستخدم هذا مستخدم مسبقاً';
        }
        errEl.textContent = msg;
      });
    });

    document.getElementById('offline-retry-btn').addEventListener('click', function () {
      boot();
    });

    document.getElementById('logout-btn').addEventListener('click', function () {
      UI.confirmDialog('تسجيل الخروج', 'هل أنت متأكد من تسجيل الخروج؟', function () {
        Auth().signOut().then(function () { exitApp(); }).catch(function (err) { UI.toastError(err); });
      });
    });

    document.getElementById('lock-btn').addEventListener('click', function () {
      showLock();
    });

    document.getElementById('lock-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var errEl = document.getElementById('lock-error');
      errEl.textContent = '';
      var password = document.getElementById('lock-password').value;
      if (!password) { errEl.textContent = 'أدخل كلمة المرور'; return; }
      var btn = document.getElementById('lock-btn-submit');
      UI.setBtnLoading(btn, true, 'جارٍ التحقق…');
      Auth().reauthenticate(password).then(function () {
        UI.setBtnLoading(btn, false);
        hideLock();
      }).catch(function (err) {
        UI.setBtnLoading(btn, false);
        var msg = err && err.message ? err.message : 'تعذّر فتح القفل';
        if (/auth\/wrong-password|auth\/invalid-credential/i.test(msg)) {
          msg = 'كلمة المرور غير صحيحة';
        } else if (/network|unavailable|failed to fetch/i.test(msg)) {
          msg = 'تعذّر الاتصال — تحقق من الاتصال بالإنترنت';
        }
        errEl.textContent = msg;
      });
    });

    document.getElementById('lock-logout-btn').addEventListener('click', function () {
      Auth().signOut().then(function () { exitApp(); }).catch(function (err) { UI.toastError(err); });
    });

    document.getElementById('main-nav').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-screen]');
      if (!btn) return;
      showScreen(btn.getAttribute('data-screen'));
    });

    window.addEventListener('online', function () {
      UI.toast('عاد الاتصال بالإنترنت', 'success');
      if (entered && !Store.loaded) loadAll().then(function () { renderScreen(App.currentScreen || 'dashboard', App.currentParams, true); });
    });
    window.addEventListener('offline', function () {
      UI.toast('انقطع الاتصال بالإنترنت — تعمل المنصة على البيانات المحفوظة', 'error');
    });
  }

  // ---------- بُناة بيانات التصدير ----------
  function trainerName(trainerId) {
    if (!trainerId) return '';
    var t = Store.get('trainers', trainerId);
    return t ? t.name : '';
  }

  function hallName(hallId) {
    if (!hallId) return '';
    var h = Store.get('halls', hallId);
    return h ? h.name : '';
  }

  function periodLabel(periodId) {
    if (!periodId) return '';
    var p = Store.get('periods', periodId);
    return p ? p.label : '';
  }

  function periodTime(periodId) {
    var p = periodId ? Store.get('periods', periodId) : null;
    return p ? (p.start + ' - ' + p.end) : '';
  }

  function directorateName(id) {
    var d = id ? Store.get('directorates', id) : null;
    return d ? d.name : '';
  }

  function groupName(id) {
    var g = id ? Store.get('groups', id) : null;
    return g ? g.name : '';
  }

  // مستويات الدورات الافتراضية (ثوابت برمجية — كحالات الدورات).
  // حقل level في الدورة يخزّن إما مفتاحاً افتراضياً أو معرّف مستوى
  // مخصص من مجموعة levels. الدورات القديمة بلا مستوى تُعرض
  // «بدون مستوى» — لا ترحيل ولا تغيير على البيانات القديمة.
  var LEVEL_LABELS = {
    none: 'بدون مستوى',
    beginner: 'مستوى مبتدئ',
    intermediate: 'مستوى متوسط',
    advanced: 'مستوى متقدم'
  };

  // اسم مستوى الدورة المعروض: مفتاح افتراضي ← تسميته، معرّف مستوى
  // مخصص ← اسمه من المتجر، وغير ذلك (فارغ أو مجهول أو محذوف) ←
  // «بدون مستوى». لا يرمي أبداً.
  function levelName(level) {
    if (!level) return LEVEL_LABELS.none;
    if (LEVEL_LABELS[level]) return LEVEL_LABELS[level];
    var custom = Store.get('levels', level);
    return custom && custom.name ? custom.name : LEVEL_LABELS.none;
  }

  // ---------- معرّفات السجلات (v1.1) ----------
  // رمز بشري مرئي لكل سجل («المعرّف») يُعرض بجانب الاسم وقابل للتعديل.
  // الحقل `code` اختياري في قاعدة البيانات؛ السجلات القديمة بلا رمز
  // تُعرض برمز مشتق من ترتيب إنشائها دون كتابة (انظر displayCode)،
  // ويُثبَّت الرمز المشتق عند أول حفظ لها من نماذج التعديل.
  var CODE_PREFIXES = {
    halls: { prefix: 'ق-', digits: 2 },
    groups: { prefix: 'مج-', digits: 2 },
    trainees: { prefix: 'م-', digits: 3 },
    directorates: { prefix: 'د-', digits: 2 },
    trainers: { prefix: 'مدر-', digits: 2 },
    courses: { prefix: 'دور-', digits: 2 },
    periods: { prefix: 'ف-', digits: 2 },
    budgetCategories: { prefix: 'ب-', digits: 2 }
  };

  function padNum(n, digits) {
    var s = String(n);
    while (s.length < digits) s = '0' + s;
    return s;
  }

  // زمن الإنشاء بالميللي ثانية؛ يقبل الطابع الزمني من Firestore والرقم
  // والنص، ويعيد 0 عند غيابه أو عدم صلاحيته (لا يرمي أبداً).
  function createdMs(doc) {
    if (!doc || doc.createdAt == null) return 0;
    var v = doc.createdAt;
    if (typeof v === 'number') return v;
    if (typeof v.toMillis === 'function') { try { return v.toMillis(); } catch (e) { return 0; } }
    if (typeof v.seconds === 'number') return v.seconds * 1000;
    if (typeof v === 'string') { var ms = Date.parse(v); return isNaN(ms) ? 0 : ms; }
    return 0;
  }

  // سجلات المجموعة مرتبة حسب الإنشاء (ثم المعرّف الداخلي لثبات الترتيب).
  function sortedForCode(collection) {
    return Store.getAll(collection).slice().sort(function (a, b) {
      var d = createdMs(a) - createdMs(b);
      if (d) return d;
      return String(a.id || '') < String(b.id || '') ? -1 : String(a.id || '') > String(b.id || '') ? 1 : 0;
    });
  }

  // الرمز التالي المتاح للمجموعة: أكبر لاحقة رقمية ظاهرة + 1. يُفحص
  // الرمز المعروض (المخزَّن أو المشتق) لكل سجل، لا المخزَّن وحده، حتى
  // لا يصطدم رمز جديد برمز مشتق لسجل قديم بلا رمز مخزَّن.
  function nextCode(collection) {
    var cfg = CODE_PREFIXES[collection];
    if (!cfg) return '';
    var max = 0;
    Store.getAll(collection).forEach(function (doc) {
      var code = displayCode(doc, collection);
      if (code.indexOf(cfg.prefix) !== 0) return;
      var rest = code.slice(cfg.prefix.length);
      if (!/^\d+$/.test(rest)) return;
      var n = parseInt(rest, 10);
      if (n > max) max = n;
    });
    return cfg.prefix + padNum(max + 1, cfg.digits);
  }

  // الرمز المعروض لسجل: المخزَّن إن وُجد، وإلا مشتق من ترتيب الإنشاء
  // دون كتابة. لا يرمي أبداً ولا يعيد سلسلة فارغة لمجموعة معروفة.
  function displayCode(doc, collection) {
    var cfg = CODE_PREFIXES[collection];
    if (!cfg) return (doc && typeof doc.code === 'string') ? doc.code.trim() : '';
    if (doc && typeof doc.code === 'string' && doc.code.trim()) return doc.code.trim();
    if (!doc || doc.id == null) return cfg.prefix + padNum(1, cfg.digits);
    var list = sortedForCode(collection);
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === doc.id) return cfg.prefix + padNum(i + 1, cfg.digits);
    }
    return cfg.prefix + padNum(1, cfg.digits);
  }

  // فرادة الرمز داخل المجموعة (مقابل المتجر المحمَّل)؛ excludeId يستثني
  // السجل الجاري تعديله حتى لا يُعدَّ رمزه الحالي مكرراً. تُقارَن الرموز
  // المعروضة (المخزَّنة أو المشتقة) حتى لا يصطدم رمز جديد برمز مشتق
  // لسجل قديم بلا رمز مخزَّن.
  function isCodeUnique(collection, code, excludeId) {
    var c = typeof code === 'string' ? code.trim() : '';
    if (!c) return false;
    return !Store.getAll(collection).some(function (doc) {
      return doc.id !== excludeId && displayCode(doc, collection) === c;
    });
  }

  // تسمية الجلسة المشتقة (تُعرض فقط، لا تُخزَّن ولا تُعدَّل):
  // «رمز الدورة / ج N» حيث N ترتيب الجلسة بين جلسات دورتها حسب التاريخ.
  function sessionLabel(session, course) {
    if (!session) return '';
    var list = session.courseId ? sessionsForCourse(session.courseId) : [];
    var n = 1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === session.id) { n = i + 1; break; }
    }
    var c = course || (session.courseId ? Store.get('courses', session.courseId) : null);
    if (!c) return 'ج ' + n;
    return displayCode(c, 'courses') + ' / ج ' + n;
  }

  // متدربو الدورة: إن كانت معيّنة لمجموعة لها أعضاء، فأعضاء المجموعة
  // هم المتدربون (بترتيب المجموعة، مع تجاهل المعرفات بلا سجل)؛ وإلا —
  // بلا مجموعة، أو مجموعة فارغة، أو مجموعة محذوفة — تُستخدم قائمة
  // الدورة نفسها كما قبل تماماً. المجموعة الفارغة لا تمسح الحضور أبداً.
  function courseTrainees(course) {
    if (course && course.groupId) {
      var group = Store.get('groups', course.groupId);
      var memberIds = group ? (group.traineeIds || []) : [];
      if (memberIds.length) {
        return memberIds.map(function (id) { return Store.get('trainees', id); }).filter(Boolean);
      }
    }
    var ids = (course && course.traineeIds) || [];
    return ids.map(function (id) { return Store.get('trainees', id); }).filter(Boolean);
  }

  function buildTodayData(date) {
    var sessions = Store.getAll('sessions').filter(function (s) { return s.date === date; });
    sessions.sort(function (a, b) {
      var pa = Store.get('periods', a.periodId);
      var pb = Store.get('periods', b.periodId);
      return (pa ? pa.order : 99) - (pb ? pb.order : 99);
    });
    return {
      date: date,
      sessions: sessions.map(function (s) {
        var course = Store.get('courses', s.courseId);
        return {
          period: periodLabel(s.periodId),
          time: periodTime(s.periodId),
          course: course ? course.name : '',
          hall: hallName(s.hallId),
          trainer: course ? trainerName(course.trainerId) : ''
        };
      })
    };
  }

  function buildAttendanceData(sessionId) {
    var session = Store.get('sessions', sessionId);
    if (!session) return Promise.reject(new Error('الجلسة غير موجودة'));
    var course = Store.get('courses', session.courseId);
    return DB().getSessionAttendance(sessionId).then(function (attMap) {
      var trainees = course ? courseTrainees(course) : [];
      return {
        courseName: course ? course.name : '',
        sessionDate: session.date,
        periodLabel: periodLabel(session.periodId),
        hallName: hallName(session.hallId),
        trainerName: course ? trainerName(course.trainerId) : '',
        rows: trainees.map(function (t) {
          var rec = attMap[t.id] || {};
          return {
            name: t.name,
            directorate: directorateName(t.directorateId),
            status: rec.status ? UI.ATTENDANCE_LABELS[rec.status] : '',
            note: rec.note || ''
          };
        })
      };
    });
  }

  // بيانات تقرير الحضور والغياب لعدة جلسات من دورة واحدة (تصدير بنطاق).
  function buildAttendanceReportData(courseId, sessionIds) {
    var course = Store.get('courses', courseId);
    if (!course) return Promise.reject(new Error('الدورة غير موجودة'));
    var ids = Array.isArray(sessionIds) ? sessionIds : [];
    var sessions = ids.map(function (id) { return Store.get('sessions', id); }).filter(Boolean)
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    // المجموعة والمديرية المعيّنة (حقول اختيارية جديدة في v1.1؛ الدورات القديمة بلا قيم).
    var groupDoc = course.groupId ? Store.get('groups', course.groupId) : null;
    var groupNameVal = (typeof App !== 'undefined' && typeof App.groupName === 'function')
      ? App.groupName(course.groupId) : (groupDoc ? groupDoc.name : '');
    var groupDirVal = groupDoc ? directorateName(groupDoc.directorateId) : '';
    var trainees = courseTrainees(course);
    var trainer = trainerName(course.trainerId);
    var outSessions = [];
    var chain = Promise.resolve();
    sessions.forEach(function (s) {
      chain = chain.then(function () {
        return DB().getSessionAttendance(s.id).then(function (attMap) {
          outSessions.push({
            sessionDate: s.date,
            periodLabel: periodLabel(s.periodId),
            hallName: hallName(s.hallId),
            trainerName: trainer,
            rows: trainees.map(function (t) {
              var rec = attMap[t.id] || {};
              return {
                name: t.name,
                directorate: directorateName(t.directorateId),
                status: rec.status ? (UI.ATTENDANCE_LABELS[rec.status] || rec.status) : 'بلا تسجيل',
                note: rec.note || ''
              };
            })
          });
        });
      });
    });
    return chain.then(function () {
      return {
        courseName: course.name,
        groupName: groupNameVal,
        directorate: groupDirVal,
        sessions: outSessions
      };
    });
  }

  // بيانات ملف الدورة الكامل (معلومات + جدول + متدربون + حضور + ميزانية).
  function buildCourseFileData(courseId) {
    var course = Store.get('courses', courseId);
    if (!course) return Promise.reject(new Error('الدورة غير موجودة'));
    var sessions = sessionsForCourse(courseId);
    var period = periodFor(course);
    var contract = course.trainerContract || null;
    var hours = 0;
    if (contract && contract.type === 'hourly' && period) {
      var mins = function (t) { var p = String(t).split(':'); return parseInt(p[0], 10) * 60 + parseInt(p[1], 10); };
      hours = (Number(course.sessionCount) || 0) * Math.max(0, (mins(period.end) - mins(period.start)) / 60);
    }
    // المجموعة والمديرية المعيّنة (حقول اختيارية جديدة في v1.1؛ الدورات القديمة بلا قيم).
    var groupDoc = course.groupId ? Store.get('groups', course.groupId) : null;
    var groupNameVal = (typeof App !== 'undefined' && typeof App.groupName === 'function')
      ? App.groupName(course.groupId) : (groupDoc ? groupDoc.name : '');
    var groupDirVal = groupDoc ? directorateName(groupDoc.directorateId) : '';
    var groupLabel = groupNameVal ? (groupDirVal ? groupNameVal + ' — ' + groupDirVal : groupNameVal) : '';
    var info = {
      name: course.name,
      code: displayCode(course, 'courses'),
      level: levelName(course.level),
      trainer: trainerName(course.trainerId),
      group: groupLabel,
      directorate: directorateName(course.directorateId) || '',
      trainerContract: contract ? {
        type: contract.type,
        amount: contract.amount,
        rate: contract.rate,
        hours: hours
      } : null,
      days: UI.daysLabel(course.days),
      period: period ? period.label + ' (' + period.start + ' - ' + period.end + ')' : '',
      startDate: course.startDate || (sessions.length ? sessions[0].date : ''),
      sessionCount: course.sessionCount,
      budget: course.budget,
      status: UI.COURSE_STATUS_LABELS[course.status] || course.status,
      directorates: (course.directorateIds || []).map(directorateName).filter(Boolean)
    };
    var schedule = sessions.map(function (s, i) {
      return {
        n: i + 1,
        date: s.date,
        day: UI.fmtWeekday(s.date),
        period: periodLabel(s.periodId),
        hall: hallName(s.hallId),
        state: UI.SESSION_STATE_LABELS[s.state] || s.state,
        note: s.note || ''
      };
    });
    var trainees = courseTrainees(course).map(function (t) {
      return {
        name: t.name,
        directorate: directorateName(t.directorateId),
        phone: t.phone || '',
        status: t.status ? UI.TRAINEE_STATUS_LABELS[t.status] : ''
      };
    });
    var budget = budgetFromCache(courseId);
    var budgetData = {
      allocated: budget.allocated,
      byCategory: budget.byCategory,
      totalSpent: budget.totalSpent,
      remaining: budget.remaining,
      trainerFeeDue: budget.trainerFeeDue,
      expenses: budget.expenses.map(function (e) {
        return { date: e.date, category: e.category, description: e.description, amount: e.amount };
      })
    };
    // حضور كل الجلسات (بالتسلسل لتجنب إغراق الطلبات).
    var attendance = [];
    var chain = Promise.resolve();
    sessions.forEach(function (s) {
      chain = chain.then(function () {
        return DB().getSessionAttendance(s.id).then(function (attMap) {
          Object.keys(attMap).forEach(function (traineeId) {
            var rec = attMap[traineeId];
            var t = Store.get('trainees', traineeId);
            attendance.push({
              sessionDate: s.date,
              traineeName: t ? t.name : traineeId,
              status: UI.ATTENDANCE_LABELS[rec.status] || rec.status,
              note: rec.note || ''
            });
          });
        });
      });
    });
    return chain.then(function () {
      return { info: info, schedule: schedule, trainees: trainees, attendance: attendance, budget: budgetData };
    });
  }

  function weekDays(weekStartDate) {
    // أيام الأحد–الخميس من أسبوع يبدأ الأحد.
    var start = UI.parseDateStr(weekStartDate);
    var out = [];
    for (var i = 0; i < 5; i++) {
      var d = new Date(start.getTime());
      d.setDate(d.getDate() + i);
      out.push({ date: UI.dateToStr(d), label: UI.WEEKDAYS[d.getDay()] + ' ' + d.getDate() });
    }
    return out;
  }

  function buildWeekData(weekStartDate) {
    var periods = Store.getAll('periods').slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var days = weekDays(weekStartDate);
    var cells = {};
    periods.forEach(function (p, pi) {
      days.forEach(function (day, di) {
        var list = Store.getAll('sessions').filter(function (s) {
          return s.date === day.date && s.periodId === p.id && s.state !== 'cancelled' && s.state !== 'holiday';
        }).map(function (s) {
          var course = Store.get('courses', s.courseId);
          return { kind: 'session', course: course ? course.name : '', hall: hallName(s.hallId) };
        });
        // الاجتماعات العارضة المجدولة تشغل قاعاتها في الرزنامة أيضاً؛
        // الملغاة مستثناة (تحرّر القاعة). التصدير يقرأ course/hall فقط.
        Store.getAll('meetings').filter(function (m) {
          return m.date === day.date && m.periodId === p.id && m.status !== 'cancelled';
        }).forEach(function (m) {
          list.push({ kind: 'meeting', course: 'اجتماع: ' + (m.title || ''), hall: hallName(m.hallId) });
        });
        cells[pi + '|' + di] = list;
      });
    });
    return {
      periods: periods.map(function (p) { return { label: p.label, time: p.start + ' - ' + p.end }; }),
      days: days,
      cells: cells
    };
  }

  // ---------- بيانات اليوم والنطاق المخصص (v1.1) ----------
  // يوم واحد بفلاتر: الجلسات تطابق كل فلاتر الدورة/القاعة/المدرب؛
  // الاجتماعات تطابق فلتر القاعة فقط (بلا دورة أو مدرب)، ففلتر
  // الدورة أو المدرب يخفيها. شكل مدخلات الاجتماعات يطابق بُناة
  // الأسبوع/الشهر ({kind:'meeting', course:'اجتماع: …', hall, period}).
  function buildCalendarDay(dateStr, filters) {
    var f = filters || {};
    var periods = Store.getAll('periods').slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var orderOf = {};
    periods.forEach(function (p, i) { orderOf[p.id] = i; });
    var entries = [];
    Store.getAll('sessions').filter(function (s) { return s.date === dateStr; }).forEach(function (s) {
      var course = Store.get('courses', s.courseId);
      if (f.courseId && s.courseId !== f.courseId) return;
      if (f.hallId && s.hallId !== f.hallId) return;
      if (f.trainerId && (!course || course.trainerId !== f.trainerId)) return;
      entries.push({
        kind: 'session', id: s.id, courseId: s.courseId,
        course: course ? course.name : '',
        trainerId: course ? (course.trainerId || null) : null,
        trainer: course ? trainerName(course.trainerId) : '',
        hallId: s.hallId || null, hall: hallName(s.hallId),
        periodId: s.periodId, period: periodLabel(s.periodId), time: periodTime(s.periodId),
        state: s.state, stateLabel: UI.SESSION_STATE_LABELS[s.state] || s.state || ''
      });
    });
    // الاجتماعات العارضة المجدولة (الملغاة مستثناة — تحرّر القاعة).
    (Store.getAll('meetings') || []).filter(function (m) {
      return m.date === dateStr && m.status !== 'cancelled';
    }).forEach(function (m) {
      if (f.courseId || f.trainerId) return;
      if (f.hallId && m.hallId !== f.hallId) return;
      entries.push({
        kind: 'meeting', id: m.id, title: m.title || '',
        course: 'اجتماع: ' + (m.title || ''),
        hallId: m.hallId || null, hall: hallName(m.hallId),
        periodId: m.periodId, period: periodLabel(m.periodId), time: periodTime(m.periodId),
        date: dateStr, status: m.status || 'scheduled'
      });
    });
    entries.sort(function (a, b) {
      var oa = orderOf[a.periodId] != null ? orderOf[a.periodId] : 99;
      var ob = orderOf[b.periodId] != null ? orderOf[b.periodId] : 99;
      if (oa !== ob) return oa - ob;
      return String(a.course || '').localeCompare(String(b.course || ''), 'ar');
    });
    return { date: dateStr, sessions: entries };
  }

  function buildDayData(date, filters) {
    var d = UI.parseDateStr(date) || new Date();
    var dateStr = UI.dateToStr(d);
    return {
      date: dateStr,
      label: UI.fmtDateFull(dateStr),
      days: [buildCalendarDay(dateStr, filters)]
    };
  }

  function buildRangeData(fromDate, toDate, filters) {
    var from = UI.parseDateStr(fromDate) || new Date();
    var to = UI.parseDateStr(toDate) || new Date(from.getTime());
    if (to < from) { var t = from; from = to; to = t; }
    // سقف النطاق 93 يوماً حتى لا تُبنى قوائم ضخمة من نطاق مفتوح.
    var maxTo = new Date(from.getTime());
    maxTo.setDate(maxTo.getDate() + 92);
    if (to > maxTo) to = maxTo;
    var days = [];
    for (var d = new Date(from.getTime()); d <= to; d.setDate(d.getDate() + 1)) {
      days.push(buildCalendarDay(UI.dateToStr(d), filters));
    }
    return { from: UI.dateToStr(from), to: UI.dateToStr(to), days: days };
  }

  function buildMonthData(year, monthIndex) {
    var weeks = [];
    var first = new Date(year, monthIndex, 1);
    var startOffset = first.getDay(); // 0 = الأحد
    var daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    var currentWeek = [];
    for (var i = 0; i < startOffset; i++) currentWeek.push(null);
    for (var d = 1; d <= daysInMonth; d++) {
      var dateStr = UI.dateToStr(new Date(year, monthIndex, d));
      var sessions = Store.getAll('sessions').filter(function (s) { return s.date === dateStr; })
        .map(function (s) {
          var course = Store.get('courses', s.courseId);
          return { kind: 'session', course: course ? course.name : '', period: periodLabel(s.periodId) };
        });
      // الاجتماعات العارضة المجدولة في هذا اليوم (الملغاة مستثناة).
      Store.getAll('meetings').filter(function (m) {
        return m.date === dateStr && m.status !== 'cancelled';
      }).forEach(function (m) {
        sessions.push({ kind: 'meeting', course: 'اجتماع: ' + (m.title || ''), period: periodLabel(m.periodId) });
      });
      currentWeek.push({ dayNumber: d, date: dateStr, sessions: sessions });
      if (currentWeek.length === 7) { weeks.push(currentWeek); currentWeek = []; }
    }
    if (currentWeek.length) {
      while (currentWeek.length < 7) currentWeek.push(null);
      weeks.push(currentWeek);
    }
    return { monthLabel: UI.fmtMonthYear(year, monthIndex), weeks: weeks };
  }

  function buildCoursesListData(filter) {
    var courses = Store.getAll('courses');
    if (filter && filter !== 'all') {
      // مرشح حالة الإنجاز المشتقة (كما في قائمة الدورات) — ويُقبل
      // أيضاً مرشح الحالة المخزّنة مباشرةً لتوافق أي مستدعٍ قديم.
      courses = courses.filter(function (c) {
        return courseProgress(c).status === filter || c.status === filter;
      });
    }
    return courses.map(function (c) {
      var prog = courseProgress(c.id);
      var period = periodFor(c);
      return {
        name: c.name,
        trainer: trainerName(c.trainerId),
        days: UI.daysLabel(c.days),
        period: period ? period.label : '',
        sessions: c.sessionCount,
        done: prog.done,
        status: UI.COURSE_STATUS_LABELS[c.status] || c.status,
        trainees: courseTrainees(c).length
      };
    });
  }

  // ---------- إحصائيات الدورات (إدارة الدورات v1.1) ----------
  // صف إحصائي لدورة واحدة: حضورها يُقرأ جلسةً بعد جلسة بالتسلسل
  // (كما في buildCourseFileData). تُرجع {row, present, recorded}.
  // ملاحظة تسمية: الصف يحمل «المتبقية» مرتين بمعنيين مختلفين —
  // remaining = الجلسات المتبقية، budgetRemaining = المتبقي من الميزانية.
  function courseStatsRow(course) {
    var prog = courseProgress(course);
    var sessions = sessionsForCourse(course.id);
    var budget = budgetFromCache(course.id);
    var startDate = course.startDate || (sessions.length ? sessions[0].date : '');
    var counts = { present: 0, recorded: 0 };
    var chain = Promise.resolve();
    sessions.forEach(function (s) {
      chain = chain.then(function () {
        return DB().getSessionAttendance(s.id).then(function (attMap) {
          Object.keys(attMap).forEach(function (tid) {
            var st = attMap[tid].status;
            if (st === 'present' || st === 'absent' || st === 'excused') {
              counts.recorded++;
              if (st === 'present') counts.present++;
            }
          });
        }).catch(function () {});
      });
    });
    return chain.then(function () {
      var rate = counts.recorded ? Math.round((counts.present / counts.recorded) * 100) : 0;
      return {
        row: {
          name: course.name || '',
          code: displayCode(course, 'courses'),
          level: levelName(course.level),
          group: groupName(course.groupId) || '',
          trainer: trainerName(course.trainerId) || '',
          directorate: directorateName(course.directorateId) || '',
          startDate: startDate,
          total: prog.sessionsTotal,
          done: prog.done,
          remaining: prog.sessionsRemaining,
          pct: prog.pct,
          trainees: courseTrainees(course).length,
          attendanceRate: rate,
          budget: Number(course.budget) || 0,
          spent: budget.totalSpent,
          budgetRemaining: budget.remaining
        },
        present: counts.present,
        recorded: counts.recorded
      };
    });
  }

  // بيانات إحصائيات كل الدورات + ملخص عام — تُرجع Promise
  // (قراءات الحضور غير متزامنة). الشكل:
  // {courses: [...صفوف], summary: {courses, completed, inProgress,
  // cancelled, paused, sessionsTotal, sessionsDone, overallPct,
  // traineesTotal, overallAttendanceRate, budgetTotal, spentTotal,
  // remainingTotal}}
  function buildCoursesStatsData() {
    var courses = Store.getAll('courses').slice().sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
    });
    var rows = [];
    var summary = {
      courses: courses.length, completed: 0, inProgress: 0, cancelled: 0, paused: 0,
      sessionsTotal: 0, sessionsDone: 0, overallPct: 0, traineesTotal: 0,
      overallAttendanceRate: 0, budgetTotal: 0, spentTotal: 0, remainingTotal: 0
    };
    var presentTotal = 0, recordedTotal = 0;
    var chain = Promise.resolve();
    courses.forEach(function (c) {
      chain = chain.then(function () {
        return courseStatsRow(c).then(function (res) {
          rows.push(res.row);
          presentTotal += res.present;
          recordedTotal += res.recorded;
          var st = courseProgress(c).status;
          if (st === 'completed') summary.completed++;
          else if (st === 'cancelled') summary.cancelled++;
          else if (st === 'paused') summary.paused++;
          else summary.inProgress++;
          summary.sessionsTotal += res.row.total;
          summary.sessionsDone += res.row.done;
          summary.traineesTotal += res.row.trainees;
          summary.budgetTotal += res.row.budget;
          summary.spentTotal += res.row.spent;
          summary.remainingTotal += res.row.budgetRemaining;
        });
      });
    });
    return chain.then(function () {
      summary.overallPct = summary.sessionsTotal
        ? Math.round((summary.sessionsDone / summary.sessionsTotal) * 100) : 0;
      summary.overallAttendanceRate = recordedTotal
        ? Math.round((presentTotal / recordedTotal) * 100) : 0;
      return { courses: rows, summary: summary };
    });
  }

  function buildDirectoryData() {
    return {
      trainers: Store.getAll('trainers').map(function (t) {
        return { name: t.name, specialty: t.specialty || '', phone: t.phone || '', note: t.notes || '' };
      }),
      halls: Store.getAll('halls').map(function (h) {
        return { name: h.name, capacity: h.capacity, location: '', note: h.notes || '' };
      }),
      directorates: Store.getAll('directorates').map(function (d) {
        return { name: d.name, note: d.notes || '' };
      }),
      groups: Store.getAll('groups').map(function (g) {
        return {
          name: g.name,
          directorate: directorateName(g.directorateId),
          courses: Store.getAll('courses').filter(function (c) { return c.groupId === g.id; }).length,
          note: g.notes || ''
        };
      }),
      trainees: Store.getAll('trainees').map(function (t) {
        return {
          name: t.name,
          directorate: directorateName(t.directorateId),
          phone: t.phone || '',
          status: t.status ? UI.TRAINEE_STATUS_LABELS[t.status] : ''
        };
      })
    };
  }

  function buildBudgetData(courseId) {
    var course = Store.get('courses', courseId);
    var budget = budgetFromCache(courseId);
    return {
      courseName: course ? course.name : '',
      allocated: budget.allocated,
      totalSpent: budget.totalSpent,
      remaining: budget.remaining,
      byCategory: budget.byCategory,
      trainerFeeDue: budget.trainerFeeDue,
      expenses: budget.expenses.map(function (e) {
        return { date: e.date, category: e.category, description: e.description, details: '', amount: e.amount };
      })
    };
  }

  // حدود أسبوع يبدأ الأحد وينتهي السبت (YYYY-MM-DD).
  function weekBounds() {
    var now = new Date();
    var start = new Date(now.getTime());
    start.setDate(start.getDate() - start.getDay());
    var end = new Date(start.getTime());
    end.setDate(end.getDate() + 6);
    return { start: UI.dateToStr(start), end: UI.dateToStr(end) };
  }

  // أعداد حضور الأسبوع الحالي (موجود/غائب/معتذر) — غير متزامن.
  function weekAttendanceCounts() {
    var bounds = weekBounds();
    var weekSessions = Store.getAll('sessions').filter(function (s) {
      return s.date >= bounds.start && s.date <= bounds.end;
    });
    var counts = { present: 0, absent: 0, excused: 0, total: 0 };
    var chain = Promise.resolve();
    weekSessions.forEach(function (s) {
      chain = chain.then(function () {
        return DB().getSessionAttendance(s.id).then(function (map) {
          Object.keys(map).forEach(function (k) {
            var st = map[k].status;
            if (counts[st] != null) counts[st]++;
          });
        }).catch(function () {});
      });
    });
    return chain.then(function () {
      counts.total = counts.present + counts.absent + counts.excused;
      return counts;
    });
  }

  // بيانات ملخص المنصة — بالشكل الذي يتوقعه TadreebExport.exportSummary:
  // { totals, courses:[{name, trainer, progress, done, total, budget, spent, remaining, status}],
  //   attendanceWeek:{present, absent, excused, total} }. تُرجع Promise.
  function buildSummaryData() {
    var courses = Store.getAll('courses');
    var sessions = Store.getAll('sessions');
    var totalBudget = 0;
    var totalSpent = 0;
    courses.forEach(function (c) { totalBudget += Number(c.budget) || 0; });
    Store.getAll('expenses').forEach(function (e) { totalSpent += Number(e.amount) || 0; });
    var courseRows = courses.map(function (c) {
      var prog = courseProgress(c.id);
      var budget = budgetFromCache(c.id);
      return {
        name: c.name,
        trainer: trainerName(c.trainerId),
        progress: prog.percent,
        done: prog.done,
        total: prog.total,
        budget: Number(c.budget) || 0,
        spent: budget.totalSpent,
        remaining: budget.remaining,
        status: UI.COURSE_STATUS_LABELS[c.status] || c.status
      };
    });
    return weekAttendanceCounts().then(function (aw) {
      var rate = aw.total ? Math.round((aw.present / aw.total) * 100) : 0;
      return {
        totals: {
          courses: courses.length,
          activeCourses: courses.filter(function (c) { return c.status === 'active'; }).length,
          trainees: Store.getAll('trainees').length,
          trainers: Store.getAll('trainers').length,
          halls: Store.getAll('halls').length,
          sessionsDone: sessions.filter(function (s) { return s.state === 'done'; }).length,
          sessionsScheduled: sessions.filter(function (s) { return s.state === 'scheduled'; }).length,
          sessionsCancelled: sessions.filter(function (s) { return s.state === 'cancelled'; }).length,
          attendanceRate: rate,
          totalBudget: totalBudget,
          totalSpent: totalSpent
        },
        courses: courseRows,
        attendanceWeek: aw
      };
    });
  }

  // بيانات النسخة الاحتياطية — صفوف جاهزة للعرض (أسماء لا معرّفات،
  // حالات بالعربية) بالشكل الذي يتوقعه TadreebExport.exportBackup.
  // تتضمن المستخدمين (اسم + دور فقط — أبداً كلمات مرور) وسجل التدقيق.
  // تُرجع Promise.
  function buildBackupData() {
    var courses = Store.getAll('courses').map(function (c) {
      return {
        name: c.name,
        trainer: trainerName(c.trainerId),
        days: UI.daysLabel(c.days),
        period: periodLabel(c.periodId),
        sessionCount: c.sessionCount,
        status: UI.COURSE_STATUS_LABELS[c.status] || c.status,
        budget: c.budget,
        notes: ''
      };
    });
    var sessions = Store.getAll('sessions').map(function (s) {
      var course = Store.get('courses', s.courseId);
      return {
        course: course ? course.name : '',
        date: s.date,
        day: UI.fmtWeekday(s.date),
        period: periodLabel(s.periodId),
        hall: hallName(s.hallId),
        trainer: course ? trainerName(course.trainerId) : '',
        state: UI.SESSION_STATE_LABELS[s.state] || s.state,
        note: s.note || ''
      };
    });
    var trainees = Store.getAll('trainees').map(function (t) {
      // يبحث في القائمة الفعلية (أعضاء المجموعة إن وُجدت — انظر courseTrainees).
      var course = Store.getAll('courses').filter(function (c) {
        return courseTrainees(c).some(function (x) { return x.id === t.id; });
      })[0];
      return {
        name: t.name,
        directorate: directorateName(t.directorateId),
        phone: t.phone || '',
        course: course ? course.name : '',
        status: t.status ? UI.TRAINEE_STATUS_LABELS[t.status] : '',
        notes: t.notes || ''
      };
    });
    var trainers = Store.getAll('trainers').map(function (t) {
      return { name: t.name, specialty: t.specialty || '', phone: t.phone || '', note: '' };
    });
    var directorates = Store.getAll('directorates').map(function (d) {
      return { name: d.name, note: '' };
    });
    var groups = Store.getAll('groups').map(function (g) {
      return {
        name: g.name,
        directorate: directorateName(g.directorateId),
        courses: Store.getAll('courses').filter(function (c) { return c.groupId === g.id; }).length,
        note: g.notes || ''
      };
    });
    var halls = Store.getAll('halls').map(function (h) {
      return { name: h.name, capacity: h.capacity, location: '', note: '' };
    });
    var periods = Store.getAll('periods').map(function (p) {
      return { label: p.label, time: p.start + ' - ' + p.end, note: '' };
    });
    var holidays = Store.getAll('holidays').map(function (h) {
      return { date: h.date, name: h.name, note: '' };
    });
    var expenses = Store.getAll('expenses').map(function (e) {
      var course = Store.get('courses', e.courseId);
      return {
        date: e.date,
        course: course ? course.name : '',
        category: e.category,
        description: e.description,
        details: '',
        amount: e.amount
      };
    });

    var usersP = Promise.resolve([]);
    var auditP = Promise.resolve([]);
    try {
      if (window.TadreebAuth && typeof window.TadreebAuth.listUsers === 'function') {
        usersP = window.TadreebAuth.listUsers().catch(function () { return []; });
      }
    } catch (e) { usersP = Promise.resolve([]); }
    try {
      auditP = DB().list('audit').catch(function () { return []; });
    } catch (e) { auditP = Promise.resolve([]); }

    return Promise.all([usersP, auditP]).then(function (results) {
      var users = results[0];
      var audit = results[1];
      audit.sort(function (a, b) { return UI.tsMillis(b.ts) - UI.tsMillis(a.ts); });
      return {
        courses: courses,
        sessions: sessions,
        trainees: trainees,
        trainers: trainers,
        directorates: directorates,
        groups: groups,
        halls: halls,
        periods: periods,
        holidays: holidays,
        expenses: expenses,
        users: users.map(function (u) {
          return { username: u.username, role: UI.roleLabel(u.role) };
        }),
        audit: audit.map(function (a) {
          var ms = UI.tsMillis(a.ts);
          return {
            timestamp: ms ? new Date(ms).toISOString() : '',
            user: a.username || '',
            action: a.action || '',
            details: a.details || ''
          };
        })
      };
    });
  }

  // ---------- الواجهة العامة ----------
  window.App = {
    Store: Store,
    Screens: Screens,
    currentScreen: null,
    currentParams: {},
    showScreen: showScreen,
    renderScreen: renderScreen,
    refresh: function () {
      return loadAll().then(function () {
        if (App.currentScreen) renderScreen(App.currentScreen, App.currentParams, true);
      });
    },
    loadAll: loadAll,
    sessionsForCourse: sessionsForCourse,
    courseProgress: courseProgress,
    periodFor: periodFor,
    trainerFeeFor: trainerFeeFor,
    budgetFromCache: budgetFromCache,
    hallsUsedByCourse: hallsUsedByCourse,
    trainerName: trainerName,
    hallName: hallName,
    periodLabel: periodLabel,
    periodTime: periodTime,
    directorateName: directorateName,
    groupName: groupName,
    LEVEL_LABELS: LEVEL_LABELS,
    levelName: levelName,
    CODE_PREFIXES: CODE_PREFIXES,
    nextCode: nextCode,
    displayCode: displayCode,
    isCodeUnique: isCodeUnique,
    sessionLabel: sessionLabel,
    courseTrainees: courseTrainees,
    weekDays: weekDays,
    buildTodayData: buildTodayData,
    buildAttendanceData: buildAttendanceData,
    buildAttendanceReportData: buildAttendanceReportData,
    buildCourseFileData: buildCourseFileData,
    buildWeekData: buildWeekData,
    buildMonthData: buildMonthData,
    buildDayData: buildDayData,
    buildRangeData: buildRangeData,
    buildCoursesListData: buildCoursesListData,
    buildCoursesStatsData: buildCoursesStatsData,
    buildDirectoryData: buildDirectoryData,
    buildBudgetData: buildBudgetData,
    buildSummaryData: buildSummaryData,
    buildBackupData: buildBackupData,
    lock: showLock,
    applyDisplaySettings: applyDisplaySettings,
    logout: function () {
      Auth().signOut().then(function () { exitApp(); }).catch(function (err) { UI.toastError(err); });
    },
    canWrite: function () { return Auth().canWrite(); },
    isAdmin: function () { return Auth().isAdmin(); },
    getProfile: function () { return Auth().getCurrentProfile(); }
  };

  // تطبيق إعدادات العرض المحلية: كثافة الجداول المدمجة صنف على body.
  // تُستدعى عند الإقلاع وعند تغيير الإعداد من شاشة الإعدادات؛ لا تكسر
  // الإقلاع أبداً (كل قراءة محمية).
  function applyDisplaySettings() {
    try {
      var density = 'comfortable';
      if (window.UI && typeof UI.getSetting === 'function') {
        density = UI.getSetting('tableDensity', 'comfortable');
      }
      if (document.body) document.body.classList.toggle('density-compact', density === 'compact');
    } catch (e) { /* إعدادات العرض اختيارية تماماً */ }
  }

  function init() {
    bindForms();
    applyDisplaySettings();
    boot();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
