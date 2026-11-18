// تدريب — شاشة التنبيهات والتغييرات (v2.3 — W6).
// صفحة قراءة فقط لجميع الأدوار (بما فيها العارض): تغذية بما تغيّر
// في المنصة، مشتقة من سجل التدقيق الموجود (مجموعة audit) — مصدر
// حقيقة واحد، بلا كتابة مكررة وبلا مجموعات جديدة.
// الترتيب: الأحدث أولاً. الفلاتر: النوع + التاريخ (نطاق أو يوم محدد).
// مؤشر «جديد»: عناصر أحدث من آخر زيارة للمستخدم نفسه
// (طابع localStorage لكل مستخدم).
// تنبيه الصلاحيات: قواعد Firestore الحالية تقصر قراءة audit على
// المدير (firestore.rules: allow read: if isAdmin()) — فإن فشلت
// القراءة بصلاحيات، تعرض الشاشة ملاحظة ودّية بدلاً من التعطل.
// يُفتح العرض للجميع بتغيير القاعدة إلى allow read: if hasProfile().
// تُسجَّل في window.Screens.notifications. تعتمد على App و UI و TadreebDB.
(function () {
  'use strict';

  var FEED_LIMIT = 100;
  var LAST_SEEN_PREFIX = 'tadreeb-notif-lastseen-';

  // ---------- تسميات الإجراءات والكيانات (من screens-admin.js) ----------
  var ACTION_LABELS = {
    create: 'إنشاء', update: 'تعديل', delete: 'حذف', login: 'تسجيل دخول',
    login_success: 'تسجيل دخول ناجح', lockout: 'قفل حساب',
    first_setup: 'الإعداد الأولي', user_create: 'إنشاء حساب', user_role: 'تغيير دور',
    user_delete: 'حذف حساب', user_disable: 'تعطيل حساب', user_enable: 'تفعيل حساب',
    user_password_reset: 'إعادة تعيين كلمة مرور', seed: 'قيم افتراضية', schedule_generate: 'توليد جدول',
    session_state: 'تغيير حالة جلسة', session_merge: 'دمج جلسات',
    session_merge_delete: 'حذف بعد دمج', session_split: 'تقسيم جلسة', trainer_attendance: 'حضور مدرب',
    session_postpone: 'تأجيل جلسة', session_holiday: 'جلسة عطلة', session_update: 'تعديل جلسة',
    course_reschedule: 'تغيير تاريخ بدء مجموعة تدريب', course_rename: 'إعادة تسمية دورة', course_delete: 'حذف مجموعة تدريب',
    attendance: 'تسجيل حضور', trainee_status: 'تغيير حالة متدرب',
    note_add: 'إضافة ملاحظة', note_delete: 'حذف ملاحظة',
    meeting_create: 'إنشاء اجتماع عارض', meeting_update: 'تعديل اجتماع عارض',
    meeting_cancel: 'إلغاء اجتماع عارض', meeting_delete: 'حذف اجتماع عارض'
  };

  var ENTITY_LABELS = {
    courses: 'مجموعة تدريب', sessions: 'جلسة', trainees: 'متدرب', trainers: 'مدرب',
    groups: 'مجموعة تدريبية',
    directorates: 'مديرية', halls: 'قاعة', periods: 'فترة', holidays: 'عطلة',
    expenses: 'مصروف', budgetCategories: 'فئة ميزانية', levels: 'مستوى مجموعة تدريب', users: 'حساب',
    notes: 'ملاحظة', audit: 'تدقيق', meta: 'إعداد', meetings: 'اجتماع عارض'
  };

  // ---------- فئات التغذية ----------
  var CATEGORIES = {
    courses: { label: 'مجموعات التدريب', pill: 'pill-navy' },
    sessions: { label: 'الجلسات والمواعيد', pill: 'pill-violet' },
    absence: { label: 'الغياب', pill: 'pill-red' },
    other: { label: 'تغييرات أخرى', pill: 'pill-grey' }
  };

  // إجراءات الحسابات والأمان: تظهر للمدير فقط (دفاع إضافي — حتى
  // بعد فتح قراءة audit للجميع، لا يرى غير المدير أحداث الدخول
  // وإدارة الحسابات وكلمات المرور).
  var SENSITIVE_ACTIONS = {
    login: true, login_success: true, lockout: true, first_setup: true,
    user_create: true, user_role: true, user_delete: true,
    user_disable: true, user_enable: true, user_password_reset: true
  };

  // كشف الغياب من نص التفاصيل: الإنتاج يكتب التسميات العربية
  // (غائب/لم يحضر) من ATTENDANCE_LABELS؛ الكلمات الإنجليزية دفاعية
  // لإدخالات قديمة أو غير عربية.
  var ABSENCE_RE = /غائب|لم يحضر|absent|did not attend/i;

  function actionLabel(action) { return ACTION_LABELS[action] || action || ''; }
  function entityLabel(entity) { return ENTITY_LABELS[entity] || entity || ''; }

  function isAbsenceEntry(e) {
    if (e.action === 'trainee_status') return true;
    if (e.action === 'attendance' || e.action === 'trainer_attendance') {
      return ABSENCE_RE.test(e.details || '');
    }
    return false;
  }

  // إدخالات روتينية لا تستحق التغذية (تبقى في سجل التدقيق الكامل
  // بشاشة الإدارة): تسجيل حضور ليس غياباً (موجود/معتذر/مسح)،
  // وحضور المدرب (الخبر هو الغياب لا الحضور).
  function isRoutine(e) {
    if (e.action === 'attendance') return !ABSENCE_RE.test(e.details || '');
    if (e.action === 'trainer_attendance') return !ABSENCE_RE.test(e.details || '');
    return false;
  }

  function categoryOf(e) {
    if (isAbsenceEntry(e)) return 'absence';
    if (e.entity === 'courses') return 'courses';
    if (e.entity === 'sessions' || e.entity === 'meetings') return 'sessions';
    return 'other';
  }

  // عنوان ودود: نص التفاصيل نفسه (مع نزع بادئة «إنشاء:/تعديل:/حذف:»
  // المكررة مع شارة الإجراء)، وإلا تسمية الإجراء + الكيان.
  function friendlyTitle(e) {
    var d = String(e.details || '').trim();
    var prefix = e.action === 'create' ? 'إنشاء: '
      : e.action === 'update' ? 'تعديل: '
      : e.action === 'delete' ? 'حذف: ' : '';
    if (prefix && d.indexOf(prefix) === 0) d = d.slice(prefix.length).trim();
    if (d) return d;
    var label = actionLabel(e.action);
    var entity = entityLabel(e.entity);
    return entity ? label + ' — ' + entity : label;
  }

  // ---------- آخر زيارة (لكل مستخدم) ----------
  function lastSeenKey() {
    var profile = null;
    try { profile = (window.App && typeof App.getProfile === 'function') ? App.getProfile() : null; } catch (e) { profile = null; }
    var who = (profile && (profile.uid || profile.username)) || 'anon';
    return LAST_SEEN_PREFIX + who;
  }

  function readLastSeen() {
    try {
      var raw = window.localStorage.getItem(lastSeenKey());
      var v = raw ? parseInt(raw, 10) : NaN;
      return isNaN(v) ? null : v;
    } catch (e) { return null; }
  }

  function writeLastSeen(ms) {
    try { window.localStorage.setItem(lastSeenKey(), String(ms)); } catch (e) { /* التخزين غير متاح — يُتجاهل */ }
  }

  // ---------- حالة الشاشة ----------
  var feed = []; // إدخالات التغذية بعد الفرز والتقييد (الأحدث أولاً)
  var feedTotal = 0; // عدد إدخالات التغذية قبل التقييد بـ FEED_LIMIT
  var unreadCount = 0;
  var loadToken = 0;
  var filters = { type: 'all', range: 'all', day: '' };

  function dayStartMs(dateStr) {
    var d = UI.parseDateStr(dateStr);
    return d ? d.getTime() : 0;
  }

  function inDateFilter(e) {
    var ms = UI.tsMillis(e.ts);
    if (filters.day) {
      var start = dayStartMs(filters.day);
      return ms >= start && ms < start + 86400000;
    }
    if (filters.range === 'today') {
      var todayStart = dayStartMs(UI.todayStr());
      return ms >= todayStart && ms < todayStart + 86400000;
    }
    if (filters.range === '7d') {
      return ms >= dayStartMs(UI.todayStr()) - 6 * 86400000;
    }
    if (filters.range === '30d') {
      return ms >= dayStartMs(UI.todayStr()) - 29 * 86400000;
    }
    return true;
  }

  function visibleEntries() {
    return feed.filter(function (e) {
      if (filters.type !== 'all' && e._cat !== filters.type) return false;
      return inDateFilter(e);
    });
  }

  function renderList() {
    var box = document.getElementById('notif-feed');
    if (!box) return;
    var shown = visibleEntries();
    var countEl = document.getElementById('notif-count');
    if (countEl) {
      var txt = 'عرض ' + shown.length + ' من أصل ' + feedTotal + ' تغييراً';
      if (unreadCount > 0) txt += ' · جديد: ' + unreadCount;
      countEl.textContent = txt;
    }
    if (!feed.length) {
      box.innerHTML = UI.emptyState('لا تغييرات بعد', 'ستظهر هنا التغييرات الجديدة فور حدوثها.');
      return;
    }
    if (!shown.length) {
      box.innerHTML = UI.emptyState('لا تغييرات مطابقة', 'جرّب توسيع النطاق الزمني أو تغيير النوع.');
      return;
    }
    var html = '';
    shown.forEach(function (e) {
      var cat = CATEGORIES[e._cat] || CATEGORIES.other;
      var meta = [];
      var entity = entityLabel(e.entity);
      if (entity) meta.push(entity);
      meta.push(actionLabel(e.action));
      if (e.username) meta.push(e.username);
      var when = UI.fmtTimestamp(e.ts);
      if (when) meta.push(when);
      html += '<div class="list-row notif-row' + (e._isNew ? ' is-new' : '') + '"' +
        ' data-notif-id="' + UI.escapeHtml(e.id) + '"' +
        ' data-notif-cat="' + UI.escapeHtml(e._cat) + '"' +
        ' data-notif-ts="' + UI.tsMillis(e.ts) + '">' +
        '<div class="list-row-main"><div class="list-row-title"><strong>' +
        UI.escapeHtml(friendlyTitle(e)) + '</strong>' +
        ' <span class="pill ' + cat.pill + '">' + UI.escapeHtml(cat.label) + '</span>' +
        (e._isNew ? ' <span class="pill notif-new">جديد</span>' : '') +
        '</div><div class="list-row-meta muted">' +
        meta.map(function (m) { return UI.escapeHtml(m); }).join(' · ') +
        '</div></div></div>';
    });
    if (feedTotal > FEED_LIMIT) {
      html += '<div class="muted" style="margin-top:10px">عرض أحدث ' + FEED_LIMIT + ' من ' + feedTotal + ' سجلاً.</div>';
    }
    box.innerHTML = html;
  }

  function loadFeed() {
    var box = document.getElementById('notif-feed');
    if (!box) return;
    var token = ++loadToken;
    box.innerHTML = UI.loadingState('جارٍ تحميل التغييرات…');
    if (!window.TadreebDB || typeof window.TadreebDB.list !== 'function') {
      box.innerHTML = '<div class="muted">تعذّر تحميل التغييرات — طبقة البيانات غير متاحة.</div>';
      return;
    }
    window.TadreebDB.list('audit').then(function (entries) {
      if (token !== loadToken) return; // تحميل أحدث حلّ محله
      var isAdmin = false;
      try { isAdmin = !!(window.App && typeof App.isAdmin === 'function' && App.isAdmin()); } catch (e) { isAdmin = false; }
      entries.sort(function (a, b) { return UI.tsMillis(b.ts) - UI.tsMillis(a.ts); });
      var kept = entries.filter(function (e) {
        if (isRoutine(e)) return false;
        if (!isAdmin && SENSITIVE_ACTIONS[e.action]) return false;
        return true;
      });
      feedTotal = kept.length;
      var lastSeen = readLastSeen();
      var maxTs = 0;
      kept.forEach(function (e) {
        e._cat = categoryOf(e);
        var ms = UI.tsMillis(e.ts);
        if (ms > maxTs) maxTs = ms;
        // الزيارة الأولى: خط أساس بلا شارات «جديد».
        e._isNew = (lastSeen != null) && ms > lastSeen;
      });
      unreadCount = kept.filter(function (e) { return e._isNew; }).length;
      feed = kept.slice(0, FEED_LIMIT);
      // يُحدَّث خط الأساس بعد حساب الجديد — بحد أقصى طابع الآن
      // وأحدث إدخال (تحسّباً لانحراف بسيط بين ساعتي العميل والخادم).
      writeLastSeen(Math.max(Date.now(), maxTs));
      renderList();
    }).catch(function (err) {
      if (token !== loadToken) return;
      var msg = (err && err.message) || '';
      var code = (err && err.code) || '';
      var denied = code === 'permission-denied' || /permission-denied/i.test(msg);
      console.warn('[تدريب] تعذّر تحميل التنبيهات:', msg);
      if (denied) {
        // قواعد Firestore الحالية تقصر قراءة audit على المدير —
        // ملاحظة ودّية بدل التعطل (تُفتح للجميع بتغيير القاعدة).
        box.innerHTML = '<div class="notif-restricted" id="notif-restricted">' +
          '<strong>سجل التغييرات غير متاح لدورك حالياً</strong><br>' +
          'قراءة سجل التدقيق مقتصرة على المدير في قواعد قاعدة البيانات. ' +
          'اطلب من المدير تفعيل عرض التنبيهات لجميع الأدوار.</div>';
      } else {
        box.innerHTML = '<div class="muted">تعذّر تحميل التغييرات — تحقق من الاتصال ثم أعد المحاولة.</div>' +
          '<div style="margin-top:12px"><button class="btn btn-outline btn-sm" type="button" id="notif-retry-btn">إعادة المحاولة</button></div>';
        var retry = document.getElementById('notif-retry-btn');
        if (retry) retry.addEventListener('click', loadFeed);
      }
      var countEl = document.getElementById('notif-count');
      if (countEl) countEl.textContent = '';
    });
  }

  function render(container) {
    var html = '<div class="page-head"><div><h1>التنبيهات والتغييرات</h1>' +
      '<div class="muted">كل ما تغيّر في المنصة — الأحدث أولاً، من سجل التدقيق.</div></div>' +
      '<div class="head-actions"><button class="btn btn-outline btn-sm" type="button" id="notif-refresh-btn">تحديث</button></div></div>' +
      '<div class="card-white"><div class="notif-filters">' +
      '<div class="field"><label for="notif-type-filter">النوع</label>' +
      '<select id="notif-type-filter" aria-label="فلترة حسب النوع">' +
      '<option value="all">كل الأنواع</option>' +
      '<option value="courses">مجموعات التدريب</option>' +
      '<option value="sessions">الجلسات والمواعيد</option>' +
      '<option value="absence">الغياب</option>' +
      '<option value="other">تغييرات أخرى</option>' +
      '</select></div>' +
      '<div class="field"><label for="notif-date-filter">التاريخ</label>' +
      '<select id="notif-date-filter" aria-label="فلترة حسب التاريخ">' +
      '<option value="all">كل التواريخ</option>' +
      '<option value="today">اليوم</option>' +
      '<option value="7d">آخر 7 أيام</option>' +
      '<option value="30d">آخر 30 يوماً</option>' +
      '</select></div>' +
      '<div class="field"><label for="notif-day-filter">يوم محدد</label>' +
      '<input type="date" id="notif-day-filter" aria-label="فلترة حسب يوم محدد">' +
      '<div class="field-hint">عند اختياره يُتجاهل النطاق الزمني.</div></div>' +
      '</div><div class="muted" id="notif-count"></div></div>' +
      '<div class="card-white"><div id="notif-feed">' + UI.loadingState('جارٍ تحميل التغييرات…') + '</div></div>';
    container.innerHTML = html;

    var typeSel = document.getElementById('notif-type-filter');
    var dateSel = document.getElementById('notif-date-filter');
    var dayInput = document.getElementById('notif-day-filter');
    if (typeSel) typeSel.value = filters.type;
    if (dateSel) dateSel.value = filters.range;
    if (dayInput) dayInput.value = filters.day;

    if (typeSel) typeSel.addEventListener('change', function () { filters.type = typeSel.value; renderList(); });
    if (dateSel) dateSel.addEventListener('change', function () { filters.range = dateSel.value; renderList(); });
    if (dayInput) dayInput.addEventListener('change', function () { filters.day = dayInput.value; renderList(); });
    var refreshBtn = document.getElementById('notif-refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', loadFeed);

    loadFeed();
  }

  window.Screens.notifications = { render: render };
})();
