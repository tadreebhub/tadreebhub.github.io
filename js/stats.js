/* تدريب — وحدة الإحصاءات (v2.1 — بند 10)
 * إحصاءات مخصصة لكل قسم: كل قسم يحسب مقاييسه من بياناته هو
 * (لا تفريغ عام واحد)، وكل لوحة إحصاءات قابلة للتخصيص من المستخدم
 * (زر «تخصيص» يختار المقاييس الظاهرة — محفوظة على الجهاز عبر
 * UI.getSetting/setSetting بنفس نمط تفضيلات العرض).
 *
 * تعتمد على App.Store ومساعدات App العامة و TadreebDB عند الحاجة
 * إلى الحضور (غير متزامن)؛ لا تجلب أي بيانات جديدة ولا تغيّر النموذج.
 * كل الدوال دفاعية: عند غياب App تُعيد مقاييس فارغة ولا ترمي أبداً.
 * جميع التسميات بالعربية الفصحى.
 */
(function () {
  'use strict';

  /* ---------- أدوات أساسية ---------- */

  function app() {
    try {
      if (typeof window !== 'undefined' && window.App) return window.App;
    } catch (e) { /* بلا App */ }
    return null;
  }

  function ui() {
    try {
      if (typeof window !== 'undefined' && window.UI) return window.UI;
    } catch (e) { /* بلا UI */ }
    return null;
  }

  function storeAll(collection) {
    var A = app();
    if (!A || !A.Store || typeof A.Store.getAll !== 'function') return [];
    try { return A.Store.getAll(collection) || []; } catch (e) { return []; }
  }

  function storeGet(collection, id) {
    var A = app();
    if (!A || !A.Store || typeof A.Store.get !== 'function' || !id) return null;
    try { return A.Store.get(collection, id) || null; } catch (e) { return null; }
  }

  function db() {
    try {
      if (typeof window !== 'undefined' && window.TadreebDB) return window.TadreebDB;
    } catch (e) { /* بلا DB */ }
    return null;
  }

  function asNum(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  function pct(part, total) {
    total = asNum(total);
    if (!total) return 0;
    return Math.round((asNum(part) / total) * 100);
  }

  function todayStr() {
    var U = ui();
    if (U && typeof U.todayStr === 'function') {
      try { return U.todayStr(); } catch (e) { /* احتياطي أدناه */ }
    }
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  // نطاق الشهر الحالي (YYYY-MM-DD) — الافتراضي لحسابات الإشغال.
  function currentMonthRange() {
    var t = todayStr();
    var parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
    if (!parts) return { from: t, to: t };
    var y = parseInt(parts[1], 10), m = parseInt(parts[2], 10);
    var last = new Date(y, m, 0).getDate();
    var mm = String(m).padStart(2, '0');
    return { from: y + '-' + mm + '-01', to: y + '-' + mm + '-' + String(last).padStart(2, '0') };
  }

  // عدد أيام النطاق (سقف 366 يوماً).
  function daysInRange(from, to) {
    var a = Date.parse(from), b = Date.parse(to);
    if (isNaN(a) || isNaN(b) || b < a) return 1;
    return Math.min(366, Math.floor((b - a) / 86400000) + 1);
  }

  // الجلسة تشغل القاعة: ليست ملغاة ولا عطلة.
  function occupies(session) {
    return session && session.state !== 'cancelled' && session.state !== 'holiday';
  }

  function sessionsInRange(from, to) {
    return storeAll('sessions').filter(function (s) {
      return s.date >= from && s.date <= to;
    });
  }

  function meetingsInRange(from, to) {
    return storeAll('meetings').filter(function (m) {
      return m.date >= from && m.date <= to;
    });
  }

  // مدة الفترة بالدقائق من HH:MM.
  function periodMinutes(p) {
    if (!p || !p.start || !p.end) return 0;
    function mins(t) {
      var parts = String(t).split(':');
      return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
    }
    return Math.max(0, mins(p.end) - mins(p.start));
  }

  function escapeHtml(s) {
    var U = ui();
    if (U && typeof U.escapeHtml === 'function') return U.escapeHtml(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- تعريفات المقاييس لكل قسم ----------
   * format: num = رقم بفواصل، money = مبلغ بعملة ل.س، pct = نسبة مئوية، text = نص. */
  var METRIC_DEFS = {
    dashboard: [
      { id: 'activeCourses', label: 'دورات نشطة', format: 'num' },
      { id: 'todaySessions', label: 'جلسات اليوم', format: 'num' },
      { id: 'weekAttendanceRate', label: 'نسبة الحضور هذا الأسبوع', format: 'pct' },
      { id: 'trainees', label: 'متدرب مسجل', format: 'num' },
      { id: 'trainers', label: 'مدرب', format: 'num' },
      { id: 'halls', label: 'قاعة', format: 'num' },
      { id: 'sessionsDone', label: 'جلسات مكتملة', format: 'num' },
      { id: 'upcomingSessions', label: 'جلسات قادمة', format: 'num' },
      { id: 'totalBudget', label: 'إجمالي الميزانيات', format: 'money' },
      { id: 'totalSpent', label: 'إجمالي المصروف', format: 'money' },
      { id: 'budgetRemaining', label: 'المتبقي من الميزانيات', format: 'money' }
    ],
    courses: [
      { id: 'total', label: 'عدد الدورات', format: 'num' },
      { id: 'active', label: 'جارية', format: 'num' },
      { id: 'completed', label: 'مكتملة', format: 'num' },
      { id: 'cancelled', label: 'ملغاة', format: 'num' },
      { id: 'paused', label: 'متوقفة', format: 'num' },
      { id: 'sessionsTotal', label: 'إجمالي الجلسات', format: 'num' },
      { id: 'sessionsDone', label: 'جلسات مكتملة', format: 'num' },
      { id: 'overallPct', label: 'نسبة الإنجاز الإجمالية', format: 'pct' },
      { id: 'traineesTotal', label: 'إجمالي المتدربين', format: 'num' },
      { id: 'overallAttendanceRate', label: 'نسبة الحضور الإجمالية', format: 'pct' },
      { id: 'budgetTotal', label: 'إجمالي الميزانيات', format: 'money' },
      { id: 'spentTotal', label: 'إجمالي المصروف', format: 'money' },
      { id: 'remainingTotal', label: 'إجمالي المتبقي', format: 'money' }
    ],
    course: [
      { id: 'sessionsTotal', label: 'إجمالي الجلسات', format: 'num' },
      { id: 'done', label: 'جلسات مكتملة', format: 'num' },
      { id: 'remaining', label: 'جلسات متبقية', format: 'num' },
      { id: 'cancelled', label: 'جلسات ملغاة', format: 'num' },
      { id: 'pct', label: 'نسبة الإنجاز', format: 'pct' },
      { id: 'trainees', label: 'عدد المتدربين', format: 'num' },
      { id: 'attendanceRate', label: 'نسبة الحضور', format: 'pct' },
      { id: 'budget', label: 'الميزانية', format: 'money' },
      { id: 'spent', label: 'المصروف', format: 'money' },
      { id: 'budgetRemaining', label: 'المتبقي', format: 'money' },
      { id: 'spentPct', label: 'نسبة الصرف', format: 'pct' },
      { id: 'hallsUsed', label: 'قاعات مستخدمة', format: 'num' },
      { id: 'feeDue', label: 'أجور مدرب مستحقة', format: 'money' }
    ],
    session: [
      { id: 'total', label: 'إجمالي المتدربين', format: 'num' },
      { id: 'present', label: 'موجود', format: 'num' },
      { id: 'absent', label: 'غائب', format: 'num' },
      { id: 'excused', label: 'معتذر', format: 'num' },
      { id: 'unrecorded', label: 'بلا تسجيل', format: 'num' },
      { id: 'presentRate', label: 'نسبة الحضور', format: 'pct' },
      { id: 'recordedRate', label: 'نسبة التسجيل', format: 'pct' },
      { id: 'trainer', label: 'حضور المدرب', format: 'text' }
    ],
    calendar: [
      { id: 'sessions', label: 'جلسات في النطاق', format: 'num' },
      { id: 'done', label: 'مكتملة', format: 'num' },
      { id: 'scheduled', label: 'مجدولة', format: 'num' },
      { id: 'cancelled', label: 'ملغاة', format: 'num' },
      { id: 'trainerAbsent', label: 'غياب مدرب', format: 'num' },
      { id: 'holiday', label: 'عطلة', format: 'num' },
      { id: 'meetings', label: 'اجتماعات عارضة', format: 'num' },
      { id: 'occupancy', label: 'نسبة إشغال القاعات', format: 'pct' },
      { id: 'busiestHall', label: 'القاعة الأكثر استخداماً', format: 'text' },
      { id: 'busiestPeriod', label: 'الفترة الأكثر استخداماً', format: 'text' }
    ],
    directory: [
      { id: 'trainers', label: 'مدربون', format: 'num' },
      { id: 'trainees', label: 'متدربون', format: 'num' },
      { id: 'directorates', label: 'مديريات', format: 'num' },
      { id: 'groups', label: 'مجموعات تدريبية', format: 'num' },
      { id: 'halls', label: 'قاعات', format: 'num' },
      { id: 'trainersWithoutCourses', label: 'مدربون بلا دورات', format: 'num' },
      { id: 'groupsWithoutCourses', label: 'مجموعات بلا دورات', format: 'num' },
      { id: 'traineesWithoutCourse', label: 'متدربون بلا دورة', format: 'num' }
    ],
    trainees: [
      { id: 'total', label: 'إجمالي المتدربين', format: 'num' },
      { id: 'inCourses', label: 'مسجلون في دورات', format: 'num' },
      { id: 'withoutCourse', label: 'بلا دورة', format: 'num' },
      { id: 'topDirectorate', label: 'المديرية الأكثر متدربين', format: 'text' }
    ],
    trainers: [
      { id: 'total', label: 'عدد المدربين', format: 'num' },
      { id: 'withCourses', label: 'مدربون لهم دورات', format: 'num' },
      { id: 'withoutCourses', label: 'مدربون بلا دورات', format: 'num' },
      { id: 'totalSessions', label: 'إجمالي الجلسات', format: 'num' },
      { id: 'totalHours', label: 'إجمالي الساعات', format: 'num' },
      { id: 'totalFeesDue', label: 'إجمالي الأجور المستحقة', format: 'money' }
    ],
    trainer: [
      { id: 'courses', label: 'عدد الدورات', format: 'num' },
      { id: 'sessions', label: 'عدد الجلسات', format: 'num' },
      { id: 'hours', label: 'إجمالي الساعات', format: 'num' },
      { id: 'trainees', label: 'عدد المتدربين', format: 'num' },
      { id: 'feeDue', label: 'أجور مستحقة', format: 'money' }
    ],
    directorates: [
      { id: 'total', label: 'عدد المديريات', format: 'num' },
      { id: 'trainees', label: 'إجمالي المتدربين', format: 'num' },
      { id: 'groups', label: 'إجمالي المجموعات', format: 'num' },
      { id: 'courses', label: 'إجمالي الدورات', format: 'num' },
      { id: 'topDirectorate', label: 'المديرية الأكثر متدربين', format: 'text' }
    ],
    directorate: [
      { id: 'trainees', label: 'عدد المتدربين', format: 'num' },
      { id: 'groups', label: 'عدد المجموعات', format: 'num' },
      { id: 'courses', label: 'عدد الدورات', format: 'num' },
      { id: 'sessions', label: 'عدد الجلسات', format: 'num' }
    ],
    groups: [
      { id: 'total', label: 'عدد المجموعات', format: 'num' },
      { id: 'members', label: 'إجمالي الأعضاء', format: 'num' },
      { id: 'courses', label: 'إجمالي الدورات', format: 'num' },
      { id: 'emptyGroups', label: 'مجموعات بلا أعضاء', format: 'num' },
      { id: 'groupsWithoutCourses', label: 'مجموعات بلا دورات', format: 'num' }
    ],
    group: [
      { id: 'members', label: 'عدد الأعضاء', format: 'num' },
      { id: 'courses', label: 'عدد الدورات', format: 'num' },
      { id: 'sessions', label: 'عدد الجلسات', format: 'num' },
      { id: 'attendanceRate', label: 'نسبة الحضور', format: 'pct' }
    ],
    halls: [
      { id: 'total', label: 'عدد القاعات', format: 'num' },
      { id: 'capacity', label: 'إجمالي السعة', format: 'num' },
      { id: 'sessions', label: 'إجمالي الجلسات', format: 'num' },
      { id: 'meetings', label: 'إجمالي الاجتماعات', format: 'num' },
      { id: 'occupancy', label: 'نسبة الإشغال', format: 'pct' },
      { id: 'busiestHall', label: 'القاعة الأكثر استخداماً', format: 'text' }
    ],
    hall: [
      { id: 'sessions', label: 'عدد الجلسات', format: 'num' },
      { id: 'meetings', label: 'عدد الاجتماعات', format: 'num' },
      { id: 'occupancy', label: 'نسبة الإشغال', format: 'pct' },
      { id: 'capacity', label: 'السعة', format: 'num' },
      { id: 'courses', label: 'عدد الدورات', format: 'num' }
    ],
    periods: [
      { id: 'total', label: 'عدد الفترات', format: 'num' },
      { id: 'sessions', label: 'إجمالي الجلسات', format: 'num' },
      { id: 'busiestPeriod', label: 'الفترة الأكثر استخداماً', format: 'text' },
      { id: 'totalHours', label: 'مجموع ساعات الفترات', format: 'num' }
    ],
    levels: [
      { id: 'total', label: 'عدد المستويات', format: 'num' },
      { id: 'courses', label: 'إجمالي الدورات', format: 'num' },
      { id: 'withoutLevel', label: 'دورات بلا مستوى', format: 'num' },
      { id: 'topLevel', label: 'المستوى الأكثر دورات', format: 'text' }
    ],
    holidays: [
      { id: 'total', label: 'عدد العطل', format: 'num' },
      { id: 'upcoming', label: 'عطل قادمة', format: 'num' },
      { id: 'past', label: 'عطل سابقة', format: 'num' },
      { id: 'holidaySessions', label: 'جلسات مسجلة عطلة', format: 'num' }
    ],
    expenses: [
      { id: 'totalSpent', label: 'إجمالي المصروف', format: 'money' },
      { id: 'count', label: 'عدد المصاريف', format: 'num' },
      { id: 'avgExpense', label: 'متوسط المصروف', format: 'money' },
      { id: 'categoriesCount', label: 'عدد الفئات المستخدمة', format: 'num' },
      { id: 'topCategory', label: 'الفئة الأعلى صرفاً', format: 'text' },
      { id: 'topCourse', label: 'الدورة الأعلى صرفاً', format: 'text' }
    ],
    budget: [
      { id: 'allocated', label: 'الميزانية المخصصة', format: 'money' },
      { id: 'spent', label: 'إجمالي المصروف', format: 'money' },
      { id: 'remaining', label: 'المتبقي', format: 'money' },
      { id: 'spentPct', label: 'نسبة الصرف', format: 'pct' },
      { id: 'expensesCount', label: 'عدد المصاريف', format: 'num' },
      { id: 'feeDue', label: 'أجور مدرب مستحقة', format: 'money' },
      { id: 'feeRecorded', label: 'أجور مدرب مسجلة', format: 'money' },
      { id: 'topCategory', label: 'الفئة الأعلى صرفاً', format: 'text' }
    ],
    meetings: [
      { id: 'total', label: 'عدد الاجتماعات', format: 'num' },
      { id: 'scheduled', label: 'مجدولة', format: 'num' },
      { id: 'cancelled', label: 'ملغاة', format: 'num' },
      { id: 'upcoming', label: 'قادمة', format: 'num' },
      { id: 'topHall', label: 'القاعة الأكثر اجتماعات', format: 'text' }
    ],
    users: [
      { id: 'total', label: 'عدد المستخدمين', format: 'num' },
      { id: 'admins', label: 'مدراء', format: 'num' },
      { id: 'editors', label: 'محررون', format: 'num' },
      { id: 'viewers', label: 'عارضون', format: 'num' },
      { id: 'disabled', label: 'حسابات معطلة', format: 'num' }
    ],
    attendance: [
      { id: 'present', label: 'موجود', format: 'num' },
      { id: 'absent', label: 'غائب', format: 'num' },
      { id: 'excused', label: 'معتذر', format: 'num' },
      { id: 'unrecorded', label: 'بلا تسجيل', format: 'num' },
      { id: 'total', label: 'إجمالي السجلات', format: 'num' },
      { id: 'rate', label: 'نسبة الحضور', format: 'pct' }
    ]
  };

  function metricDefs(section) {
    var defs = METRIC_DEFS[section] || [];
    return defs.map(function (d) { return { id: d.id, label: d.label, format: d.format }; });
  }

  function defFor(section, id) {
    var defs = METRIC_DEFS[section] || [];
    for (var i = 0; i < defs.length; i++) {
      if (defs[i].id === id) return defs[i];
    }
    return null;
  }

  /* ---------- تفضيلات التخصيص (محلية لكل جهاز) ----------
   * المفتاح statsPrefs في مخزن tadreeb-settings نفسه (عبر UI) —
   * بنفس نمط dashboardCards: {قسم: {مقياس: ظاهر؟}}. الافتراضي: الكل ظاهر. */
  var PREFS_KEY = 'statsPrefs';

  function readPrefs() {
    var U = ui();
    if (U && typeof U.getSetting === 'function') {
      try {
        var p = U.getSetting(PREFS_KEY, {});
        return p && typeof p === 'object' ? p : {};
      } catch (e) { return {}; }
    }
    return {};
  }

  function writePrefs(prefs) {
    var U = ui();
    if (U && typeof U.setSetting === 'function') {
      try { U.setSetting(PREFS_KEY, prefs); } catch (e) { /* يُتجاهل */ }
    }
  }

  function getVisible(section) {
    var defs = metricDefs(section);
    var prefs = readPrefs()[section] || {};
    return defs.filter(function (d) { return prefs[d.id] !== false; }).map(function (d) { return d.id; });
  }

  function setVisible(section, ids) {
    var prefs = readPrefs();
    var map = {};
    metricDefs(section).forEach(function (d) {
      map[d.id] = ids.indexOf(d.id) !== -1;
    });
    prefs[section] = map;
    writePrefs(prefs);
  }

  function resetSection(section) {
    var prefs = readPrefs();
    delete prefs[section];
    writePrefs(prefs);
  }

  /* ---------- تنسيق قيمة مقياس للعرض ---------- */
  function fmtValue(section, id, value) {
    if (value == null || value === '') return '—';
    var def = defFor(section, id);
    var format = def ? def.format : 'num';
    var U = ui();
    if (format === 'money') {
      if (U && typeof U.fmtMoney === 'function') { try { return U.fmtMoney(value); } catch (e) {} }
      return asNum(value).toLocaleString('en-US') + ' ل.س';
    }
    if (format === 'pct') return asNum(value) + '%';
    if (format === 'text') return String(value);
    if (U && typeof U.fmtNumber === 'function') { try { return U.fmtNumber(value); } catch (e) {} }
    return asNum(value).toLocaleString('en-US');
  }

  /* ---------- مساعدات حساب مشتركة ---------- */

  // كل معرفات المتدربين المسجلين في أي دورة (أعضاء المجموعة أولاً — App.courseTrainees).
  function traineesInCoursesSet() {
    var A = app();
    var set = {};
    if (!A || typeof A.courseTrainees !== 'function') return set;
    storeAll('courses').forEach(function (c) {
      try {
        A.courseTrainees(c).forEach(function (t) { if (t && t.id) set[t.id] = true; });
      } catch (e) { /* دورة بلا متدربين */ }
    });
    return set;
  }

  // جلسات دورة ما (مرتبة حسب التاريخ).
  function sessionsForCourse(courseId) {
    var A = app();
    if (A && typeof A.sessionsForCourse === 'function') {
      try { return A.sessionsForCourse(courseId) || []; } catch (e) { /* احتياطي أدناه */ }
    }
    return storeAll('sessions').filter(function (s) { return s.courseId === courseId; })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }

  function courseProgress(course) {
    var A = app();
    if (A && typeof A.courseProgress === 'function') {
      try { return A.courseProgress(course); } catch (e) { /* احتياطي أدناه */ }
    }
    var sessions = sessionsForCourse(course && course.id);
    var done = sessions.filter(function (s) { return s.state === 'done'; }).length;
    return {
      done: done, total: sessions.length, sessionsTotal: sessions.length,
      sessionsRemaining: Math.max(0, sessions.length - done),
      pct: sessions.length ? Math.round((done / sessions.length) * 100) : 0,
      status: 'in-progress'
    };
  }

  function budgetFor(courseId) {
    var A = app();
    if (A && typeof A.budgetFromCache === 'function') {
      try { return A.budgetFromCache(courseId); } catch (e) { /* احتياطي أدناه */ }
    }
    var course = storeGet('courses', courseId);
    var expenses = storeAll('expenses').filter(function (e) { return e.courseId === courseId; });
    var total = 0, byCat = {};
    expenses.forEach(function (e) {
      var a = asNum(e.amount);
      total += a;
      byCat[e.category] = (byCat[e.category] || 0) + a;
    });
    var allocated = course ? asNum(course.budget) : 0;
    return {
      allocated: allocated, totalSpent: total, remaining: allocated - total,
      byCategory: byCat, expenses: expenses, trainerFeeDue: 0,
      trainerFeeAlreadyRecorded: !!byCat['أجور المدربين']
    };
  }

  function trainerFeeFor(course) {
    var A = app();
    if (A && typeof A.trainerFeeFor === 'function') {
      try { return asNum(A.trainerFeeFor(course)); } catch (e) { return 0; }
    }
    return 0;
  }

  function displayCode(doc, collection) {
    var A = app();
    if (A && typeof A.displayCode === 'function') {
      try { return A.displayCode(doc, collection); } catch (e) { return (doc && doc.code) || ''; }
    }
    return (doc && doc.code) || '';
  }

  function levelName(level) {
    var A = app();
    if (A && typeof A.levelName === 'function') {
      try { return A.levelName(level); } catch (e) { return 'بدون مستوى'; }
    }
    return 'بدون مستوى';
  }

  // ساعات جلسات مدرب: مجموع مدد فترات جلسات دوراته.
  function trainerHours(trainerId) {
    var courses = storeAll('courses').filter(function (c) { return c.trainerId === trainerId; });
    var minutes = 0;
    courses.forEach(function (c) {
      sessionsForCourse(c.id).forEach(function (s) {
        if (!occupies(s)) return;
        minutes += periodMinutes(storeGet('periods', s.periodId));
      });
    });
    return Math.round(minutes / 60 * 10) / 10;
  }

  // الفتحات المشغولة لقاعة في نطاق: أزواج (تاريخ، فترة) مميزة تشغلها
  // جلسات (غير ملغاة/عطلة) أو اجتماعات مجدولة.
  function hallBusySlots(hallId, from, to) {
    var slots = {};
    sessionsInRange(from, to).forEach(function (s) {
      if (s.hallId === hallId && occupies(s)) slots[s.date + '|' + s.periodId] = true;
    });
    meetingsInRange(from, to).forEach(function (m) {
      if (m.hallId === hallId && m.status !== 'cancelled') slots[m.date + '|' + m.periodId] = true;
    });
    return Object.keys(slots).length;
  }

  function topBy(rows, key, labelKey) {
    var best = null, bestVal = -1;
    rows.forEach(function (r) {
      var v = asNum(r[key]);
      if (v > bestVal) { bestVal = v; best = r; }
    });
    if (!best || bestVal <= 0) return '—';
    return best[labelKey] || '—';
  }

  /* ---------- 1. لوحة المعلومات (متزامن؛ نسبة الحضور الأسبوعية تُملأ لاحقاً) ---------- */
  function computeDashboard() {
    var A = app();
    var today = todayStr();
    var courses = storeAll('courses');
    var sessions = storeAll('sessions');
    var active = courses.filter(function (c) { return c.status === 'active'; });
    var totalBudget = 0, totalSpent = 0;
    courses.forEach(function (c) { totalBudget += asNum(c.budget); });
    storeAll('expenses').forEach(function (e) { totalSpent += asNum(e.amount); });
    return {
      metrics: {
        activeCourses: active.length,
        todaySessions: sessions.filter(function (s) { return s.date === today; }).length,
        weekAttendanceRate: null, // غير متزامن — تُملأ عبر updateMetrics
        trainees: storeAll('trainees').length,
        trainers: storeAll('trainers').length,
        halls: storeAll('halls').length,
        sessionsDone: sessions.filter(function (s) { return s.state === 'done'; }).length,
        upcomingSessions: sessions.filter(function (s) { return s.date > today && s.state !== 'cancelled' && s.state !== 'holiday'; }).length,
        totalBudget: totalBudget,
        totalSpent: totalSpent,
        budgetRemaining: totalBudget - totalSpent
      },
      courses: courses, sessions: sessions, activeCoursesList: active
    };
  }

  /* ---------- 2. الدورات (متزامن؛ نسبة الحضور تُملأ من buildCoursesStatsData) ---------- */
  function computeCourses() {
    var courses = storeAll('courses');
    var counts = { active: 0, completed: 0, cancelled: 0, paused: 0 };
    var sessionsTotal = 0, sessionsDone = 0, traineesTotal = 0;
    var budgetTotal = 0, spentTotal = 0, remainingTotal = 0;
    var A = app();
    courses.forEach(function (c) {
      var prog = courseProgress(c);
      if (prog.status === 'completed') counts.completed++;
      else if (prog.status === 'cancelled') counts.cancelled++;
      else if (prog.status === 'paused') counts.paused++;
      else counts.active++;
      sessionsTotal += prog.sessionsTotal;
      sessionsDone += prog.done;
      if (A && typeof A.courseTrainees === 'function') {
        try { traineesTotal += A.courseTrainees(c).length; } catch (e) {}
      }
      var b = budgetFor(c.id);
      budgetTotal += asNum(c.budget);
      spentTotal += b.totalSpent;
      remainingTotal += b.remaining;
    });
    return {
      metrics: {
        total: courses.length,
        active: counts.active,
        completed: counts.completed,
        cancelled: counts.cancelled,
        paused: counts.paused,
        sessionsTotal: sessionsTotal,
        sessionsDone: sessionsDone,
        overallPct: pct(sessionsDone, sessionsTotal),
        traineesTotal: traineesTotal,
        overallAttendanceRate: null, // غير متزامن — انظر coursesMetricsFromData
        budgetTotal: budgetTotal,
        spentTotal: spentTotal,
        remainingTotal: remainingTotal
      }
    };
  }

  // تحويل مخرجات App.buildCoursesStatsData إلى مقاييس (تتضمن نسبة الحضور).
  function coursesMetricsFromData(data) {
    data = data || {};
    var s = data.summary || {};
    return {
      total: asNum(s.courses),
      active: asNum(s.inProgress),
      completed: asNum(s.completed),
      cancelled: asNum(s.cancelled),
      paused: asNum(s.paused),
      sessionsTotal: asNum(s.sessionsTotal),
      sessionsDone: asNum(s.sessionsDone),
      overallPct: asNum(s.overallPct),
      traineesTotal: asNum(s.traineesTotal),
      overallAttendanceRate: asNum(s.overallAttendanceRate),
      budgetTotal: asNum(s.budgetTotal),
      spentTotal: asNum(s.spentTotal),
      remainingTotal: asNum(s.remainingTotal)
    };
  }

  // تحويل مخرجات App.buildSummaryData إلى مقاييس لوحة المعلومات.
  function summaryMetricsFromData(data) {
    data = data || {};
    var t = data.totals || {};
    var budget = asNum(t.totalBudget), spent = asNum(t.totalSpent);
    return {
      activeCourses: asNum(t.activeCourses),
      trainees: asNum(t.trainees),
      trainers: asNum(t.trainers),
      halls: asNum(t.halls),
      sessionsDone: asNum(t.sessionsDone),
      weekAttendanceRate: asNum(t.attendanceRate),
      totalBudget: budget,
      totalSpent: spent,
      budgetRemaining: budget - spent
    };
  }

  /* ---------- 3. دورة واحدة (متزامن؛ نسبة الحضور عبر courseAttendance) ---------- */
  function computeCourse(courseId) {
    var course = storeGet('courses', courseId);
    var A = app();
    var prog = course ? courseProgress(course) : { done: 0, sessionsTotal: 0, sessionsRemaining: 0, pct: 0 };
    var sessions = sessionsForCourse(courseId);
    var b = budgetFor(courseId);
    var trainees = 0;
    if (A && typeof A.courseTrainees === 'function' && course) {
      try { trainees = A.courseTrainees(course).length; } catch (e) {}
    }
    var halls = {};
    sessions.forEach(function (s) { if (s.hallId) halls[s.hallId] = true; });
    return {
      metrics: {
        sessionsTotal: prog.sessionsTotal,
        done: prog.done,
        remaining: prog.sessionsRemaining,
        cancelled: sessions.filter(function (s) { return s.state === 'cancelled'; }).length,
        pct: prog.pct,
        trainees: trainees,
        attendanceRate: null, // غير متزامن — انظر courseAttendance
        budget: b.allocated,
        spent: b.totalSpent,
        budgetRemaining: b.remaining,
        spentPct: pct(b.totalSpent, b.allocated),
        hallsUsed: Object.keys(halls).length,
        feeDue: course ? trainerFeeFor(course) : 0
      },
      course: course, progress: prog, budget: b
    };
  }

  /* ---------- 4. جلسة واحدة — من خريطة حضور محمّلة (متزامن تماماً) ----------
   * attMap: {traineeId: {status: 'present'|'absent'|'excused', note}} كما
   * تُعيد TadreebDB.getSessionAttendance؛ trainees: قائمة متدربي الدورة؛
   * trainerPresent: true/false/null. تُستخدم داخل تفقد الجلسة حيث
   * الخريطة محمّلة أصلاً — بلا أي قراءة إضافية. */
  function computeSession(attMap, trainees, trainerPresent) {
    attMap = attMap || {};
    trainees = Array.isArray(trainees) ? trainees : [];
    var present = 0, absent = 0, excused = 0, recorded = 0;
    trainees.forEach(function (t) {
      var rec = attMap[t.id] || {};
      if (rec.status === 'present') { present++; recorded++; }
      else if (rec.status === 'absent') { absent++; recorded++; }
      else if (rec.status === 'excused') { excused++; recorded++; }
    });
    var total = trainees.length;
    return {
      metrics: {
        total: total,
        present: present,
        absent: absent,
        excused: excused,
        unrecorded: Math.max(0, total - recorded),
        presentRate: pct(present, recorded),
        recordedRate: pct(recorded, total),
        trainer: trainerPresent == null ? 'بلا تسجيل' : (trainerPresent ? 'موجود' : 'غائب')
      }
    };
  }

  /* ---------- 5. الرزنامة في نطاق ---------- */
  function computeCalendar(from, to) {
    var range = (from && to) ? { from: from, to: to } : currentMonthRange();
    from = range.from; to = range.to;
    var sessions = sessionsInRange(from, to);
    var meetings = meetingsInRange(from, to).filter(function (m) { return m.status !== 'cancelled'; });
    var halls = storeAll('halls');
    var periods = storeAll('periods');
    var days = daysInRange(from, to);
    var totalSlots = days * periods.length * halls.length;
    var busy = 0;
    var byHall = {};
    sessions.forEach(function (s) {
      if (!occupies(s) || !s.hallId) return;
      busy++;
      byHall[s.hallId] = (byHall[s.hallId] || 0) + 1;
    });
    meetings.forEach(function (m) {
      if (!m.hallId) return;
      busy++;
      byHall[m.hallId] = (byHall[m.hallId] || 0) + 1;
    });
    var hallRows = halls.map(function (h) {
      return { name: h.name, count: byHall[h.id] || 0 };
    });
    var byPeriod = {};
    sessions.forEach(function (s) {
      if (!occupies(s)) return;
      byPeriod[s.periodId] = (byPeriod[s.periodId] || 0) + 1;
    });
    var periodRows = periods.map(function (p) {
      return { name: p.label, count: byPeriod[p.id] || 0 };
    });
    return {
      from: from, to: to,
      metrics: {
        sessions: sessions.length,
        done: sessions.filter(function (s) { return s.state === 'done'; }).length,
        scheduled: sessions.filter(function (s) { return s.state === 'scheduled'; }).length,
        cancelled: sessions.filter(function (s) { return s.state === 'cancelled'; }).length,
        trainerAbsent: sessions.filter(function (s) { return s.state === 'trainer-absent'; }).length,
        holiday: sessions.filter(function (s) { return s.state === 'holiday'; }).length,
        meetings: meetings.length,
        occupancy: pct(busy, totalSlots),
        busiestHall: topBy(hallRows, 'count', 'name'),
        busiestPeriod: topBy(periodRows, 'count', 'name')
      },
      sessions: sessions, meetings: meetings
    };
  }

  /* ---------- 6. الدليل ---------- */
  function computeDirectory() {
    var trainers = storeAll('trainers');
    var trainees = storeAll('trainees');
    var groups = storeAll('groups');
    var courses = storeAll('courses');
    var trainerWithCourse = {};
    var groupWithCourse = {};
    courses.forEach(function (c) {
      if (c.trainerId) trainerWithCourse[c.trainerId] = true;
      if (c.groupId) groupWithCourse[c.groupId] = true;
    });
    var inCourses = traineesInCoursesSet();
    return {
      metrics: {
        trainers: trainers.length,
        trainees: trainees.length,
        directorates: storeAll('directorates').length,
        groups: groups.length,
        halls: storeAll('halls').length,
        trainersWithoutCourses: trainers.filter(function (t) { return !trainerWithCourse[t.id]; }).length,
        groupsWithoutCourses: groups.filter(function (g) { return !groupWithCourse[g.id]; }).length,
        traineesWithoutCourse: trainees.filter(function (t) { return !inCourses[t.id]; }).length
      }
    };
  }

  /* ---------- 7. المتدربون ---------- */
  function computeTrainees() {
    var A = app();
    var trainees = storeAll('trainees');
    var inCourses = traineesInCoursesSet();
    var byDir = {};
    trainees.forEach(function (t) {
      var key = t.directorateId || '';
      byDir[key] = (byDir[key] || 0) + 1;
    });
    var rows = Object.keys(byDir).map(function (dirId) {
      var name = '';
      if (A && typeof A.directorateName === 'function') {
        try { name = A.directorateName(dirId); } catch (e) {}
      }
      return { directorateId: dirId, directorate: name || 'بلا مديرية', count: byDir[dirId] };
    }).sort(function (a, b) { return b.count - a.count; });
    return {
      metrics: {
        total: trainees.length,
        inCourses: trainees.filter(function (t) { return !!inCourses[t.id]; }).length,
        withoutCourse: trainees.filter(function (t) { return !inCourses[t.id]; }).length,
        topDirectorate: rows.length && rows[0].count > 0 ? rows[0].directorate : '—'
      },
      rows: rows
    };
  }

  /* ---------- 8. المدربون ---------- */
  function trainerRow(t) {
    var courses = storeAll('courses').filter(function (c) { return c.trainerId === t.id; });
    var sessions = 0;
    var feeDue = 0;
    courses.forEach(function (c) {
      sessions += sessionsForCourse(c.id).filter(occupies).length;
      feeDue += trainerFeeFor(c);
    });
    var trainees = {};
    var A = app();
    courses.forEach(function (c) {
      if (A && typeof A.courseTrainees === 'function') {
        try {
          A.courseTrainees(c).forEach(function (tr) { if (tr && tr.id) trainees[tr.id] = true; });
        } catch (e) {}
      }
    });
    return {
      id: t.id,
      name: t.name || '',
      code: displayCode(t, 'trainers'),
      specialty: t.specialty || '',
      courses: courses.length,
      sessions: sessions,
      hours: trainerHours(t.id),
      trainees: Object.keys(trainees).length,
      feeDue: feeDue
    };
  }

  function computeTrainers() {
    var rows = storeAll('trainers').map(trainerRow)
      .sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'ar'); });
    var totalSessions = 0, totalHours = 0, totalFees = 0;
    rows.forEach(function (r) {
      totalSessions += r.sessions;
      totalHours += r.hours;
      totalFees += r.feeDue;
    });
    return {
      metrics: {
        total: rows.length,
        withCourses: rows.filter(function (r) { return r.courses > 0; }).length,
        withoutCourses: rows.filter(function (r) { return r.courses === 0; }).length,
        totalSessions: totalSessions,
        totalHours: Math.round(totalHours * 10) / 10,
        totalFeesDue: totalFees
      },
      rows: rows
    };
  }

  function computeTrainer(trainerId) {
    var t = storeGet('trainers', trainerId);
    if (!t) return { metrics: { courses: 0, sessions: 0, hours: 0, trainees: 0, feeDue: 0 }, trainer: null };
    var row = trainerRow(t);
    return {
      metrics: {
        courses: row.courses,
        sessions: row.sessions,
        hours: row.hours,
        trainees: row.trainees,
        feeDue: row.feeDue
      },
      trainer: t, row: row
    };
  }

  /* ---------- 9. المديريات ---------- */
  function directorateRow(d) {
    var trainees = storeAll('trainees').filter(function (t) { return t.directorateId === d.id; }).length;
    var groups = storeAll('groups').filter(function (g) { return g.directorateId === d.id; }).length;
    var courses = storeAll('courses').filter(function (c) {
      return c.directorateId === d.id || (Array.isArray(c.directorateIds) && c.directorateIds.indexOf(d.id) !== -1);
    });
    var sessions = 0;
    courses.forEach(function (c) { sessions += sessionsForCourse(c.id).length; });
    return {
      id: d.id,
      name: d.name || '',
      code: displayCode(d, 'directorates'),
      trainees: trainees,
      groups: groups,
      courses: courses.length,
      sessions: sessions
    };
  }

  function computeDirectorates() {
    var rows = storeAll('directorates').map(directorateRow)
      .sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'ar'); });
    var trainees = 0, groups = 0, courses = 0;
    rows.forEach(function (r) { trainees += r.trainees; groups += r.groups; courses += r.courses; });
    return {
      metrics: {
        total: rows.length,
        trainees: trainees,
        groups: groups,
        courses: courses,
        topDirectorate: topBy(rows, 'trainees', 'name')
      },
      rows: rows
    };
  }

  function computeDirectorate(directorateId) {
    var d = storeGet('directorates', directorateId);
    if (!d) return { metrics: { trainees: 0, groups: 0, courses: 0, sessions: 0 }, directorate: null };
    var row = directorateRow(d);
    return {
      metrics: { trainees: row.trainees, groups: row.groups, courses: row.courses, sessions: row.sessions },
      directorate: d, row: row
    };
  }

  /* ---------- 10. المجموعات التدريبية ---------- */
  function groupRow(g) {
    var members = (g.traineeIds || []).length;
    var courses = storeAll('courses').filter(function (c) { return c.groupId === g.id; });
    var sessions = 0;
    courses.forEach(function (c) { sessions += sessionsForCourse(c.id).length; });
    var A = app();
    var dirName = '';
    if (A && typeof A.directorateName === 'function') {
      try { dirName = A.directorateName(g.directorateId); } catch (e) {}
    }
    return {
      id: g.id,
      name: g.name || '',
      code: displayCode(g, 'groups'),
      directorate: dirName,
      members: members,
      courses: courses.length,
      sessions: sessions
    };
  }

  function computeGroups() {
    var rows = storeAll('groups').map(groupRow)
      .sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'ar'); });
    var members = 0, courses = 0;
    rows.forEach(function (r) { members += r.members; courses += r.courses; });
    return {
      metrics: {
        total: rows.length,
        members: members,
        courses: courses,
        emptyGroups: rows.filter(function (r) { return r.members === 0; }).length,
        groupsWithoutCourses: rows.filter(function (r) { return r.courses === 0; }).length
      },
      rows: rows
    };
  }

  function computeGroup(groupId) {
    var g = storeGet('groups', groupId);
    if (!g) return { metrics: { members: 0, courses: 0, sessions: 0, attendanceRate: null }, group: null };
    var row = groupRow(g);
    return {
      metrics: {
        members: row.members,
        courses: row.courses,
        sessions: row.sessions,
        attendanceRate: null // غير متزامن — انظر groupAttendance
      },
      group: g, row: row
    };
  }

  /* ---------- 11. القاعات ---------- */
  function hallRow(h, from, to) {
    var sessions = sessionsInRange(from, to).filter(function (s) { return s.hallId === h.id && occupies(s); });
    var meetings = meetingsInRange(from, to).filter(function (m) { return m.hallId === h.id && m.status !== 'cancelled'; });
    var days = daysInRange(from, to);
    var periods = storeAll('periods').length || 1;
    var totalSlots = days * periods;
    var busySlots = hallBusySlots(h.id, from, to);
    var courses = {};
    sessions.forEach(function (s) { if (s.courseId) courses[s.courseId] = true; });
    return {
      id: h.id,
      name: h.name || '',
      code: displayCode(h, 'halls'),
      capacity: asNum(h.capacity),
      sessions: sessions.length,
      meetings: meetings.length,
      busySlots: busySlots,
      totalSlots: totalSlots,
      occupancy: pct(busySlots, totalSlots),
      courses: Object.keys(courses).length
    };
  }

  function computeHalls(from, to) {
    var range = (from && to) ? { from: from, to: to } : currentMonthRange();
    from = range.from; to = range.to;
    var rows = storeAll('halls').map(function (h) { return hallRow(h, from, to); })
      .sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'ar'); });
    var capacity = 0, sessions = 0, meetings = 0, busy = 0, total = 0;
    rows.forEach(function (r) {
      capacity += r.capacity; sessions += r.sessions; meetings += r.meetings;
      busy += r.busySlots; total += r.totalSlots;
    });
    return {
      from: from, to: to,
      metrics: {
        total: rows.length,
        capacity: capacity,
        sessions: sessions,
        meetings: meetings,
        occupancy: pct(busy, total),
        busiestHall: topBy(rows, 'sessions', 'name')
      },
      rows: rows
    };
  }

  function computeHall(hallId, from, to) {
    var h = storeGet('halls', hallId);
    if (!h) return { metrics: { sessions: 0, meetings: 0, occupancy: 0, capacity: 0, courses: 0 }, hall: null };
    var range = (from && to) ? { from: from, to: to } : currentMonthRange();
    var row = hallRow(h, range.from, range.to);
    return {
      from: range.from, to: range.to,
      metrics: {
        sessions: row.sessions,
        meetings: row.meetings,
        occupancy: row.occupancy,
        capacity: row.capacity,
        courses: row.courses
      },
      hall: h, row: row
    };
  }

  /* ---------- 12. الفترات التدريبية ---------- */
  function computePeriods() {
    var sessions = storeAll('sessions');
    var periods = storeAll('periods').slice()
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var total = sessions.filter(occupies).length;
    var totalMinutes = 0;
    var rows = periods.map(function (p) {
      var count = sessions.filter(function (s) { return s.periodId === p.id && occupies(s); }).length;
      var mins = periodMinutes(p);
      totalMinutes += mins;
      var A = app();
      var time = '';
      if (A && typeof A.periodTime === 'function') {
        try { time = A.periodTime(p.id); } catch (e) {}
      }
      if (!time) time = (p.start || '') + ' - ' + (p.end || '');
      return {
        id: p.id,
        label: p.label || '',
        code: displayCode(p, 'periods'),
        time: time,
        duration: mins,
        sessions: count,
        share: pct(count, total)
      };
    });
    return {
      metrics: {
        total: periods.length,
        sessions: total,
        busiestPeriod: topBy(rows, 'sessions', 'label'),
        totalHours: Math.round(totalMinutes / 60 * 10) / 10
      },
      rows: rows
    };
  }

  /* ---------- 13. المستويات ---------- */
  function computeLevels() {
    var A = app();
    var labels = [];
    var seen = {};
    function addLabel(name) {
      if (!name || seen[name]) return;
      seen[name] = true;
      labels.push(name);
    }
    // المستويات المدمجة أولاً (ثوابت في App.LEVEL_LABELS)، ثم المخصصة.
    if (A && A.LEVEL_LABELS) {
      Object.keys(A.LEVEL_LABELS).forEach(function (k) { addLabel(A.LEVEL_LABELS[k]); });
    } else {
      ['بدون مستوى', 'مستوى مبتدئ', 'مستوى متوسط', 'مستوى متقدم'].forEach(addLabel);
    }
    storeAll('levels').forEach(function (l) { addLabel(l.name); });
    var courses = storeAll('courses');
    var rows = labels.map(function (label) {
      var list = courses.filter(function (c) { return levelName(c.level) === label; });
      var sessions = 0, trainees = 0;
      list.forEach(function (c) {
        sessions += sessionsForCourse(c.id).length;
        if (A && typeof A.courseTrainees === 'function') {
          try { trainees += A.courseTrainees(c).length; } catch (e) {}
        }
      });
      return { level: label, courses: list.length, sessions: sessions, trainees: trainees };
    });
    var without = 0;
    rows.forEach(function (r) { if (r.level === 'بدون مستوى') without = r.courses; });
    return {
      metrics: {
        total: labels.length,
        courses: courses.length,
        withoutLevel: without,
        topLevel: topBy(rows, 'courses', 'level')
      },
      rows: rows
    };
  }

  /* ---------- 14. العطل ---------- */
  function computeHolidays() {
    var today = todayStr();
    var holidays = storeAll('holidays').slice()
      .sort(function (a, b) { return (a.date || '') < (b.date || '') ? -1 : 1; });
    var rows = holidays.map(function (h) {
      return { date: h.date || '', name: h.name || '', note: h.notes || h.note || '' };
    });
    return {
      metrics: {
        total: holidays.length,
        upcoming: holidays.filter(function (h) { return (h.date || '') >= today; }).length,
        past: holidays.filter(function (h) { return (h.date || '') < today; }).length,
        holidaySessions: storeAll('sessions').filter(function (s) { return s.state === 'holiday'; }).length
      },
      rows: rows
    };
  }

  /* ---------- 15. المصاريف (كل المنصة) ---------- */
  function computeExpenses() {
    var A = app();
    var expenses = storeAll('expenses');
    var byCatMap = {}, byCourseMap = {};
    var total = 0;
    expenses.forEach(function (e) {
      var amount = asNum(e.amount);
      total += amount;
      var cat = e.category || 'بلا فئة';
      if (!byCatMap[cat]) byCatMap[cat] = { category: cat, count: 0, total: 0 };
      byCatMap[cat].count++;
      byCatMap[cat].total += amount;
      var courseName = '';
      if (A && e.courseId) {
        var c = storeGet('courses', e.courseId);
        courseName = c ? c.name : '';
      }
      var key = e.courseId || '';
      if (!byCourseMap[key]) byCourseMap[key] = { courseId: key, course: courseName || 'بلا دورة', count: 0, total: 0 };
      byCourseMap[key].count++;
      byCourseMap[key].total += amount;
    });
    var byCategory = Object.keys(byCatMap).map(function (k) { return byCatMap[k]; })
      .sort(function (a, b) { return b.total - a.total; });
    var byCourse = Object.keys(byCourseMap).map(function (k) { return byCourseMap[k]; })
      .sort(function (a, b) { return b.total - a.total; });
    return {
      metrics: {
        totalSpent: total,
        count: expenses.length,
        avgExpense: expenses.length ? Math.round(total / expenses.length) : 0,
        categoriesCount: byCategory.length,
        topCategory: byCategory.length && byCategory[0].total > 0 ? byCategory[0].category : '—',
        topCourse: byCourse.length && byCourse[0].total > 0 ? byCourse[0].course : '—'
      },
      byCategory: byCategory,
      byCourse: byCourse
    };
  }

  /* ---------- 16. ميزانية دورة واحدة ---------- */
  function computeBudget(courseId) {
    var b = budgetFor(courseId);
    var topCat = '—', topVal = 0;
    Object.keys(b.byCategory || {}).forEach(function (cat) {
      if (b.byCategory[cat] > topVal) { topVal = b.byCategory[cat]; topCat = cat; }
    });
    return {
      metrics: {
        allocated: b.allocated,
        spent: b.totalSpent,
        remaining: b.remaining,
        spentPct: pct(b.totalSpent, b.allocated),
        expensesCount: (b.expenses || []).length,
        feeDue: asNum(b.trainerFeeDue),
        feeRecorded: asNum((b.byCategory || {})['أجور المدربين']),
        topCategory: topCat
      },
      budget: b
    };
  }

  /* ---------- 17. الاجتماعات العارضة ---------- */
  function computeMeetings(from, to) {
    var A = app();
    var today = todayStr();
    var meetings = storeAll('meetings').slice()
      .sort(function (a, b) { return (a.date || '') < (b.date || '') ? -1 : 1; });
    if (from && to) {
      meetings = meetings.filter(function (m) { return m.date >= from && m.date <= to; });
    }
    var rows = meetings.map(function (m) {
      var hallName = '';
      var periodLabel = '';
      if (A) {
        if (typeof A.hallName === 'function') { try { hallName = A.hallName(m.hallId); } catch (e) {} }
        if (typeof A.periodLabel === 'function') { try { periodLabel = A.periodLabel(m.periodId); } catch (e) {} }
      }
      return {
        id: m.id,
        date: m.date || '',
        period: periodLabel,
        hall: hallName,
        title: m.title || '',
        organizer: m.organizer || '',
        status: m.status === 'cancelled' ? 'ملغاة' : 'مجدولة',
        note: m.notes || m.note || ''
      };
    });
    var byHall = {};
    meetings.forEach(function (m) {
      if (m.status === 'cancelled' || !m.hallId) return;
      byHall[m.hallId] = (byHall[m.hallId] || 0) + 1;
    });
    var hallRows = Object.keys(byHall).map(function (hallId) {
      var name = '';
      if (A && typeof A.hallName === 'function') { try { name = A.hallName(hallId); } catch (e) {} }
      return { name: name || hallId, count: byHall[hallId] };
    });
    return {
      from: from || '', to: to || '',
      metrics: {
        total: meetings.length,
        scheduled: meetings.filter(function (m) { return m.status !== 'cancelled'; }).length,
        cancelled: meetings.filter(function (m) { return m.status === 'cancelled'; }).length,
        upcoming: meetings.filter(function (m) { return m.status !== 'cancelled' && (m.date || '') >= today; }).length,
        topHall: topBy(hallRows, 'count', 'name')
      },
      rows: rows
    };
  }

  /* ---------- 18. المستخدمون (تُمرَّر القائمة — تأتي من TadreebAuth.listUsers) ---------- */
  function computeUsers(users) {
    users = Array.isArray(users) ? users : [];
    var U = ui();
    var rows = users.map(function (u) {
      var role = u.role || '';
      var roleLabel = role;
      if (U && typeof U.roleLabel === 'function') {
        try { roleLabel = U.roleLabel(role); } catch (e) {}
      }
      return { username: u.username || '', role: roleLabel, disabled: !!u.disabled };
    }).sort(function (a, b) { return String(a.username).localeCompare(String(b.username)); });
    return {
      metrics: {
        total: users.length,
        admins: users.filter(function (u) { return u.role === 'admin'; }).length,
        editors: users.filter(function (u) { return u.role === 'editor'; }).length,
        viewers: users.filter(function (u) { return u.role === 'viewer'; }).length,
        disabled: users.filter(function (u) { return !!u.disabled; }).length
      },
      rows: rows
    };
  }

  /* ---------- 19. الحضور (غير متزامن — قراءات متسلسلة كـ courseStatsRow) ---------- */

  // حضور جلسات قائمة (بالتسلسل لتجنب إغراق الطلبات) — تُرجع عدادات
  // + صفاً لكل جلسة. جلسة بلا سجلات تُحسب بلا تسجيل لكل متدربيها.
  function attendanceForSessions(sessions, trainees) {
    var D = db();
    var counts = { present: 0, absent: 0, excused: 0, recorded: 0 };
    var perSession = [];
    var chain = Promise.resolve();
    var totalTrainees = Array.isArray(trainees) ? trainees.length : 0;
    sessions.forEach(function (s) {
      chain = chain.then(function () {
        if (!D || typeof D.getSessionAttendance !== 'function') return {};
        return D.getSessionAttendance(s.id).catch(function () { return {}; });
      }).then(function (attMap) {
        var c = { present: 0, absent: 0, excused: 0, recorded: 0 };
        Object.keys(attMap || {}).forEach(function (tid) {
          var st = attMap[tid].status;
          if (st === 'present') { c.present++; c.recorded++; }
          else if (st === 'absent') { c.absent++; c.recorded++; }
          else if (st === 'excused') { c.excused++; c.recorded++; }
        });
        counts.present += c.present;
        counts.absent += c.absent;
        counts.excused += c.excused;
        counts.recorded += c.recorded;
        perSession.push({
          sessionId: s.id, date: s.date || '',
          present: c.present, absent: c.absent, excused: c.excused,
          unrecorded: Math.max(0, totalTrainees - c.recorded),
          recorded: c.recorded
        });
      });
    });
    return chain.then(function () {
      var total = counts.recorded;
      return {
        present: counts.present,
        absent: counts.absent,
        excused: counts.excused,
        recorded: counts.recorded,
        unrecorded: Math.max(0, sessions.length * totalTrainees - counts.recorded),
        total: total,
        rate: pct(counts.present, total),
        perSession: perSession
      };
    });
  }

  function courseAttendance(courseId) {
    var A = app();
    var course = storeGet('courses', courseId);
    var trainees = [];
    if (A && typeof A.courseTrainees === 'function' && course) {
      try { trainees = A.courseTrainees(course); } catch (e) {}
    }
    return attendanceForSessions(sessionsForCourse(courseId), trainees);
  }

  function groupAttendance(groupId) {
    var A = app();
    var group = storeGet('groups', groupId);
    var courses = storeAll('courses').filter(function (c) { return c.groupId === groupId; });
    var sessions = [];
    courses.forEach(function (c) { sessions = sessions.concat(sessionsForCourse(c.id)); });
    var trainees = [];
    if (group && Array.isArray(group.traineeIds)) {
      trainees = group.traineeIds.map(function (id) { return storeGet('trainees', id); }).filter(Boolean);
    }
    if (!trainees.length && A && typeof A.courseTrainees === 'function') {
      var seen = {};
      courses.forEach(function (c) {
        try {
          A.courseTrainees(c).forEach(function (t) {
            if (t && t.id && !seen[t.id]) { seen[t.id] = true; trainees.push(t); }
          });
        } catch (e) {}
      });
    }
    return attendanceForSessions(sessions, trainees);
  }

  function traineeAttendance(traineeId) {
    var A = app();
    var D = db();
    var sessions = [];
    storeAll('courses').forEach(function (c) {
      var list = [];
      if (A && typeof A.courseTrainees === 'function') {
        try { list = A.courseTrainees(c); } catch (e) {}
      }
      if (list.some(function (t) { return t.id === traineeId; })) {
        sessions = sessions.concat(sessionsForCourse(c.id));
      }
    });
    var counts = { present: 0, absent: 0, excused: 0, recorded: 0 };
    var chain = Promise.resolve();
    sessions.forEach(function (s) {
      chain = chain.then(function () {
        if (!D || typeof D.getSessionAttendance !== 'function') return {};
        return D.getSessionAttendance(s.id).catch(function () { return {}; });
      }).then(function (attMap) {
        var rec = (attMap || {})[traineeId];
        if (!rec || !rec.status) return;
        if (rec.status === 'present') { counts.present++; counts.recorded++; }
        else if (rec.status === 'absent') { counts.absent++; counts.recorded++; }
        else if (rec.status === 'excused') { counts.excused++; counts.recorded++; }
      });
    });
    return chain.then(function () {
      return {
        present: counts.present,
        absent: counts.absent,
        excused: counts.excused,
        recorded: counts.recorded,
        unrecorded: Math.max(0, sessions.length - counts.recorded),
        total: counts.recorded,
        rate: pct(counts.present, counts.recorded),
        sessions: sessions.length
      };
    });
  }

  // صفوف حضور لكل الدورات / المجموعات / المتدربين (للتصدير).
  function attendanceByCourse() {
    var courses = storeAll('courses').slice()
      .sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'ar'); });
    var rows = [];
    var summary = { present: 0, absent: 0, excused: 0, unrecorded: 0, total: 0 };
    var chain = Promise.resolve();
    courses.forEach(function (c) {
      chain = chain.then(function () {
        return courseAttendance(c.id).then(function (res) {
          rows.push({
            name: c.name || '', present: res.present, absent: res.absent,
            excused: res.excused, unrecorded: res.unrecorded,
            total: res.recorded, rate: res.rate
          });
          summary.present += res.present;
          summary.absent += res.absent;
          summary.excused += res.excused;
          summary.unrecorded += res.unrecorded;
          summary.total += res.recorded;
        });
      });
    });
    return chain.then(function () {
      summary.rate = pct(summary.present, summary.total);
      return { scope: 'courses', scopeLabel: 'حسب الدورة', rows: rows, summary: summary };
    });
  }

  function attendanceByGroup() {
    var groups = storeAll('groups').slice()
      .sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'ar'); });
    var rows = [];
    var summary = { present: 0, absent: 0, excused: 0, unrecorded: 0, total: 0 };
    var chain = Promise.resolve();
    groups.forEach(function (g) {
      chain = chain.then(function () {
        return groupAttendance(g.id).then(function (res) {
          rows.push({
            name: g.name || '', present: res.present, absent: res.absent,
            excused: res.excused, unrecorded: res.unrecorded,
            total: res.recorded, rate: res.rate
          });
          summary.present += res.present;
          summary.absent += res.absent;
          summary.excused += res.excused;
          summary.unrecorded += res.unrecorded;
          summary.total += res.recorded;
        });
      });
    });
    return chain.then(function () {
      summary.rate = pct(summary.present, summary.total);
      return { scope: 'groups', scopeLabel: 'حسب المجموعة', rows: rows, summary: summary };
    });
  }

  function attendanceByTrainee() {
    var trainees = storeAll('trainees').slice()
      .sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'ar'); });
    var rows = [];
    var summary = { present: 0, absent: 0, excused: 0, unrecorded: 0, total: 0 };
    var chain = Promise.resolve();
    trainees.forEach(function (t) {
      chain = chain.then(function () {
        return traineeAttendance(t.id).then(function (res) {
          rows.push({
            name: t.name || '', present: res.present, absent: res.absent,
            excused: res.excused, unrecorded: res.unrecorded,
            total: res.recorded, rate: res.rate
          });
          summary.present += res.present;
          summary.absent += res.absent;
          summary.excused += res.excused;
          summary.unrecorded += res.unrecorded;
          summary.total += res.recorded;
        });
      });
    });
    return chain.then(function () {
      summary.rate = pct(summary.present, summary.total);
      return { scope: 'trainees', scopeLabel: 'حسب المتدرب', rows: rows, summary: summary };
    });
  }

  /* ---------- بُناة بيانات التصدير ----------
   * تُعيد البيانات الجاهزة لدوال TadreebExport (متزامنة إلا حضور
   * النطاقات — Promise). الشاشات تستدعيها ثم UI.callExport. */
  function exportData(kind, params) {
    params = params || {};
    var A = app();
    switch (kind) {
      case 'halls-stats': {
        var h = computeHalls(params.from, params.to);
        return {
          from: h.from, to: h.to, halls: h.rows,
          summary: {
            halls: h.metrics.total, capacity: h.metrics.capacity,
            sessions: h.metrics.sessions, meetings: h.metrics.meetings,
            occupancy: h.metrics.occupancy, busiestHall: h.metrics.busiestHall
          }
        };
      }
      case 'hall-detail': {
        var hall = computeHall(params.hallId, params.from, params.to);
        var hdoc = hall.hall;
        var sessions = sessionsInRange(hall.from, hall.to)
          .filter(function (s) { return s.hallId === params.hallId; })
          .sort(function (a, b) { return a.date < b.date ? -1 : 1; })
          .map(function (s) {
            var course = s.courseId ? storeGet('courses', s.courseId) : null;
            var period = s.periodId ? storeGet('periods', s.periodId) : null;
            var U = ui();
            var state = s.state || '';
            if (U && U.SESSION_STATE_LABELS) state = U.SESSION_STATE_LABELS[s.state] || s.state;
            return {
              date: s.date || '', period: period ? period.label : '',
              course: course ? course.name : '',
              trainer: course && A && typeof A.trainerName === 'function' ? A.trainerName(course.trainerId) : '',
              state: state
            };
          });
        var meetings = meetingsInRange(hall.from, hall.to)
          .filter(function (m) { return m.hallId === params.hallId; })
          .sort(function (a, b) { return (a.date || '') < (b.date || '') ? -1 : 1; })
          .map(function (m) {
            var period = m.periodId ? storeGet('periods', m.periodId) : null;
            return {
              date: m.date || '', period: period ? period.label : '',
              title: m.title || '', organizer: m.organizer || '',
              status: m.status === 'cancelled' ? 'ملغاة' : 'مجدولة'
            };
          });
        return {
          hall: hdoc ? { name: hdoc.name || '', code: displayCode(hdoc, 'halls'), capacity: asNum(hdoc.capacity) } : { name: '', code: '', capacity: 0 },
          from: hall.from, to: hall.to,
          stats: hall.metrics, sessions: sessions, meetings: meetings
        };
      }
      case 'trainers-stats': {
        var tr = computeTrainers();
        return {
          trainers: tr.rows,
          summary: {
            trainers: tr.metrics.total, withCourses: tr.metrics.withCourses,
            withoutCourses: tr.metrics.withoutCourses,
            totalSessions: tr.metrics.totalSessions, totalHours: tr.metrics.totalHours,
            totalFeesDue: tr.metrics.totalFeesDue
          }
        };
      }
      case 'groups-stats': {
        var gr = computeGroups();
        return {
          groups: gr.rows,
          summary: {
            groups: gr.metrics.total, members: gr.metrics.members,
            courses: gr.metrics.courses, emptyGroups: gr.metrics.emptyGroups,
            groupsWithoutCourses: gr.metrics.groupsWithoutCourses
          }
        };
      }
      case 'directorates-stats': {
        var dr = computeDirectorates();
        return {
          directorates: dr.rows,
          summary: {
            directorates: dr.metrics.total, trainees: dr.metrics.trainees,
            groups: dr.metrics.groups, courses: dr.metrics.courses,
            topDirectorate: dr.metrics.topDirectorate
          }
        };
      }
      case 'periods-stats': {
        var pr = computePeriods();
        return {
          periods: pr.rows,
          summary: {
            periods: pr.metrics.total, sessions: pr.metrics.sessions,
            busiestPeriod: pr.metrics.busiestPeriod, totalHours: pr.metrics.totalHours
          }
        };
      }
      case 'levels-stats': {
        var lv = computeLevels();
        return {
          levels: lv.rows,
          summary: {
            levels: lv.metrics.total, courses: lv.metrics.courses,
            withoutLevel: lv.metrics.withoutLevel, topLevel: lv.metrics.topLevel
          }
        };
      }
      case 'meetings': {
        var mt = computeMeetings(params.from, params.to);
        return {
          meetings: mt.rows, from: mt.from, to: mt.to,
          summary: {
            total: mt.metrics.total, scheduled: mt.metrics.scheduled,
            cancelled: mt.metrics.cancelled, upcoming: mt.metrics.upcoming,
            topHall: mt.metrics.topHall
          }
        };
      }
      case 'users-stats': {
        var us = computeUsers(params.users);
        return {
          users: us.rows,
          summary: {
            total: us.metrics.total, admins: us.metrics.admins,
            editors: us.metrics.editors, viewers: us.metrics.viewers,
            disabled: us.metrics.disabled
          }
        };
      }
      case 'expenses-stats': {
        var ex = computeExpenses();
        return {
          byCategory: ex.byCategory, byCourse: ex.byCourse,
          summary: {
            totalSpent: ex.metrics.totalSpent, count: ex.metrics.count,
            avgExpense: ex.metrics.avgExpense, categoriesCount: ex.metrics.categoriesCount,
            topCategory: ex.metrics.topCategory, topCourse: ex.metrics.topCourse
          }
        };
      }
      case 'attendance-stats': {
        if (params.scope === 'groups') return attendanceByGroup();
        if (params.scope === 'trainees') return attendanceByTrainee();
        return attendanceByCourse();
      }
      case 'calendar-stats': {
        var cal = computeCalendar(params.from, params.to);
        var byHallRows = computeHalls(cal.from, cal.to).rows.map(function (r) {
          return {
            name: r.name, code: r.code, sessions: r.sessions, meetings: r.meetings,
            busySlots: r.busySlots, totalSlots: r.totalSlots, occupancy: r.occupancy
          };
        });
        // جلسات الفترة تُحسب داخل النطاق نفسه (لا كل الجلسات):
        var inRange = cal.sessions.filter(occupies);
        var perCount = {};
        inRange.forEach(function (s) { perCount[s.periodId] = (perCount[s.periodId] || 0) + 1; });
        var byPeriodRows = storeAll('periods').slice()
          .sort(function (a, b) { return (a.order || 0) - (b.order || 0); })
          .map(function (p) {
            var count = perCount[p.id] || 0;
            var time = '';
            if (A && typeof A.periodTime === 'function') {
              try { time = A.periodTime(p.id); } catch (e) {}
            }
            return {
              label: p.label || '', time: time || ((p.start || '') + ' - ' + (p.end || '')),
              sessions: count, share: pct(count, inRange.length)
            };
          });
        return {
          from: cal.from, to: cal.to,
          summary: {
            sessions: cal.metrics.sessions, done: cal.metrics.done,
            scheduled: cal.metrics.scheduled, cancelled: cal.metrics.cancelled,
            trainerAbsent: cal.metrics.trainerAbsent, holiday: cal.metrics.holiday,
            meetings: cal.metrics.meetings, occupancy: cal.metrics.occupancy,
            busiestHall: cal.metrics.busiestHall, busiestPeriod: cal.metrics.busiestPeriod
          },
          byHall: byHallRows,
          byPeriod: byPeriodRows
        };
      }
      case 'holidays': {
        var ho = computeHolidays();
        return {
          holidays: ho.rows,
          summary: {
            total: ho.metrics.total, upcoming: ho.metrics.upcoming,
            past: ho.metrics.past, holidaySessions: ho.metrics.holidaySessions
          }
        };
      }
      default:
        throw new Error('نوع إحصاءات غير معروف: ' + kind);
    }
  }

  /* ---------- عرض لوحة الإحصاءات ---------- */

  // حجم خط رقم البطاقة حسب طول النص — القيم الطويلة (مبالغ بفواصل
  // الآلاف) لا تلتف تلقائياً فتكسر شبكة البطاقات على الهاتف؛ التصغير
  // التدريجي + overflow-wrap يمنعان أي فيض أفقي عند 390px.
  // القيم القصيرة بلا نمط مضمّن (يبقى حجم CSS الافتراضي، ومنه كثافة
  // الجداول المدمجة).
  function numFontSize(text) {
    var len = String(text == null ? '' : text).length;
    if (len > 10) return 18;
    if (len > 6) return 22;
    return 0;
  }

  function applyNumStyle(el, text) {
    if (!el) return;
    var size = numFontSize(text);
    el.style.fontSize = size ? size + 'px' : '';
    el.style.overflowWrap = 'anywhere';
  }

  // رسم لوحة إحصاءات داخل حاوية.
  // spec: {section, title, metrics, subtitle?, export?: {label, onClick}}
  // metrics: خريطة id ← قيمة (القيمة null تُعرض «—» وتُملأ لاحقاً عبر updateMetrics).
  function renderPanel(container, spec) {
    spec = spec || {};
    if (!container || typeof document === 'undefined') return null;
    var section = spec.section || '';
    var defs = metricDefs(section);
    var visible = getVisible(section);
    var metrics = spec.metrics || {};
    container._statsSpec = spec;

    var html = '<div class="card-white stats-panel" data-stats-section="' + escapeHtml(section) + '">' +
      '<div class="section-title-row"><h2 style="margin:0">' + escapeHtml(spec.title || 'إحصاءات') + '</h2>' +
      '<div class="head-actions">' +
      '<button class="btn btn-outline btn-sm" type="button" data-stats-customize>تخصيص</button>';
    if (spec.export && typeof spec.export.onClick === 'function') {
      html += '<button class="btn btn-outline btn-sm" type="button" data-stats-export>' +
        escapeHtml(spec.export.label || 'تصدير إكسل ↓') + '</button>';
    }
    html += '</div></div>';
    if (spec.subtitle) html += '<div class="muted" style="margin-bottom:12px">' + escapeHtml(spec.subtitle) + '</div>';
    if (!visible.length) {
      html += '<div class="muted">لا مقاييس ظاهرة — استخدم «تخصيص» لإظهار المقاييس.</div>';
    } else {
      html += '<div class="stats" style="margin-bottom:0">';
      visible.forEach(function (id) {
        var def = defFor(section, id) || { id: id, label: id, format: 'num' };
        var valText = fmtValue(section, id, metrics[id]);
        var size = numFontSize(valText);
        var style = 'overflow-wrap:anywhere' + (size ? ';font-size:' + size + 'px' : '');
        html += '<div class="stat" data-metric="' + escapeHtml(id) + '">' +
          '<div class="stat-num" style="' + style + '">' + escapeHtml(valText) + '</div>' +
          '<div class="stat-label">' + escapeHtml(def.label) + '</div></div>';
      });
      html += '</div>';
    }
    html += '</div>';

    container.innerHTML = html;

    var customizeBtn = container.querySelector('[data-stats-customize]');
    if (customizeBtn) {
      customizeBtn.addEventListener('click', function () {
        openCustomize(section, container);
      });
    }
    var exportBtn = container.querySelector('[data-stats-export]');
    if (exportBtn && spec.export) {
      exportBtn.addEventListener('click', function () {
        try { spec.export.onClick(); } catch (e) {
          var U = ui();
          if (U && typeof U.toastError === 'function') U.toastError(e);
        }
      });
    }
    return container.firstChild;
  }

  // تحديث قيم بطاقات لوحة مرسومة (للقيم غير المتزامنة أو التغيرات
  // الحية كتسجيل الحضور) — بلا إعادة رسم كاملة.
  function updateMetrics(container, metrics) {
    if (!container || !metrics) return;
    var spec = container._statsSpec || {};
    var section = spec.section || '';
    if (spec.metrics) {
      Object.keys(metrics).forEach(function (id) { spec.metrics[id] = metrics[id]; });
    }
    Object.keys(metrics).forEach(function (id) {
      var card = container.querySelector('[data-metric="' + id + '"] .stat-num');
      if (card) {
        var text = fmtValue(section, id, metrics[id]);
        card.textContent = text;
        applyNumStyle(card, text);
      }
    });
  }

  // نافذة «تخصيص»: اختيار المقاييس الظاهرة في لوحة القسم.
  // تُحفظ على الجهاز فقط؛ بعد الحفظ تُعاد رسم اللوحة نفسها.
  function openCustomize(section, container) {
    var U = ui();
    if (!U || typeof U.openModal !== 'function') return null;
    var defs = metricDefs(section);
    var visible = getVisible(section);
    var body = '<div class="muted" style="margin-bottom:12px">اختر المقاييس التي تظهر في لوحة الإحصاءات — تُحفظ اختياراتك على هذا الجهاز فقط.</div>';
    if (!defs.length) {
      body += '<div class="muted">لا مقاييس متاحة لهذا القسم.</div>';
    } else {
      defs.forEach(function (d) {
        body += '<label class="check-row"><input type="checkbox" data-stats-metric="' + escapeHtml(d.id) + '"' +
          (visible.indexOf(d.id) !== -1 ? ' checked' : '') + '> ' + escapeHtml(d.label) + '</label>';
      });
    }
    var modal = U.openModal({
      title: 'تخصيص الإحصاءات',
      width: 'normal',
      bodyHTML: body,
      actions: [
        {
          label: 'حفظ',
          className: '',
          onClick: function (close) {
            var ids = [];
            if (modal.element) {
              modal.element.querySelectorAll('[data-stats-metric]').forEach(function (cb) {
                if (cb.checked) ids.push(cb.getAttribute('data-stats-metric'));
              });
            }
            setVisible(section, ids);
            close();
            if (container && container._statsSpec) renderPanel(container, container._statsSpec);
            if (U && typeof U.toast === 'function') U.toast('تم حفظ تخصيص الإحصاءات', 'success');
          }
        },
        {
          label: 'استعادة الافتراضي',
          className: 'btn-outline',
          onClick: function (close) {
            resetSection(section);
            close();
            if (container && container._statsSpec) renderPanel(container, container._statsSpec);
            if (U && typeof U.toast === 'function') U.toast('تمت استعادة المقاييس الافتراضية', 'success');
          }
        },
        { label: 'إلغاء', className: 'btn-outline', closeOnClick: true }
      ]
    });
    return modal;
  }

  /* ---------- الواجهة العامة ---------- */
  var api = {
    // تعريفات المقاييس + التخصيص
    metricDefs: metricDefs,
    getVisible: getVisible,
    setVisible: setVisible,
    resetSection: resetSection,
    // العرض
    renderPanel: renderPanel,
    updateMetrics: updateMetrics,
    openCustomize: openCustomize,
    // حساب متزامن
    computeDashboard: computeDashboard,
    computeCourses: computeCourses,
    computeCourse: computeCourse,
    computeSession: computeSession,
    computeCalendar: computeCalendar,
    computeDirectory: computeDirectory,
    computeTrainees: computeTrainees,
    computeTrainers: computeTrainers,
    computeTrainer: computeTrainer,
    computeDirectorates: computeDirectorates,
    computeDirectorate: computeDirectorate,
    computeGroups: computeGroups,
    computeGroup: computeGroup,
    computeHalls: computeHalls,
    computeHall: computeHall,
    computePeriods: computePeriods,
    computeLevels: computeLevels,
    computeHolidays: computeHolidays,
    computeExpenses: computeExpenses,
    computeBudget: computeBudget,
    computeMeetings: computeMeetings,
    computeUsers: computeUsers,
    // محوّلات من بُناة App الحالية
    coursesMetricsFromData: coursesMetricsFromData,
    summaryMetricsFromData: summaryMetricsFromData,
    // حضور (غير متزامن)
    courseAttendance: courseAttendance,
    groupAttendance: groupAttendance,
    traineeAttendance: traineeAttendance,
    attendanceByCourse: attendanceByCourse,
    attendanceByGroup: attendanceByGroup,
    attendanceByTrainee: attendanceByTrainee,
    // بيانات التصدير
    exportData: exportData,
    // أدوات
    currentMonthRange: currentMonthRange
  };

  if (typeof window !== 'undefined') {
    window.TadreebStats = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
