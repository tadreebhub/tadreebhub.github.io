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

  // الاسم المعروض لمجموعة التدريب — الصيغة الكاملة مع المعرّف
  // (صفوف الإحصائيات تُصدَّر نصياً) عبر App عند توفره، وإلا
  // اسم الدورة (المنهج).
  // اسم الدورة (المنهج) — يُحلُّ من دليل الدورات عبر App عند
  // توفره (v2.3.1)، وإلا الاسم المخزَّن على المستند.
  function resolvedCourseName(course) {
    var A = app();
    if (course && A && typeof A.courseName === 'function') {
      try { return A.courseName(course) || ''; } catch (e) { /* احتياطي أدناه */ }
    }
    return (course && course.name) || '';
  }

  function groupDisplayName(course) {
    var A = app();
    if (course && A && typeof A.groupDisplayNameFull === 'function') {
      try { return A.groupDisplayNameFull(course); } catch (e) { /* احتياطي أدناه */ }
    }
    if (course && A && typeof A.groupDisplayName === 'function') {
      try { return A.groupDisplayName(course); } catch (e) { /* احتياطي أدناه */ }
    }
    return resolvedCourseName(course);
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
      { id: 'activeCourses', label: 'مجموعات تدريب نشطة', format: 'num' },
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
      { id: 'total', label: 'عدد مجموعات التدريب', format: 'num' },
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
      { id: 'trainersWithoutCourses', label: 'مدربون بلا مجموعات تدريب', format: 'num' },
      { id: 'groupsWithoutCourses', label: 'مجموعات غير معيّنة', format: 'num' },
      { id: 'traineesWithoutCourse', label: 'متدربون بلا مجموعة تدريب', format: 'num' }
    ],
    trainees: [
      { id: 'total', label: 'إجمالي المتدربين', format: 'num' },
      { id: 'inCourses', label: 'مسجلون في مجموعات تدريب', format: 'num' },
      { id: 'withoutCourse', label: 'بلا مجموعة تدريب', format: 'num' },
      { id: 'topDirectorate', label: 'المديرية الأكثر متدربين', format: 'text' }
    ],
    trainers: [
      { id: 'total', label: 'عدد المدربين', format: 'num' },
      { id: 'withCourses', label: 'مدربون لهم مجموعات تدريب', format: 'num' },
      { id: 'withoutCourses', label: 'مدربون بلا مجموعات تدريب', format: 'num' },
      { id: 'totalSessions', label: 'إجمالي الجلسات', format: 'num' },
      { id: 'totalHours', label: 'إجمالي الساعات', format: 'num' },
      { id: 'totalFeesDue', label: 'إجمالي الأجور المستحقة', format: 'money' }
    ],
    trainer: [
      { id: 'courses', label: 'عدد مجموعات التدريب', format: 'num' },
      { id: 'sessions', label: 'عدد الجلسات', format: 'num' },
      { id: 'hours', label: 'إجمالي الساعات', format: 'num' },
      { id: 'trainees', label: 'عدد المتدربين', format: 'num' },
      { id: 'feeDue', label: 'أجور مستحقة', format: 'money' }
    ],
    directorates: [
      { id: 'total', label: 'عدد المديريات', format: 'num' },
      { id: 'trainees', label: 'إجمالي المتدربين', format: 'num' },
      { id: 'groups', label: 'إجمالي المجموعات', format: 'num' },
      { id: 'courses', label: 'إجمالي مجموعات التدريب', format: 'num' },
      { id: 'topDirectorate', label: 'المديرية الأكثر متدربين', format: 'text' }
    ],
    directorate: [
      { id: 'trainees', label: 'عدد المتدربين', format: 'num' },
      { id: 'groups', label: 'عدد المجموعات', format: 'num' },
      { id: 'courses', label: 'عدد مجموعات التدريب', format: 'num' },
      { id: 'sessions', label: 'عدد الجلسات', format: 'num' }
    ],
    groups: [
      { id: 'total', label: 'عدد المجموعات', format: 'num' },
      { id: 'members', label: 'إجمالي الأعضاء', format: 'num' },
      { id: 'courses', label: 'إجمالي مجموعات التدريب', format: 'num' },
      { id: 'emptyGroups', label: 'مجموعات بلا أعضاء', format: 'num' },
      { id: 'groupsWithoutCourses', label: 'مجموعات غير معيّنة', format: 'num' }
    ],
    group: [
      { id: 'members', label: 'عدد الأعضاء', format: 'num' },
      { id: 'courses', label: 'عدد مجموعات التدريب', format: 'num' },
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
      { id: 'courses', label: 'عدد مجموعات التدريب', format: 'num' }
    ],
    periods: [
      { id: 'total', label: 'عدد الفترات', format: 'num' },
      { id: 'sessions', label: 'إجمالي الجلسات', format: 'num' },
      { id: 'busiestPeriod', label: 'الفترة الأكثر استخداماً', format: 'text' },
      { id: 'totalHours', label: 'مجموع ساعات الفترات', format: 'num' }
    ],
    levels: [
      { id: 'total', label: 'عدد المستويات', format: 'num' },
      { id: 'courses', label: 'إجمالي مجموعات التدريب', format: 'num' },
      { id: 'withoutLevel', label: 'مجموعات تدريب بلا مستوى', format: 'num' },
      { id: 'topLevel', label: 'المستوى الأكثر مجموعات تدريب', format: 'text' }
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
      { id: 'topCourse', label: 'مجموعة التدريب الأعلى صرفاً', format: 'text' }
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
    // قيمة نصية جاهزة (كـ «بدون ميزانية») تُعرض كما هي مهما كان
    // تنسيق المقياس — v2.3.1 الميزانية الاختيارية.
    if (typeof value === 'string') return value;
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
      } catch (e) { /* مجموعة تدريب بلا متدربين */ }
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
    var hasBudget = !!(course && course.budget != null && course.budget !== '');
    return {
      hasBudget: hasBudget,
      allocated: hasBudget ? allocated : 0, totalSpent: total, remaining: allocated - total,
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
    var totalBudget = 0, totalSpent = 0, budgetRemaining = 0;
    courses.forEach(function (c) {
      totalBudget += asNum(c.budget);
      // v2.3.1: المتبقي يُجمع من المجموعات ذات الميزانية فقط.
      if (c.budget != null && c.budget !== '') {
        budgetRemaining += asNum(c.budget) - budgetFor(c.id).totalSpent;
      }
    });
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
        budgetRemaining: budgetRemaining
      },
      courses: courses, sessions: sessions, activeCoursesList: active
    };
  }

  /* ---------- 2. مجموعات التدريب (متزامن؛ نسبة الحضور تُملأ من buildCoursesStatsData) ---------- */
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
      // v2.3.1: المتبقي يُجمع من المجموعات ذات الميزانية فقط.
      if (b.hasBudget) remainingTotal += b.remaining;
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

  /* ---------- 3. مجموعة تدريب واحدة (متزامن؛ نسبة الحضور عبر courseAttendance) ---------- */
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
        budget: b.hasBudget ? b.allocated : 'بدون ميزانية',
        spent: b.totalSpent,
        budgetRemaining: b.hasBudget ? b.remaining : 'بدون ميزانية',
        spentPct: b.hasBudget ? pct(b.totalSpent, b.allocated) : 'بدون ميزانية',
        hallsUsed: Object.keys(halls).length,
        feeDue: course ? trainerFeeFor(course) : 0
      },
      course: course, progress: prog, budget: b
    };
  }

  /* ---------- 4. جلسة واحدة — من خريطة حضور محمّلة (متزامن تماماً) ----------
   * attMap: {traineeId: {status, note}} كما تُعيد
   * TadreebDB.getSessionAttendance؛ trainees: قائمة متدربي الدورة؛
   * trainerPresent: true/false/null. تُستخدم داخل تفقد الجلسة حيث
   * الخريطة محمّلة أصلاً — بلا أي قراءة إضافية.
   * v2.3 — دلالات العدّ: «معتذر» (إرثي) و«لم يحضر» (إرثي) يُحسبان
   * ضمن مقام نسبة الحضور (لم يحضرا) ويظهران بعدّيهما الخاصين؛
   * «ملغي» سجل مُبطل يُستثنى من المقام تماماً ويظهر بعدّ خاص.
   * presentRate = موجود ÷ (موجود + غائب + معتذر + لم يحضر). */
  function computeSession(attMap, trainees, trainerPresent) {
    attMap = attMap || {};
    trainees = Array.isArray(trainees) ? trainees : [];
    var present = 0, absent = 0, excused = 0, didNotAttend = 0, cancelled = 0, recorded = 0;
    trainees.forEach(function (t) {
      var rec = attMap[t.id] || {};
      if (rec.status === 'present') { present++; recorded++; }
      else if (rec.status === 'absent') { absent++; recorded++; }
      else if (rec.status === 'excused') { excused++; recorded++; }
      else if (rec.status === 'did-not-attend') { didNotAttend++; recorded++; }
      else if (rec.status === 'cancelled') { cancelled++; }
    });
    var total = trainees.length;
    return {
      metrics: {
        total: total,
        present: present,
        absent: absent,
        excused: excused,
        didNotAttend: didNotAttend,
        cancelled: cancelled,
        unrecorded: Math.max(0, total - recorded - cancelled),
        presentRate: pct(present, recorded),
        recordedRate: pct(recorded + cancelled, total),
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
        courseName = c ? groupDisplayName(c) : '';
      }
      var key = e.courseId || '';
      if (!byCourseMap[key]) byCourseMap[key] = { courseId: key, course: courseName || 'بلا مجموعة تدريب', count: 0, total: 0 };
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

  /* ---------- 16. ميزانية مجموعة تدريب واحدة ---------- */
  function computeBudget(courseId) {
    var b = budgetFor(courseId);
    var topCat = '—', topVal = 0;
    Object.keys(b.byCategory || {}).forEach(function (cat) {
      if (b.byCategory[cat] > topVal) { topVal = b.byCategory[cat]; topCat = cat; }
    });
    return {
      metrics: {
        allocated: b.hasBudget ? b.allocated : 'بدون ميزانية',
        spent: b.totalSpent,
        remaining: b.hasBudget ? b.remaining : 'بدون ميزانية',
        spentPct: b.hasBudget ? pct(b.totalSpent, b.allocated) : 'بدون ميزانية',
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
  // v2.3 — دلالات العدّ كما في computeSession: «معتذر» و«لم يحضر»
  // إرثيان يُحسبان ضمن المقام، و«ملغي» مُبطل يُستثنى من المقام.
  function attendanceForSessions(sessions, trainees) {
    var D = db();
    var counts = { present: 0, absent: 0, excused: 0, didNotAttend: 0, cancelled: 0, recorded: 0 };
    var perSession = [];
    var chain = Promise.resolve();
    var totalTrainees = Array.isArray(trainees) ? trainees.length : 0;
    sessions.forEach(function (s) {
      chain = chain.then(function () {
        if (!D || typeof D.getSessionAttendance !== 'function') return {};
        return D.getSessionAttendance(s.id).catch(function () { return {}; });
      }).then(function (attMap) {
        var c = { present: 0, absent: 0, excused: 0, didNotAttend: 0, cancelled: 0, recorded: 0 };
        Object.keys(attMap || {}).forEach(function (tid) {
          var st = attMap[tid].status;
          if (st === 'present') { c.present++; c.recorded++; }
          else if (st === 'absent') { c.absent++; c.recorded++; }
          else if (st === 'excused') { c.excused++; c.recorded++; }
          else if (st === 'did-not-attend') { c.didNotAttend++; c.recorded++; }
          else if (st === 'cancelled') { c.cancelled++; }
        });
        counts.present += c.present;
        counts.absent += c.absent;
        counts.excused += c.excused;
        counts.didNotAttend += c.didNotAttend;
        counts.cancelled += c.cancelled;
        counts.recorded += c.recorded;
        perSession.push({
          sessionId: s.id, date: s.date || '',
          present: c.present, absent: c.absent, excused: c.excused,
          didNotAttend: c.didNotAttend, cancelled: c.cancelled,
          unrecorded: Math.max(0, totalTrainees - c.recorded - c.cancelled),
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
        didNotAttend: counts.didNotAttend,
        cancelled: counts.cancelled,
        recorded: counts.recorded,
        unrecorded: Math.max(0, sessions.length * totalTrainees - counts.recorded - counts.cancelled),
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
    var counts = { present: 0, absent: 0, excused: 0, didNotAttend: 0, cancelled: 0, recorded: 0 };
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
        else if (rec.status === 'did-not-attend') { counts.didNotAttend++; counts.recorded++; }
        else if (rec.status === 'cancelled') { counts.cancelled++; }
      });
    });
    return chain.then(function () {
      return {
        present: counts.present,
        absent: counts.absent,
        excused: counts.excused,
        didNotAttend: counts.didNotAttend,
        cancelled: counts.cancelled,
        recorded: counts.recorded,
        unrecorded: Math.max(0, sessions.length - counts.recorded - counts.cancelled),
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
    var summary = { present: 0, absent: 0, excused: 0, cancelled: 0, unrecorded: 0, total: 0 };
    var chain = Promise.resolve();
    courses.forEach(function (c) {
      chain = chain.then(function () {
        return courseAttendance(c.id).then(function (res) {
          rows.push({
            name: groupDisplayName(c), present: res.present, absent: res.absent,
            excused: res.excused, cancelled: res.cancelled, unrecorded: res.unrecorded,
            total: res.recorded, rate: res.rate
          });
          summary.present += res.present;
          summary.absent += res.absent;
          summary.excused += res.excused;
          summary.cancelled += res.cancelled;
          summary.unrecorded += res.unrecorded;
          summary.total += res.recorded;
        });
      });
    });
    return chain.then(function () {
      summary.rate = pct(summary.present, summary.total);
      return { scope: 'courses', scopeLabel: 'حسب مجموعة التدريب', rows: rows, summary: summary };
    });
  }

  function attendanceByGroup() {
    var groups = storeAll('groups').slice()
      .sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'ar'); });
    var rows = [];
    var summary = { present: 0, absent: 0, excused: 0, cancelled: 0, unrecorded: 0, total: 0 };
    var chain = Promise.resolve();
    groups.forEach(function (g) {
      chain = chain.then(function () {
        return groupAttendance(g.id).then(function (res) {
          rows.push({
            name: g.name || '', present: res.present, absent: res.absent,
            excused: res.excused, cancelled: res.cancelled, unrecorded: res.unrecorded,
            total: res.recorded, rate: res.rate
          });
          summary.present += res.present;
          summary.absent += res.absent;
          summary.excused += res.excused;
          summary.cancelled += res.cancelled;
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
    var summary = { present: 0, absent: 0, excused: 0, cancelled: 0, unrecorded: 0, total: 0 };
    var chain = Promise.resolve();
    trainees.forEach(function (t) {
      chain = chain.then(function () {
        return traineeAttendance(t.id).then(function (res) {
          rows.push({
            name: t.name || '', present: res.present, absent: res.absent,
            excused: res.excused, cancelled: res.cancelled, unrecorded: res.unrecorded,
            total: res.recorded, rate: res.rate
          });
          summary.present += res.present;
          summary.absent += res.absent;
          summary.excused += res.excused;
          summary.cancelled += res.cancelled;
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
              course: course ? resolvedCourseName(course) : '',
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

  /* ---------- الرسوم البيانية التفاعلية (v2.3 — W5) ----------
   * رسوم SVG مبنية داخل المنصة (لا مكتبات خارجية ولا CDN).
   * تُشتق بيانات كل رسم من دوال compute* الموجودة أصلاً أو من
   * مقاييس اللوحة نفسها — لا منطق عدّ جديد هنا، ولا تُمسّ دوال
   * العدّ (computeSession وcourseAttendance ملك عامل آخر).
   * تُرسم الرسوم داخل renderPanel تحت بطاقات المقاييس، وتُحدَّث
   * عبر refreshCharts عند تغيّر المقاييس (updateMetrics).
   * التفاعل: النقر/التمرير على عنصر يعرض قيمته في سطر التفاصيل؛
   * النقر على شريحة فئة مصروف يدرج مصاريفها (التفصيل الوحيد).
   * الحركة: انتقالات CSS فقط (transform/opacity وخصائص SVG)؛
   * تُعطَّل كلياً عند prefers-reduced-motion (قسم W5 في styles.css).
   * الأقسام بلا رسوم: العطل (قائمة تواريخ لا تقبل الرسم) ولوحات
   * الكيان الواحد (مدرب/مديرية/مجموعة/قاعة — قيمها لا تقارَن). */

  var CHART_PALETTE = ['#081F31', '#1B4F72', '#2E86AB', '#C9A86A', '#5D8AA8', '#7FB3D5', '#1A7A4C', '#B45309'];
  var CHART_ATT_COLORS = { present: '#2E7D32', absent: '#C62828', excused: '#B45309', unrecorded: '#9E9E9E' };
  var CHART_STATE_COLORS = {
    done: '#2E7D32', scheduled: '#081F31', remaining: '#2E86AB', cancelled: '#C62828',
    holiday: '#9E9E9E', trainerAbsent: '#B45309', meetings: '#5D8AA8',
    active: '#2E7D32', completed: '#1B4F72', paused: '#B45309'
  };

  function fmtChartValue(format, value) {
    if (format === 'money') {
      var U = ui();
      if (U && typeof U.fmtMoney === 'function') { try { return U.fmtMoney(value); } catch (e) {} }
      return asNum(value).toLocaleString('en-US') + ' ل.س';
    }
    if (format === 'pct') return asNum(value) + '%';
    return asNum(value).toLocaleString('en-US');
  }

  // نسخة مختصرة للمبالغ داخل الرسم (التفصيل الكامل يظهر عند النقر).
  function fmtChartValueShort(format, value) {
    if (format !== 'money') return fmtChartValue(format, value);
    var v = asNum(value);
    if (v >= 1000000) return (Math.round(v / 100000) / 10) + ' مليون ل.س';
    if (v >= 1000) return (Math.round(v / 100) / 10) + ' ألف ل.س';
    return fmtChartValue('money', v);
  }

  // أيام نطاق YYYY-MM-DD كقائمة تواريخ (سقف 366 يوماً).
  function monthDays(from, to) {
    var days = [];
    var d = from;
    var guard = 0;
    while (d && d <= to && guard++ < 366) {
      days.push(d);
      var parts = d.split('-');
      var dt = new Date(+parts[0], +parts[1] - 1, +parts[2]);
      dt.setDate(dt.getDate() + 1);
      d = dt.getFullYear() + '-' + ('0' + (dt.getMonth() + 1)).slice(-2) + '-' + ('0' + dt.getDate()).slice(-2);
    }
    return days;
  }

  // إعدادات رسوم القسم: [{kind: 'bar'|'donut'|'line', title, items: [{label, value, color?}],
  // format?, unit?, drill?}]. items فارغة أو كلها صفر → رسالة «لا بيانات».
  function chartConfigs(section, spec) {
    spec = spec || {};
    var metrics = spec.metrics || {};
    function m(id) { return asNum(metrics[id]); }
    function itemsFromMetrics(pairs) {
      return pairs.map(function (p) {
        return { label: p[1], value: m(p[0]), color: p[2] || '' };
      });
    }
    function topItems(rows, labelKey, valueKey, n) {
      return rows.slice().sort(function (a, b) { return asNum(b[valueKey]) - asNum(a[valueKey]); })
        .slice(0, n || 6).map(function (r) {
          return { label: r[labelKey] || '', value: asNum(r[valueKey]) };
        });
    }
    switch (section) {
      case 'dashboard': {
        var dash = computeDashboard();
        var range = currentMonthRange();
        var days = monthDays(range.from, range.to);
        var perDay = {};
        (dash.sessions || []).forEach(function (s) {
          if (!occupies(s)) return;
          perDay[s.date] = (perDay[s.date] || 0) + 1;
        });
        var U = ui();
        var lineItems = days.map(function (d) {
          var label = d;
          if (U && typeof U.fmtDateFull === 'function') { try { label = U.fmtDateFull(d); } catch (e) {} }
          return { label: label, short: String(+d.slice(8, 10)), value: perDay[d] || 0 };
        });
        return [
          { kind: 'line', title: 'الجلسات عبر أيام الشهر الحالي', items: lineItems, format: 'num', unit: 'جلسة' },
          { kind: 'donut', title: 'الميزانية: المصروف مقابل المتبقي', format: 'money', items: [
            { label: 'المصروف', value: m('totalSpent'), color: '#1B4F72' },
            { label: 'المتبقي', value: Math.max(0, m('budgetRemaining')), color: '#C9A86A' }
          ] }
        ];
      }
      case 'courses': {
        var courseRows = storeAll('courses').map(function (c) {
          return { name: resolvedCourseName(c), sessions: sessionsForCourse(c.id).filter(occupies).length };
        });
        return [
          { kind: 'bar', title: 'الجلسات لكل مجموعة تدريب', items: topItems(courseRows, 'name', 'sessions', 6), format: 'num', unit: 'جلسة' },
          { kind: 'donut', title: 'مجموعات التدريب حسب الحالة', items: itemsFromMetrics([
            ['active', 'جارية', CHART_STATE_COLORS.active],
            ['completed', 'مكتملة', CHART_STATE_COLORS.completed],
            ['paused', 'متوقفة', CHART_STATE_COLORS.paused],
            ['cancelled', 'ملغاة', CHART_STATE_COLORS.cancelled]
          ]) }
        ];
      }
      case 'course':
        return [{ kind: 'donut', title: 'جلسات مجموعة التدريب حسب الحالة', items: itemsFromMetrics([
          ['done', 'مكتملة', CHART_STATE_COLORS.done],
          ['remaining', 'متبقية', CHART_STATE_COLORS.remaining],
          ['cancelled', 'ملغاة', CHART_STATE_COLORS.cancelled]
        ]) }];
      case 'session':
      case 'attendance':
        return [{ kind: 'donut', title: 'توزيع الحضور', items: itemsFromMetrics([
          ['present', 'موجود', CHART_ATT_COLORS.present],
          ['absent', 'غائب', CHART_ATT_COLORS.absent],
          ['excused', 'معتذر', CHART_ATT_COLORS.excused],
          ['unrecorded', 'بلا تسجيل', CHART_ATT_COLORS.unrecorded]
        ]) }];
      case 'calendar':
        // من المقاييس نفسها — صحيحة لأي نطاق يعرضه التقويم.
        return [{ kind: 'bar', title: 'الجلسات والاجتماعات حسب الحالة', items: itemsFromMetrics([
          ['done', 'مكتملة', CHART_STATE_COLORS.done],
          ['scheduled', 'مجدولة', CHART_STATE_COLORS.scheduled],
          ['cancelled', 'ملغاة', CHART_STATE_COLORS.cancelled],
          ['trainerAbsent', 'غياب مدرب', CHART_STATE_COLORS.trainerAbsent],
          ['holiday', 'عطلة', CHART_STATE_COLORS.holiday],
          ['meetings', 'اجتماعات عارضة', CHART_STATE_COLORS.meetings]
        ]) }];
      case 'directory':
        return [{ kind: 'bar', title: 'محتويات الدليل', items: itemsFromMetrics([
          ['trainers', 'مدربون', ''],
          ['trainees', 'متدربون', ''],
          ['directorates', 'مديريات', ''],
          ['groups', 'مجموعات تدريبية', ''],
          ['halls', 'قاعات', '']
        ]) }];
      case 'trainees': {
        var tr = computeTrainees();
        return [{ kind: 'bar', title: 'المتدربون حسب المديرية', items: topItems(tr.rows || [], 'directorate', 'count', 6), format: 'num', unit: 'متدرب' }];
      }
      case 'trainers': {
        var tn = computeTrainers();
        return [{ kind: 'bar', title: 'الجلسات لكل مدرب', items: topItems(tn.rows || [], 'name', 'sessions', 6), format: 'num', unit: 'جلسة' }];
      }
      case 'directorates': {
        var dr = computeDirectorates();
        return [{ kind: 'bar', title: 'المتدربون لكل مديرية', items: topItems(dr.rows || [], 'name', 'trainees', 6), format: 'num', unit: 'متدرب' }];
      }
      case 'groups': {
        var gr = computeGroups();
        return [{ kind: 'bar', title: 'الأعضاء لكل مجموعة', items: topItems(gr.rows || [], 'name', 'members', 6), format: 'num', unit: 'عضو' }];
      }
      case 'halls': {
        var ha = computeHalls();
        return [{ kind: 'bar', title: 'الجلسات لكل قاعة', items: topItems(ha.rows || [], 'name', 'sessions', 6), format: 'num', unit: 'جلسة' }];
      }
      case 'periods': {
        var pr = computePeriods();
        return [{ kind: 'bar', title: 'الجلسات لكل فترة', items: topItems(pr.rows || [], 'label', 'sessions', 6), format: 'num', unit: 'جلسة' }];
      }
      case 'levels': {
        var lv = computeLevels();
        return [{ kind: 'bar', title: 'مجموعات التدريب لكل مستوى', items: topItems(lv.rows || [], 'level', 'courses', 6), format: 'num', unit: 'مجموعة تدريب' }];
      }
      case 'expenses': {
        var ex = computeExpenses();
        return [
          { kind: 'donut', title: 'المصروف حسب الفئة', format: 'money', drill: 'expenses-category',
            items: (ex.byCategory || []).map(function (r) { return { label: r.category, value: r.total }; }) },
          { kind: 'bar', title: 'المصروف حسب مجموعة التدريب', format: 'money',
            items: topItems(ex.byCourse || [], 'course', 'total', 6) }
        ];
      }
      case 'budget':
        // v2.3.1: بلا ميزانية لا معنى لمخطط المصروف/المتبقي.
        if (typeof metrics.allocated === 'string') return [];
        return [{ kind: 'donut', title: 'الميزانية: المصروف مقابل المتبقي', format: 'money', items: [
          { label: 'المصروف', value: m('spent'), color: '#1B4F72' },
          { label: 'المتبقي', value: Math.max(0, m('remaining')), color: '#C9A86A' }
        ] }];
      case 'meetings':
        return [{ kind: 'donut', title: 'الاجتماعات حسب الحالة', items: itemsFromMetrics([
          ['scheduled', 'مجدولة', CHART_STATE_COLORS.scheduled],
          ['cancelled', 'ملغاة', CHART_STATE_COLORS.cancelled]
        ]) }];
      case 'users':
        return [{ kind: 'donut', title: 'المستخدمون حسب الدور', items: itemsFromMetrics([
          ['admins', 'مدراء', '#081F31'],
          ['editors', 'محررون', '#2E86AB'],
          ['viewers', 'عارضون', '#7FB3D5']
        ]) }];
      default:
        return [];
    }
  }

  /* ----- رسم الرسم الواحد (HTML نصي؛ الأحداث بالتفويض في wireCharts) ----- */

  // أعمدة أفقية: التسمية يميناً والأعمدة تنمو يساراً (RTL).
  // viewBox ثابت 320 — يتقلص مع البطاقة بلا فيض أفقي.
  var CHART_BAR_LABEL_X = 314, CHART_BAR_RIGHT = 204, CHART_BAR_MAXW = 170, CHART_BAR_ROW = 32;

  function renderBarChart(cfg) {
    var items = cfg.items || [];
    var max = 1;
    items.forEach(function (it) { max = Math.max(max, asNum(it.value)); });
    var h = items.length * CHART_BAR_ROW + 8;
    var html = '<svg class="chart-svg chart-svg-bar" viewBox="0 0 320 ' + h + '" role="img" aria-label="' + escapeHtml(cfg.title) + '">';
    html += '<line x1="' + CHART_BAR_RIGHT + '" y1="4" x2="' + CHART_BAR_RIGHT + '" y2="' + (h - 4) + '" class="chart-axis" />';
    items.forEach(function (it, i) {
      var v = asNum(it.value);
      var w = Math.max(2, Math.round((v / max) * CHART_BAR_MAXW));
      var y = 4 + i * CHART_BAR_ROW;
      var color = it.color || CHART_PALETTE[i % CHART_PALETTE.length];
      var label = String(it.label || '');
      // v2.3.1: حد الاقتطاع 18 حرفاً بدل 13 — أسماء المجموعات
      // («مجموعة تدريب 2 — …») كانت تُقتطع إلى حدود غير مقروءة؛
      // الاسم الكامل في <title> و aria-label كما قبل.
      var shortLabel = label.length > 18 ? label.slice(0, 17) + '…' : label;
      var valText = fmtChartValueShort(cfg.format || 'num', v);
      var fullText = fmtChartValue(cfg.format || 'num', v);
      // القيمة داخل العمود إن اتسع، وإلا خارجه يساراً.
      var inside = w >= 84;
      var valX = inside ? CHART_BAR_RIGHT - 6 : CHART_BAR_RIGHT - w - 6;
      var valCls = inside ? 'chart-value chart-value-in' : 'chart-value';
      html += '<g class="chart-item chart-bar-row" data-chart-item="' + i + '" tabindex="0" role="button" aria-label="' + escapeHtml(label + ': ' + fullText) + '">' +
        '<title>' + escapeHtml(label + ': ' + fullText) + '</title>' +
        '<text x="' + CHART_BAR_LABEL_X + '" y="' + (y + 20) + '" class="chart-label" text-anchor="end">' + escapeHtml(shortLabel) + '</text>' +
        '<rect class="chart-bar" x="' + (CHART_BAR_RIGHT - w) + '" y="' + (y + 6) + '" width="' + w + '" height="20" rx="4" fill="' + color + '" style="transition-delay:' + (i * 70) + 'ms" />' +
        '<text x="' + valX + '" y="' + (y + 20) + '" class="' + valCls + '" text-anchor="end" style="transition-delay:' + (i * 70 + 150) + 'ms">' + escapeHtml(valText) + '</text>' +
        '</g>';
    });
    html += '</svg>';
    return html;
  }

  // دائري مجوّف: دوائر pathLength=100 + وسيلة إيضاح HTML قابلة للنقر.
  // القيم النهائية للشرائح في متغيرات CSS (--fd/--fo) يفعّلها صنف chart-in.
  function renderDonutChart(cfg) {
    var items = cfg.items || [];
    var total = 0;
    items.forEach(function (it) { total += asNum(it.value); });
    // نص الإجمالي في المنتصف: مختصر بلا عملة، وحجم خط يصغر مع
    // طول النص حتى لا يفيض خارج ثقب الدائرة (قطره 90).
    var centerText = fmtChartValueShort(cfg.format || 'num', total);
    if (cfg.format === 'money') centerText = centerText.replace(' ل.س', '');
    var centerSize = centerText.length > 9 ? 11 : (centerText.length > 6 ? 13 : 15);
    var html = '<div class="chart-donut-wrap"><svg class="chart-svg chart-svg-donut" viewBox="0 0 150 150" role="img" aria-label="' + escapeHtml(cfg.title) + '">';
    var start = 0;
    items.forEach(function (it, i) {
      var v = asNum(it.value);
      var pctVal = total > 0 ? (v / total) * 100 : 0;
      var color = it.color || CHART_PALETTE[i % CHART_PALETTE.length];
      var gap = pctVal > 0 ? 0.8 : 0;
      var len = Math.max(0, pctVal - gap);
      var valText = fmtChartValue(cfg.format || 'num', v);
      html += '<circle class="chart-item chart-seg" data-chart-item="' + i + '" tabindex="0" role="button" aria-label="' + escapeHtml(it.label + ': ' + valText) + '" cx="75" cy="75" r="58" fill="none" stroke="' + color + '" stroke-width="26" pathLength="100" transform="rotate(-90 75 75)" style="--fd:' + len.toFixed(2) + ' 100;--fo:' + (-start).toFixed(2) + ';transition-delay:' + (i * 90) + 'ms"><title>' + escapeHtml(it.label + ': ' + valText) + '</title></circle>';
      start += pctVal;
    });
    html += '<text x="75" y="72" text-anchor="middle" class="chart-donut-total" style="font-size:' + centerSize + 'px">' + escapeHtml(centerText) + '</text>' +
      '<text x="75" y="88" text-anchor="middle" class="chart-donut-total-label">الإجمالي</text></svg>';
    html += '<ul class="chart-legend">';
    items.forEach(function (it, i) {
      var color = it.color || CHART_PALETTE[i % CHART_PALETTE.length];
      html += '<li class="chart-item chart-legend-item" data-chart-item="' + i + '" tabindex="0" role="button"><span class="chart-dot" style="background:' + color + '"></span><span class="chart-legend-label">' + escapeHtml(it.label) + '</span><span class="chart-legend-value">' + escapeHtml(fmtChartValueShort(cfg.format || 'num', asNum(it.value))) + '</span></li>';
    });
    html += '</ul></div>';
    return html;
  }

  // خطي: الزمن يجري من اليمين (الأقدم) إلى اليسار (الأحدث) — RTL.
  function renderLineChart(cfg) {
    var items = cfg.items || [];
    var n = items.length;
    var max = 1;
    items.forEach(function (it) { max = Math.max(max, asNum(it.value)); });
    var PL = 30, PR = 312, PT = 10, PB = 158;
    var step = n > 1 ? (PR - PL) / (n - 1) : 0;
    function px(i) { return PR - i * step; }
    function py(v) { return PT + (PB - PT) * (1 - v / max); }
    var pts = items.map(function (it, i) { return { x: px(i), y: py(asNum(it.value)) }; });
    var linePath = pts.map(function (p, i) { return (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' ');
    var areaPath = linePath + ' L' + pts[n - 1].x.toFixed(1) + ' ' + PB + ' L' + pts[0].x.toFixed(1) + ' ' + PB + ' Z';
    var html = '<svg class="chart-svg chart-svg-line" viewBox="0 0 320 180" role="img" aria-label="' + escapeHtml(cfg.title) + '">';
    [0, 0.5, 1].forEach(function (f) {
      var y = PT + (PB - PT) * (1 - f);
      html += '<line x1="' + PL + '" y1="' + y.toFixed(1) + '" x2="' + PR + '" y2="' + y.toFixed(1) + '" class="chart-grid" />';
      html += '<text x="' + (PL - 4) + '" y="' + (y + 3).toFixed(1) + '" class="chart-axis-label" text-anchor="end">' + Math.round(max * f) + '</text>';
    });
    html += '<path class="chart-area" d="' + areaPath + '" />';
    html += '<path class="chart-line-path" d="' + linePath + '" fill="none" />';
    var k = Math.max(1, Math.ceil(n / 6));
    items.forEach(function (it, i) {
      if (i % k !== 0 && i !== n - 1) return;
      html += '<text x="' + px(i).toFixed(1) + '" y="174" class="chart-axis-label" text-anchor="middle">' + escapeHtml(it.short || it.label) + '</text>';
    });
    items.forEach(function (it, i) {
      var valText = fmtChartValue(cfg.format || 'num', asNum(it.value));
      html += '<g class="chart-item chart-point" data-chart-item="' + i + '" tabindex="0" role="button" aria-label="' + escapeHtml(it.label + ': ' + valText) + '" style="transition-delay:' + (i * 25 + 300) + 'ms">' +
        '<title>' + escapeHtml(it.label + ': ' + valText) + '</title>' +
        '<circle cx="' + pts[i].x.toFixed(1) + '" cy="' + pts[i].y.toFixed(1) + '" r="14" class="chart-hit" />' +
        '<circle cx="' + pts[i].x.toFixed(1) + '" cy="' + pts[i].y.toFixed(1) + '" r="4" class="chart-dot-pt" /></g>';
    });
    html += '</svg>';
    return html;
  }

  function chartBlockHtml(cfg, index) {
    var items = cfg.items || [];
    var hasData = items.some(function (it) { return asNum(it.value) > 0; });
    var html = '<div class="chart-block" data-chart-block data-chart-index="' + index + '" data-chart-kind="' + cfg.kind + '"' +
      (cfg.drill ? ' data-chart-drill="' + cfg.drill + '"' : '') + '>' +
      '<h3 class="chart-title">' + escapeHtml(cfg.title) + '</h3>';
    if (!hasData || !items.length) {
      html += '<div class="muted chart-empty">لا بيانات كافية لعرض الرسم البياني.</div></div>';
      return html;
    }
    if (cfg.kind === 'bar') html += renderBarChart(cfg);
    else if (cfg.kind === 'donut') html += renderDonutChart(cfg);
    else if (cfg.kind === 'line') html += renderLineChart(cfg);
    html += '<div class="chart-detail" role="status">انقر على أي عنصر لعرض التفاصيل.</div>';
    if (cfg.drill) html += '<div class="chart-drill" hidden></div>';
    html += '</div>';
    return html;
  }

  function renderChartsHtml(configs) {
    if (!configs || !configs.length) return '';
    var html = '<div class="stats-charts">';
    configs.forEach(function (cfg, i) { html += chartBlockHtml(cfg, i); });
    html += '</div>';
    return html;
  }

  /* ----- التفاعل والحركة ----- */

  function chartDetailText(cfg, it) {
    var text = it.label + ': ' + fmtChartValue(cfg.format || 'num', asNum(it.value));
    if (cfg.unit) text += ' ' + cfg.unit;
    if (cfg.kind === 'donut') {
      var total = 0;
      (cfg.items || []).forEach(function (x) { total += asNum(x.value); });
      if (total > 0) text += ' (' + pct(asNum(it.value), total) + '%)';
    }
    return text;
  }

  function closeChartDrill(block) {
    if (!block) return;
    var drill = block.querySelector('.chart-drill');
    if (drill) { drill.hidden = true; drill.innerHTML = ''; }
  }

  // التفصيل الوحيد: النقر على فئة مصروف يدرج مصاريفها (8 كحد أقصى).
  function renderExpenseDrill(block, category) {
    var drill = block.querySelector('.chart-drill');
    if (!drill) return;
    var rows = storeAll('expenses').filter(function (e) { return (e.category || 'بلا فئة') === category; })
      .sort(function (a, b) { return (b.date || '') < (a.date || '') ? -1 : 1; });
    var total = 0;
    rows.forEach(function (e) { total += asNum(e.amount); });
    var U = ui();
    var html = '<div class="chart-drill-head"><strong>مصاريف فئة «' + escapeHtml(category) + '»</strong>' +
      '<button class="btn btn-outline btn-sm" type="button" data-chart-drill-close>إغلاق</button></div>';
    if (!rows.length) {
      html += '<div class="muted">لا مصاريف في هذه الفئة.</div>';
    } else {
      html += '<ul class="chart-drill-list">';
      rows.slice(0, 8).forEach(function (e) {
        var dateText = e.date || '';
        if (U && typeof U.fmtDateFull === 'function') { try { dateText = U.fmtDateFull(e.date); } catch (err) {} }
        html += '<li><span class="chart-drill-desc">' + escapeHtml(e.description || '') + '</span>' +
          '<span class="muted chart-drill-date">' + escapeHtml(dateText) + '</span>' +
          '<span class="chart-drill-amount">' + escapeHtml(fmtChartValue('money', asNum(e.amount))) + '</span></li>';
      });
      html += '</ul>';
      if (rows.length > 8) html += '<div class="muted">و' + (rows.length - 8) + ' مصروف آخر في هذه الفئة.</div>';
      html += '<div class="chart-drill-total">الإجمالي: ' + escapeHtml(fmtChartValue('money', total)) + '</div>';
    }
    drill.innerHTML = html;
    drill.hidden = false;
  }

  // معاينة عند التمرير: إبراز مؤقت (.hov) + عرض القيمة، بلا
  // تحديد وبلا تفصيل — التحديد (.sel) بالنقر فقط، حتى لا يلغي
  // التمريرُ النقرةَ التي تليه (التمرير يسبق النقر دائماً).
  function previewChartItem(container, item) {
    var block = item.closest ? item.closest('[data-chart-block]') : null;
    if (!block) return;
    var configs = container._statsCharts || [];
    var cfg = configs[+block.getAttribute('data-chart-index')];
    if (!cfg) return;
    var idx = +item.getAttribute('data-chart-item');
    var it = (cfg.items || [])[idx];
    if (!it) return;
    block.querySelectorAll('[data-chart-item].hov').forEach(function (el) { el.classList.remove('hov'); });
    block.querySelectorAll('[data-chart-item="' + idx + '"]').forEach(function (el) { el.classList.add('hov'); });
    var detail = block.querySelector('.chart-detail');
    if (detail) detail.textContent = chartDetailText(cfg, it);
  }

  // استعادة سطر التفاصيل بعد مغادرة الرسم: قيمة المحدَّد بالنقر
  // إن وُجد، وإلا النص الافتراضي.
  function restoreChartDetail(container, block) {
    if (!block) return;
    block.querySelectorAll('[data-chart-item].hov').forEach(function (el) { el.classList.remove('hov'); });
    var detail = block.querySelector('.chart-detail');
    if (!detail) return;
    var sel = block.querySelector('[data-chart-item].sel');
    if (!sel) { detail.textContent = 'انقر على أي عنصر لعرض التفاصيل.'; return; }
    var configs = container._statsCharts || [];
    var cfg = configs[+block.getAttribute('data-chart-index')];
    var it = cfg && (cfg.items || [])[+sel.getAttribute('data-chart-item')];
    if (cfg && it) detail.textContent = chartDetailText(cfg, it);
  }

  function selectChartItem(container, item) {
    var block = item.closest ? item.closest('[data-chart-block]') : null;
    if (!block) return;
    var configs = container._statsCharts || [];
    var cfg = configs[+block.getAttribute('data-chart-index')];
    if (!cfg) return;
    var idx = +item.getAttribute('data-chart-item');
    var it = (cfg.items || [])[idx];
    if (!it) return;
    var already = item.classList.contains('sel');
    block.querySelectorAll('[data-chart-item].sel').forEach(function (el) { el.classList.remove('sel'); });
    var detail = block.querySelector('.chart-detail');
    if (already) {
      if (detail) detail.textContent = 'انقر على أي عنصر لعرض التفاصيل.';
      closeChartDrill(block);
      return;
    }
    block.querySelectorAll('[data-chart-item="' + idx + '"]').forEach(function (el) { el.classList.add('sel'); });
    if (detail) detail.textContent = chartDetailText(cfg, it);
    if (cfg.drill === 'expenses-category') renderExpenseDrill(block, it.label);
  }

  function onChartEvent(container, e, kind) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (kind === 'click') {
      var closeBtn = t.closest('[data-chart-drill-close]');
      if (closeBtn) {
        closeChartDrill(closeBtn.closest('[data-chart-block]'));
        return;
      }
    }
    var item = t.closest('[data-chart-item]');
    if (!item) return;
    if (kind === 'hover') {
      var block = item.closest('[data-chart-block]');
      var key = (block ? block.getAttribute('data-chart-index') : '?') + ':' + item.getAttribute('data-chart-item');
      if (container._statsHoverKey === key) return;
      container._statsHoverKey = key;
      previewChartItem(container, item);
      return;
    }
    selectChartItem(container, item);
  }

  // ربط أحداث الرسوم (تفويض على الحاوية — يبقى بعد إعادة رسم
  // الرسوم) + تشغيل الحركة بإضافة صنف chart-in بعد الإطار الأول.
  function wireCharts(container) {
    if (!container || typeof document === 'undefined') return;
    if (!container._statsChartsWired) {
      container._statsChartsWired = true;
      container.addEventListener('click', function (e) { onChartEvent(container, e, 'click'); });
      container.addEventListener('mouseover', function (e) { onChartEvent(container, e, 'hover'); });
      container.addEventListener('mouseout', function (e) {
        var item = e.target && e.target.closest ? e.target.closest('[data-chart-item]') : null;
        if (!item) return;
        var block = item.closest('[data-chart-block]');
        var rel = e.relatedTarget;
        if (rel && rel.closest && rel.closest('[data-chart-block]') === block) return;
        container._statsHoverKey = null;
        restoreChartDetail(container, block);
      });
      container.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var item = e.target && e.target.closest ? e.target.closest('[data-chart-item]') : null;
        if (!item) return;
        e.preventDefault();
        selectChartItem(container, item);
      });
    }
    // الخط البياني: إخفاؤه أولاً (dashoffset = الطول) ثم رسمه
    // تدريجياً عند تشغيل الحركة. عند reduced-motion لا انتقال
    // فيظهر فوراً (انظر styles.css).
    container.querySelectorAll('.chart-line-path:not([data-chart-prepped])').forEach(function (path) {
      path.setAttribute('data-chart-prepped', '1');
      try {
        var len = path.getTotalLength();
        path.style.strokeDasharray = String(len);
        path.style.strokeDashoffset = String(len);
      } catch (e) { /* بلا رسم تدريجي */ }
    });
    function animate() {
      container.querySelectorAll('.chart-block:not(.chart-in)').forEach(function (block) {
        block.classList.add('chart-in');
      });
      container.querySelectorAll('.chart-line-path[data-chart-prepped]').forEach(function (path) {
        path.style.strokeDashoffset = '0';
      });
    }
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(function () { requestAnimationFrame(animate); });
    }
    setTimeout(animate, 200);
  }

  // إعادة رسم رسوم لوحة مرسومة (بعد updateMetrics) — من المواصفات
  // المحفوظة نفسها، بلا مساس ببطاقات المقاييس.
  function refreshCharts(container) {
    if (!container || !container._statsSpec) return;
    var spec = container._statsSpec;
    var configs = [];
    try { configs = chartConfigs(spec.section || '', spec) || []; } catch (e) { configs = []; }
    container._statsCharts = configs;
    var wrap = container.querySelector('.stats-charts');
    // حفظ التحديد الحالي قبل إعادة الرسم لاستعادته بعده (حتى لا
    // يضيع اختيار المستخدم عند وصول مقياس غير متزامن).
    var prevSel = {};
    if (wrap) {
      wrap.querySelectorAll('[data-chart-block]').forEach(function (b) {
        var sel = b.querySelector('[data-chart-item].sel');
        if (sel) prevSel[b.getAttribute('data-chart-index')] = sel.getAttribute('data-chart-item');
      });
    }
    var html = renderChartsHtml(configs);
    if (!html) {
      if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
      return;
    }
    if (wrap) {
      wrap.outerHTML = html;
    } else {
      var panel = container.querySelector('.stats-panel');
      if (panel) panel.insertAdjacentHTML('beforeend', html);
    }
    wireCharts(container);
    Object.keys(prevSel).forEach(function (ci) {
      var block = container.querySelector('[data-chart-block][data-chart-index="' + ci + '"]');
      if (!block) return;
      var item = block.querySelector('[data-chart-item="' + prevSel[ci] + '"]');
      if (item) selectChartItem(container, item);
    });
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
      '<div class="head-actions tools-bar">' +
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
    // الرسوم البيانية التفاعلية (v2.3 — W5): تحت بطاقات المقاييس
    // داخل اللوحة نفسها؛ بياناتها من compute* أو من المقاييس.
    var chartCfgs = [];
    try { chartCfgs = chartConfigs(section, spec) || []; } catch (e) { chartCfgs = []; }
    container._statsCharts = chartCfgs;
    html += renderChartsHtml(chartCfgs);
    html += '</div>';

    container.innerHTML = html;
    wireCharts(container);

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
    // الرسوم تعتمد على المقاييس نفسها — تُحدَّث معها (v2.3 — W5).
    refreshCharts(container);
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
