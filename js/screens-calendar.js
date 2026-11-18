// تدريب — شاشة رزنامة القاعات (يوم / أسبوع / شهر / نطاق مخصص).
// تُسجَّل في window.Screens.calendar.
(function () {
  'use strict';

  var state = {
    view: 'week',
    weekStart: null, // تاريخ الأحد (YYYY-MM-DD)
    monthYear: null, // {year, month}
    monthLabel: '',
    dayDate: null, // تاريخ عرض اليوم (YYYY-MM-DD)
    rangeFrom: null, // بداية النطاق المخصص (YYYY-MM-DD)
    rangeTo: null // نهاية النطاق المخصص (YYYY-MM-DD)
  };

  // فلاتر الرزنامة (تبقى عبر تبديل العروض).
  var filterState = { courseId: '', hallId: '', trainerId: '' };

  // تنسيق الأوقات بنظام 12 ساعة مع ص/م (v2.1 — بند 8) عبر
  // window.TadreebTime.formatTime12/formatTimeRange12، مع عودة
  // إلى التنسيق الحالي (24 ساعة) إن لم تتوفر الدوال بعد — فلا
  // يتعطل العرض أبداً. النطاق يُغلَّف بـ .ltr (كما في
  // UI.fmtTimeRange) حتى لا يعيد اتجاه الصفحة ترتيب الوقتين.
  function fmtTime12(hhmm) {
    try {
      if (window.TadreebTime && typeof window.TadreebTime.formatTime12 === 'function') {
        return window.TadreebTime.formatTime12(hhmm);
      }
    } catch (e) { /* يعود إلى الاحتياطي أدناه */ }
    return hhmm || '';
  }
  function fmtRange12(start, end) {
    if (!start || !end) return '';
    try {
      if (window.TadreebTime && typeof window.TadreebTime.formatTimeRange12 === 'function') {
        return '<span class="ltr">' + UI.escapeHtml(window.TadreebTime.formatTimeRange12(start, end)) + '</span>';
      }
    } catch (e) { /* يعود إلى الاحتياطي أدناه */ }
    return UI.fmtTimeRange(start, end);
  }
  // نص الفترة داخل <option> (لا HTML فيه): النطاق محاط بعلامتي
  // تضمين اتجاه (LRE…PDF) حتى يبقى ترتيب الوقتين صحيحاً داخل
  // القائمة المنسدلة ذات الاتجاه RTL.
  function fmtPeriodOptionLabel(p) {
    return p.label + ' (' + '\u202A' + fmtTime12(p.start) + ' - ' + fmtTime12(p.end) + '\u202C)';
  }

  // عرض توفر القاعات لكل قاعة على حدة (v2.2): اسم القاعة + حالة
  // (متاحة / مشغولة — باسم الدورة أو الاجتماع). صفوف
  // checkHallAvailability. isSelfHall اختياري (قاعة الاجتماع نفسه
  // عند التعديل تُعامل كمتاحة).
  function hallAvailabilityListHtml(rows, isSelfHall) {
    if (!rows.length) return 'لا قاعات مسجلة.';
    return rows.map(function (r) {
      var self = isSelfHall ? isSelfHall(r) : false;
      if (r.free || self) {
        return '<div>' + UI.escapeHtml(r.hallName) + ' <span class="pill pill-green">متاحة</span></div>';
      }
      return '<div>' + UI.escapeHtml(r.hallName) + ' <span class="pill pill-red">مشغولة' +
        (r.sessionCourse ? ' — ' + UI.escapeHtml(r.sessionCourse) : '') + '</span></div>';
    }).join('');
  }

  // اختار المستخدم عرضاً يدوياً في هذه الزيارة؟ عندها يتوقف تطبيق
  // العرض الافتراضي من الإعدادات حتى زيارة جديدة (إعادة تحميل الصفحة).
  var userPickedView = false;

  // الجلسة تطابق كل فلاتر الدورة/القاعة/المدرب؛ الاجتماع يطابق
  // فلتر القاعة فقط (بلا دورة أو مدرب)، ففلتر الدورة أو المدرب يخفيه.
  function sessionMatchesFilter(s) {
    if (filterState.courseId && s.courseId !== filterState.courseId) return false;
    if (filterState.hallId && s.hallId !== filterState.hallId) return false;
    if (filterState.trainerId) {
      var c = App.Store.get('courses', s.courseId);
      if (!c || c.trainerId !== filterState.trainerId) return false;
    }
    return true;
  }

  function meetingMatchesFilter(m) {
    if (filterState.courseId || filterState.trainerId) return false;
    if (filterState.hallId && m.hallId !== filterState.hallId) return false;
    return true;
  }

  // ---------- مساعدات v2.3 (عرض الرزنامة) ----------

  // آخر حاوية رُسمت فيها الرزنامة (لإعادة الرسم عند وصول أيام
  // العطلة الأسبوعية غير المتزامنة، ولفتح عرض اليوم من أي مكان).
  var lastContainer = null;

  // أيام العطلة الأسبوعية: افتراضياً الجمعة + السبت (5، 6). يقرأها
  // من window.TadreebDB.getWeekendDays() إن وُجدت (يملكها عامل
  // آخر) — مصفوفة متزامنة تُستخدم فوراً، ووعدٌ يُخزَّن عند حله مع
  // إعادة رسم واحدة إن تغيّرت الأيام. أي غياب أو خطأ يعيد الافتراضي.
  var weekendDaysCache = null;
  var weekendSigRendered = null;
  function getWeekendDays() {
    if (weekendDaysCache) return weekendDaysCache;
    var days = [5, 6];
    try {
      if (window.TadreebDB && typeof window.TadreebDB.getWeekendDays === 'function') {
        var res = window.TadreebDB.getWeekendDays();
        if (Array.isArray(res)) return res;
        if (res && typeof res.then === 'function') {
          res.then(function (d) {
            if (!Array.isArray(d)) return;
            weekendDaysCache = d;
            var sig = d.slice().sort().join(',');
            if (sig !== weekendSigRendered && lastContainer && lastContainer.isConnected) {
              render(lastContainer);
            }
          }).catch(function () { /* يبقى الافتراضي */ });
        }
      }
    } catch (e) { /* يبقى الافتراضي */ }
    return days;
  }
  function isWeekendDate(dateStr) {
    var d = UI.parseDateStr(dateStr);
    if (!d) return false;
    return getWeekendDays().indexOf(d.getDay()) !== -1;
  }

  // تسمية نوع القاعة في صفوف جدول اليوم: «حاسوب» لقاعات الحاسوب
  // فقط؛ الإدارية أو الغائبة (الافتراضي) بلا لاحقة. النوع في حقل
  // hallType (يملكه عامل آخر — TadreebDB.hallTypeOf مصدر الحقيقة
  // عند توفره)، مع قراءة دفاعية لحقل type القديم.
  function hallTypeLabel(hall) {
    if (!hall) return '';
    var t = '';
    try {
      if (window.TadreebDB && typeof window.TadreebDB.hallTypeOf === 'function') {
        t = window.TadreebDB.hallTypeOf(hall) || '';
      }
    } catch (e) { t = ''; }
    if (!t) t = hall.hallType || hall.type || '';
    return t === 'computer' ? 'حاسوب' : '';
  }

  // صيغ العدّ العربية: (1 مفرد، 2 مثنى، 3+ جمعاً مع العدد).
  function countText(n, one, two, many) {
    if (n === 1) return one;
    if (n === 2) return two;
    return n + ' ' + many;
  }
  function freePeriodsText(n) {
    if (n <= 0) return 'اليوم مكتمل';
    return countText(n, 'فترة واحدة حرة', 'فترتان حرتان', 'فترات حرة');
  }

  // خريطة توفر الفترات ليوم ما: الفترة حرة = قاعة واحدة على الأقل
  // غير مشغولة فيها. المشغول: جلسة مجدولة غير ملغاة ولا عطلة، أو
  // اجتماع مجدول غير ملغى — القاعدة نفسها في checkHallAvailability.
  // تحترم فلتر القاعة إن وُضع (التوفر يُحسب لتلك القاعة وحدها)؛
  // فلترا الدورة والمدرب لا يغيّران التوفر الفيزيائي للقاعات.
  // بلا قاعات مسجلة أصلاً: كل الفترات متاحة.
  function periodFreeMap(dateStr) {
    var periods = App.Store.getAll('periods');
    var halls = App.Store.getAll('halls');
    var map = {};
    periods.forEach(function (p) { map[p.id] = true; });
    var hallIds = halls.map(function (h) { return h.id; });
    if (filterState.hallId) hallIds = [filterState.hallId];
    if (!hallIds.length) return map;
    var busy = {};
    function mark(periodId, hallId) {
      if (!periodId || !hallId) return;
      if (hallIds.indexOf(hallId) === -1) return;
      (busy[periodId] = busy[periodId] || {})[hallId] = true;
    }
    App.Store.getAll('sessions').forEach(function (s) {
      if (s.date === dateStr && s.state !== 'cancelled' && s.state !== 'holiday') mark(s.periodId, s.hallId);
    });
    App.Store.getAll('meetings').forEach(function (m) {
      if (m.date === dateStr && m.status !== 'cancelled') mark(m.periodId, m.hallId);
    });
    periods.forEach(function (p) {
      var b = busy[p.id] || {};
      map[p.id] = hallIds.some(function (hid) { return !b[hid]; });
    });
    return map;
  }
  function countFreePeriods(dateStr) {
    var map = periodFreeMap(dateStr);
    var n = 0;
    Object.keys(map).forEach(function (k) { if (map[k]) n++; });
    return n;
  }

  // فتح عرض اليوم لتاريخ ما (من نقر يوم في عرض الشهر أو النطاق).
  function openDayView(dateStr) {
    state.dayDate = dateStr;
    state.view = 'day';
    userPickedView = true;
    if (lastContainer) render(lastContainer);
  }

  function sundayOf(dateStr) {
    var d = UI.parseDateStr(dateStr) || new Date();
    d.setDate(d.getDate() - d.getDay());
    return UI.dateToStr(d);
  }

  function addDays(dateStr, n) {
    var d = UI.parseDateStr(dateStr);
    d.setDate(d.getDate() + n);
    return UI.dateToStr(d);
  }

  function ensureState() {
    if (!state.weekStart) state.weekStart = sundayOf(UI.todayStr());
    if (!state.monthYear) {
      var now = new Date();
      state.monthYear = { year: now.getFullYear(), month: now.getMonth() };
    }
    if (!state.dayDate) state.dayDate = UI.todayStr();
    if (!state.rangeFrom) state.rangeFrom = UI.todayStr();
    if (!state.rangeTo) state.rangeTo = addDays(UI.todayStr(), 30);
  }

  function shiftRange(dir) {
    var from = UI.parseDateStr(state.rangeFrom);
    var to = UI.parseDateStr(state.rangeTo);
    var span = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);
    state.rangeFrom = addDays(state.rangeFrom, dir * span);
    state.rangeTo = addDays(state.rangeTo, dir * span);
  }

  // حدود الشهر المعروض (v2.1 — بند 10: نطاق لوحة الإحصاءات).
  function monthBounds() {
    var y = state.monthYear.year, m = state.monthYear.month;
    return {
      from: UI.dateToStr(new Date(y, m, 1)),
      to: UI.dateToStr(new Date(y, m + 1, 0))
    };
  }

  // نطاق العرض الحالي للوحة الإحصاءات: يوم = التاريخ نفسه، أسبوع =
  // الأحد…السبت (+6 أيام)، شهر = حدود الشهر، نطاق = النطاق المخصص.
  function currentCalRange() {
    if (state.view === 'day') return { from: state.dayDate, to: state.dayDate };
    if (state.view === 'week') return { from: state.weekStart, to: addDays(state.weekStart, 6) };
    if (state.view === 'range') return { from: state.rangeFrom, to: state.rangeTo };
    return monthBounds();
  }

  // أعمدة تصدير إحصاءات التقويم (اتحاد ورقتي «القاعات» و«الفترات»
  // في exportCalendarStats؛ معرّفات مطابقة لـ export.js).
  var CALENDAR_STATS_COLUMNS = [
    { id: 'name', label: 'القاعة' },
    { id: 'code', label: 'المعرّف' },
    { id: 'sessions', label: 'عدد الجلسات' },
    { id: 'meetings', label: 'عدد الاجتماعات' },
    { id: 'busySlots', label: 'الفتحات المشغولة' },
    { id: 'totalSlots', label: 'إجمالي الفتحات' },
    { id: 'occupancy', label: 'نسبة الإشغال %' },
    { id: 'label', label: 'الفترة' },
    { id: 'time', label: 'الوقت' },
    { id: 'share', label: 'الحصة %' }
  ];

  // أعمدة تصدير الاجتماعات (مطابقة لـ exportMeetings في export.js).
  var MEETINGS_COLUMNS = [
    { id: 'date', label: 'التاريخ' },
    { id: 'period', label: 'الفترة' },
    { id: 'hall', label: 'القاعة' },
    { id: 'title', label: 'العنوان' },
    { id: 'organizer', label: 'المنظم' },
    { id: 'status', label: 'الحالة' },
    { id: 'note', label: 'الملاحظة' }
  ];

  function render(container) {
    ensureState();
    lastContainer = container;
    // توقيع أيام العطلة الأسبوعية المعروضة الآن (لإعادة الرسم مرة
    // واحدة فقط عند وصولها غير المتزامنة بقيمة مختلفة).
    weekendSigRendered = getWeekendDays().slice().sort().join(',');
    // العرض الافتراضي من إعدادات العرض (الافتراضي: أسبوع كما قبل) —
    // يُطبَّق عند فتح الرزنامة فقط ما دام المستخدم لم يختر عرضاً
    // يدوياً في هذه الزيارة.
    if (!userPickedView) {
      var prefView = 'week';
      try {
        if (window.UI && typeof UI.getSetting === 'function') prefView = UI.getSetting('calendarView', 'week');
      } catch (e) { prefView = 'week'; }
      if (prefView === 'day' || prefView === 'week' || prefView === 'month') state.view = prefView;
    }
    var Store = App.Store;
    var today = UI.todayStr();

    var subtitle;
    if (state.view === 'week') {
      var start = UI.parseDateStr(state.weekStart);
      var end = UI.parseDateStr(addDays(state.weekStart, 4)); // الخميس
      subtitle = 'الأسبوع: ' + start.getDate() + ' - ' + end.getDate() + ' ' +
        UI.LEVANT_MONTHS[start.getMonth()] + ' ' + start.getFullYear();
    } else if (state.view === 'day') {
      subtitle = UI.fmtDateFull(state.dayDate);
    } else if (state.view === 'range') {
      subtitle = 'النطاق: ' + UI.fmtDate(state.rangeFrom) + ' — ' + UI.fmtDate(state.rangeTo);
    } else {
      subtitle = 'عرض شهري';
    }

    var exportLabel = state.view === 'day' ? 'تصدير اليوم ↓' :
      state.view === 'range' ? 'تصدير النطاق ↓' : 'تصدير إكسل ↓';

    var html = '';
    html += '<div class="page-head"><div><h1>رزنامة القاعات</h1>' +
      '<div class="muted">' + UI.escapeHtml(subtitle) + '</div></div>' +
      '<div class="head-actions">' +
      (App.canWrite() ? '<button class="btn btn-sm" type="button" id="cal-meeting-btn">اجتماع عارض +</button>' : '') +
      '<button class="btn btn-outline btn-sm" type="button" id="cal-prev-btn">السابق</button>' +
      '<button class="btn btn-outline btn-sm" type="button" id="cal-today-btn">اليوم</button>' +
      '<button class="btn btn-outline btn-sm" type="button" id="cal-next-btn">التالي</button>' +
      '<button class="btn btn-outline btn-sm" type="button" id="cal-export-btn">' + exportLabel + '</button>' +
      '<button class="btn btn-outline btn-sm" type="button" id="cal-meetings-export-btn">تصدير الاجتماعات ↓</button>' +
      '</div></div>';

    html += '<div class="chips">' +
      '<button class="chip' + (state.view === 'day' ? ' active' : '') + '" type="button" data-cal-view="day">يوم</button>' +
      '<button class="chip' + (state.view === 'week' ? ' active' : '') + '" type="button" data-cal-view="week">أسبوع</button>' +
      '<button class="chip' + (state.view === 'month' ? ' active' : '') + '" type="button" data-cal-view="month">شهر</button>' +
      '<button class="chip' + (state.view === 'range' ? ' active' : '') + '" type="button" data-cal-view="range">نطاق مخصص</button>' +
      '</div>';

    html += filterBarHtml();

    // لوحة إحصاءات التقويم (v2.1 — بند 10) — فوق العرض، وتُعاد
    // رسمها مع كل تبديل عرض أو نطاق (render تُستدعى في كل مرة).
    // تُرسم بعد innerHTML عبر TadreebStats (انظر أسفل render).
    html += '<div id="cal-stats-panel"></div>';

    if (state.view === 'week') {
      html += renderWeek(today);
    } else if (state.view === 'day') {
      html += renderDay(today);
    } else if (state.view === 'range') {
      html += renderRange();
    } else {
      html += renderMonth(today);
    }

    container.innerHTML = html;

    // لوحة إحصاءات التقويم (v2.1 — بند 10) — نطاق العرض الحالي؛
    // تُعاد رسمها مع كل تبديل عرض أو نطاق لأن render تُستدعى في
    // كل مرة. عدد الاجتماعات داخل مقاييس اللوحة نفسها.
    var calPanelEl = container.querySelector('#cal-stats-panel');
    if (calPanelEl && window.TadreebStats) {
      var calRange = currentCalRange();
      var calRes = window.TadreebStats.computeCalendar(calRange.from, calRange.to);
      window.TadreebStats.renderPanel(calPanelEl, {
        section: 'calendar',
        title: 'إحصاءات التقويم',
        subtitle: 'النطاق: ' + calRes.from + ' — ' + calRes.to,
        metrics: calRes.metrics,
        export: {
          label: 'تصدير الإحصاءات ↓',
          onClick: function () {
            UI.openPicker({
              title: 'تصدير إحصاءات التقويم',
              columns: CALENDAR_STATS_COLUMNS,
              onConfirm: function (result) {
                var data = window.TadreebStats.exportData('calendar-stats', { from: calRange.from, to: calRange.to });
                UI.callExport('exportCalendarStats', [data, { columns: result.columns }]);
              }
            });
          }
        }
      });
    }

    container.querySelectorAll('[data-cal-view]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        userPickedView = true;
        state.view = btn.getAttribute('data-cal-view');
        render(container);
      });
    });
    document.getElementById('cal-prev-btn').addEventListener('click', function () {
      if (state.view === 'week') state.weekStart = addDays(state.weekStart, -7);
      else if (state.view === 'month') shiftMonth(-1);
      else if (state.view === 'day') state.dayDate = addDays(state.dayDate, -1);
      else shiftRange(-1);
      render(container);
    });
    document.getElementById('cal-next-btn').addEventListener('click', function () {
      if (state.view === 'week') state.weekStart = addDays(state.weekStart, 7);
      else if (state.view === 'month') shiftMonth(1);
      else if (state.view === 'day') state.dayDate = addDays(state.dayDate, 1);
      else shiftRange(1);
      render(container);
    });
    document.getElementById('cal-today-btn').addEventListener('click', function () {
      state.weekStart = sundayOf(UI.todayStr());
      var now = new Date();
      state.monthYear = { year: now.getFullYear(), month: now.getMonth() };
      state.dayDate = UI.todayStr();
      state.rangeFrom = UI.todayStr();
      state.rangeTo = addDays(UI.todayStr(), 30);
      render(container);
    });
    document.getElementById('cal-export-btn').addEventListener('click', function () {
      if (state.view === 'week') {
        UI.openPicker({
          title: 'تصدير كالندر الأسبوع',
          sections: [{ id: 'week', label: 'جدول الأسبوع', checked: true }],
          onConfirm: function () {
            UI.callExport('exportWeekCalendar', [App.buildWeekData(state.weekStart)]);
          }
        });
      } else if (state.view === 'day') {
        UI.openPicker({
          title: 'تصدير جدول اليوم',
          sections: [{ id: 'day', label: 'جدول اليوم', checked: true }],
          onConfirm: function () {
            UI.callExport('exportDaySchedule', [App.buildDayData(state.dayDate, filterState)]);
          }
        });
      } else if (state.view === 'range') {
        UI.openPicker({
          title: 'تصدير جدول النطاق',
          sections: [{ id: 'range', label: 'جدول النطاق', checked: true }],
          onConfirm: function () {
            UI.callExport('exportRangeSchedule', [App.buildRangeData(state.rangeFrom, state.rangeTo, filterState)]);
          }
        });
      } else {
        UI.openPicker({
          title: 'تصدير كالندر الشهر',
          sections: [{ id: 'month', label: 'جدول الشهر', checked: true }],
          onConfirm: function () {
            UI.callExport('exportMonthCalendar', [App.buildMonthData(state.monthYear.year, state.monthYear.month)]);
          }
        });
      }
    });

    // تصدير الاجتماعات العارضة (v2.1 — بند 10): نافذة خيارات
    // بنطاق زمني؛ وإن تُرك النطاق فارغاً يُستخدم نطاق العرض
    // المخصص الحالي (state.rangeFrom…state.rangeTo).
    document.getElementById('cal-meetings-export-btn').addEventListener('click', function () {
      if (!window.TadreebStats) {
        UI.toast('خدمة الإحصاءات غير متوفرة حالياً', 'error');
        return;
      }
      UI.openPicker({
        title: 'تصدير الاجتماعات',
        columns: MEETINGS_COLUMNS,
        dateRange: true,
        onConfirm: function (result) {
          var from = result.dateFrom || state.rangeFrom;
          var to = result.dateTo || state.rangeTo;
          var data = window.TadreebStats.exportData('meetings', { from: from, to: to });
          UI.callExport('exportMeetings', [data, { columns: result.columns }]);
        }
      });
    });

    // النقر على جلسة في أي من العرضين
    container.querySelectorAll('[data-session-open]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        if (window.SessionScreen) window.SessionScreen.openActionSheet(el.getAttribute('data-session-open'));
      });
    });

    // النقر على اجتماع عارض في أي من العرضين
    container.querySelectorAll('[data-meeting-open]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        openMeetingSheet(el.getAttribute('data-meeting-open'));
      });
    });

    var meetingBtn = document.getElementById('cal-meeting-btn');
    if (meetingBtn) meetingBtn.addEventListener('click', function () {
      openMeetingForm(null, null);
    });

    // النقر على أي يوم في عرض الشهر أو النطاق المخصص يفتح عرض
    // اليوم لذلك التاريخ (v2.3). نقر شريحة جلسة أو اجتماع داخل
    // الخلية يوقف الانتشار في معالجه فلا يفتح عرض اليوم.
    container.querySelectorAll('[data-cal-day-open]').forEach(function (el) {
      el.addEventListener('click', function () {
        openDayView(el.getAttribute('data-cal-day-open'));
      });
    });

    // زر «حجز اجتماع» على خلية قاعة متاحة في عرض اليوم — يفتح
    // النموذج معبأً بالتاريخ والفترة والقاعة.
    container.querySelectorAll('[data-hall-book]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openMeetingForm(null, {
          date: state.dayDate,
          periodId: btn.getAttribute('data-hall-book'),
          hallId: btn.getAttribute('data-hall-id')
        });
      });
    });

    // فلاتر الرزنامة (الدورة / القاعة / المدرب) — تبقى عبر تبديل العروض.
    [['cal-filter-course', 'courseId'], ['cal-filter-hall', 'hallId'], ['cal-filter-trainer', 'trainerId']].forEach(function (pair) {
      var sel = document.getElementById(pair[0]);
      if (sel) sel.addEventListener('change', function () {
        filterState[pair[1]] = sel.value;
        render(container);
      });
    });
    // منتقي تاريخ عرض اليوم.
    var dayInput = document.getElementById('cal-day-input');
    if (dayInput) dayInput.addEventListener('change', function () {
      if (dayInput.value) { state.dayDate = dayInput.value; render(container); }
    });
    // زر عرض النطاق المخصص.
    var rangeShow = document.getElementById('cal-range-show');
    if (rangeShow) rangeShow.addEventListener('click', function () {
      var from = document.getElementById('cal-range-from').value;
      var to = document.getElementById('cal-range-to').value;
      if (!from || !to) { UI.toast('اختر تاريخي بداية النطاق ونهايته', 'error'); return; }
      if (to < from) { UI.toast('تاريخ النهاية قبل تاريخ البداية', 'error'); return; }
      state.rangeFrom = from;
      state.rangeTo = to;
      render(container);
    });

    // النقر على خلية فارغة في عرض الأسبوع (لا على شريحة) يفتح نموذج
    // اجتماع عارض معبأً بتاريخ الخلية وفترتها — للكتّاب فقط. خلايا
    // العطل بلا سمة data-cal-date فلا تفتح النموذج. خلايا الشهر لا
    // تحمل data-cal-date أصلاً (نقرها يفتح عرض اليوم — v2.3).
    if (App.canWrite()) {
      container.querySelectorAll('td[data-cal-date]').forEach(function (td) {
        td.addEventListener('click', function (e) {
          if (e.target.closest('[data-session-open],[data-meeting-open]')) return;
          openMeetingForm(null, {
            date: td.getAttribute('data-cal-date'),
            periodId: td.getAttribute('data-cal-period') || null
          });
        });
      });
    }
  }

  function shiftMonth(delta) {
    var m = state.monthYear.month + delta;
    var y = state.monthYear.year;
    while (m < 0) { m += 12; y--; }
    while (m > 11) { m -= 12; y++; }
    state.monthYear = { year: y, month: m };
  }

  function renderWeek(today) {
    var Store = App.Store;
    var periods = Store.getAll('periods').slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var halls = Store.getAll('halls');
    var days = App.weekDays(state.weekStart);
    var holidays = {};
    Store.getAll('holidays').forEach(function (h) { holidays[h.date] = h.name; });

    var html = '<div class="legend">' +
      '<span><span class="dot" style="background:#081F31"></span>مشغولة</span>' +
      '<span><span class="dot" style="background:#2E7D32"></span>متاحة</span>' +
      '<span><span class="dot" style="background:#6D28D9"></span>اجتماع عارض</span>' +
      '<span><span class="dot" style="background:#94A3B8"></span>ملغاة</span>' +
      '<span><span class="dot" style="background:#B45309"></span>عطلة</span>' +
      '</div>';

    html += '<div class="card-white"><div class="table-wrap"><table><thead><tr><th>الفترة</th>';
    days.forEach(function (day) {
      var d = UI.parseDateStr(day.date);
      // ملخص توفر اليوم (v2.3): عدد الفترات الحرة في رأس العمود؛
      // العطلة ويوم العطلة الأسبوعية يظهران بوسمهما بدل الملخص.
      var daySummary = '';
      if (holidays[day.date]) {
        daySummary = '<div class="cal-week-summary cal-week-full">عطلة</div>';
      } else if (isWeekendDate(day.date)) {
        daySummary = '<div class="cal-week-summary cal-week-full">عطلة أسبوعية</div>';
      } else if (periods.length) {
        var freeN = countFreePeriods(day.date);
        daySummary = '<div class="cal-week-summary' + (freeN === 0 ? ' cal-week-full' : '') + '">' +
          UI.escapeHtml(freePeriodsText(freeN)) + '</div>';
      }
      html += '<th>' + UI.escapeHtml(UI.WEEKDAYS[d.getDay()]) + ' ' + d.getDate() +
        (day.date === today ? ' <span class="pill pill-navy">اليوم</span>' : '') + daySummary + '</th>';
    });
    html += '</tr></thead><tbody>';

    if (!periods.length) {
      html += '<tr><td colspan="6"><div class="muted">لا فترات تدريبية معرّفة — أضف فترة من إعدادات المنصة.</div></td></tr>';
    }
    periods.forEach(function (p) {
      html += '<tr><td><strong>' + UI.escapeHtml(p.label) + '</strong><div class="muted">' + fmtRange12(p.start, p.end) + '</div></td>';
      days.forEach(function (day) {
        var isHolidayDay = !!holidays[day.date];
        html += '<td' + (isHolidayDay ? '' : ' data-cal-date="' + day.date + '" data-cal-period="' + p.id + '"') + '>';
        if (holidays[day.date]) {
          html += '<div class="hl hl-holiday">عطلة: ' + UI.escapeHtml(holidays[day.date]) + '</div>';
        } else if (!halls.length) {
          html += '<div class="muted">لا قاعات</div>';
        } else {
          halls.forEach(function (hall) {
            var sess = App.Store.getAll('sessions').find(function (s) {
              return s.date === day.date && s.periodId === p.id && s.hallId === hall.id && sessionMatchesFilter(s);
            });
            // الاجتماع العارض المجدول يشغل قاعته؛ الملغى لا يظهر هنا.
            var meeting = App.Store.getAll('meetings').find(function (m) {
              return m.date === day.date && m.periodId === p.id && m.hallId === hall.id && m.status !== 'cancelled' && meetingMatchesFilter(m);
            });
            // الملغاة والعطلة لا تشغلان القاعة (كما في عرض اليوم):
            // القاعة تظهر متاحةً، والجلسة الملغاة/العطلة شريحة مستقلة.
            var occupies = sess && sess.state !== 'cancelled' && sess.state !== 'holiday';
            if (!occupies && !meeting) {
              html += '<div class="hl hl-free">' + UI.escapeHtml(shortHall(hall.name)) + ': متاحة</div>';
            }
            if (sess) {
              var course = App.Store.get('courses', sess.courseId);
              var cancelled = sess.state === 'cancelled';
              var holiday = sess.state === 'holiday';
              // اسم المدرب سطراً ثانياً (v2.3) — السطر الأول يبقى
              // «القاعة: الدورة» كما هو تماماً.
              var trainer = null;
              if (course && course.trainerId) trainer = App.Store.get('trainers', course.trainerId);
              html += '<div class="hl ' + (cancelled ? 'hl-cancel' : holiday ? 'hl-holiday' : 'hl-busy') + '" data-session-open="' + UI.escapeHtml(sess.id) + '">' +
                UI.escapeHtml(shortHall(hall.name)) + ': ' + UI.escapeHtml(course ? App.courseName(course) : '') +
                (cancelled ? ' · ملغاة' : holiday ? ' · عطلة' : '') +
                (trainer ? '<div class="cal-hl-sub">' + UI.escapeHtml(trainer.name) + '</div>' : '') + '</div>';
            }
            if (meeting) {
              html += '<div class="hl hl-meeting" data-meeting-open="' + UI.escapeHtml(meeting.id) + '">' +
                UI.escapeHtml(shortHall(hall.name)) + ': اجتماع: ' + UI.escapeHtml(meeting.title) +
                (meeting.organizer ? '<div class="cal-hl-sub">' + UI.escapeHtml(meeting.organizer) + '</div>' : '') + '</div>';
            }
          });
          // جلسات بلا قاعة في هذا الموعد
          var unassigned = App.Store.getAll('sessions').filter(function (s) {
            return s.date === day.date && s.periodId === p.id && !s.hallId && sessionMatchesFilter(s);
          });
          unassigned.forEach(function (s) {
            var course = App.Store.get('courses', s.courseId);
            var cancelled = s.state === 'cancelled';
            var holiday = s.state === 'holiday';
            var trainer = null;
            if (course && course.trainerId) trainer = App.Store.get('trainers', course.trainerId);
            html += '<div class="hl ' + (cancelled ? 'hl-cancel' : holiday ? 'hl-holiday' : 'hl-busy') + '" data-session-open="' + UI.escapeHtml(s.id) + '">بلا قاعة: ' +
              UI.escapeHtml(course ? App.courseName(course) : '') + (cancelled ? ' · ملغاة' : holiday ? ' · عطلة' : '') +
              (trainer ? '<div class="cal-hl-sub">' + UI.escapeHtml(trainer.name) + '</div>' : '') + '</div>';
          });
        }
        html += '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table></div></div>';
    return html;
  }

  // شريط الفلاتر: الدورة / القاعة / المدرب — يظهر في العروض الأربعة.
  function filterBarHtml() {
    var courses = App.Store.getAll('courses').slice().sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
    });
    var halls = App.Store.getAll('halls').slice().sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
    });
    var trainers = App.Store.getAll('trainers').slice().sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
    });
    function sel(id, label, items, current, labelFn) {
      var opts = '<option value="">الكل</option>' + items.map(function (it) {
        return '<option value="' + UI.escapeHtml(it.id) + '"' + (it.id === current ? ' selected' : '') + '>' +
          UI.escapeHtml(labelFn ? labelFn(it) : it.name) + '</option>';
      }).join('');
      return '<label class="muted" for="' + id + '">' + label + '</label>' +
        '<select class="input" id="' + id + '">' + opts + '</select>';
    }
    return '<div class="toolbar">' +
      sel('cal-filter-course', 'مجموعة التدريب', courses, filterState.courseId, function (c) { return App.groupDisplayNameFull(c); }) +
      sel('cal-filter-hall', 'القاعة', halls, filterState.hallId) +
      sel('cal-filter-trainer', 'المدرب', trainers, filterState.trainerId) +
      '</div>';
  }

  // صف مدخل واحد في عرض اليوم/النطاق (جلسة أو اجتماع) — نمط
  // القائمة المرتبة (v2.1): عنوان + قاعة ومدرب وفترة + زر «خيارات»
  // ظاهر. الصف نفسه يحمل data-session-open / data-meeting-open
  // فيصل النقر على الزر إلى المعالج الموجود (ورقة إجراءات الجلسة
  // / ورقة الاجتماع). نص «اجتماع: <العنوان>» محفوظ حرفياً —
  // الاختبارات تبحث عنه. withPeriod: إظهار الفترة في سطر الحقائق
  // (عرض النطاق؛ في عرض اليوم الفترة هي عنوان الصف أصلاً).
  function dayEntryRow(e, withPeriod) {
    var isMeeting = e.kind === 'meeting';
    var title = isMeeting ? 'اجتماع: ' + (e.title || '') : (e.course || '');
    var statePill = '';
    if (!isMeeting && (e.state === 'cancelled' || e.state === 'holiday')) {
      statePill = ' ' + UI.pillForSessionState(e.state);
    }
    var meta = [];
    if (withPeriod && e.period) meta.push(e.period);
    meta.push(e.hall ? shortHall(e.hall) : 'بلا قاعة');
    if (!isMeeting && e.trainer) meta.push(e.trainer);
    var openAttr = isMeeting ? 'data-meeting-open' : 'data-session-open';
    return '<div class="list-row clickable" ' + openAttr + '="' + UI.escapeHtml(e.id) + '">' +
      '<div class="list-row-main"><div class="list-row-title"><strong>' + UI.escapeHtml(title) + '</strong>' + statePill + '</div>' +
      '<div class="list-row-meta muted">' + meta.map(UI.escapeHtml).join(' · ') + '</div></div>' +
      '<div class="list-row-actions row-actions"><button class="btn btn-outline btn-sm" type="button">خيارات</button></div></div>';
  }

  // عرض اليوم (v2.3): جدول قاعات × فترات — الأعمدة فترات ديناميكية
  // (من إعدادات الفترات، + عمود لكل فترة محذوفة ما زالت لها جلسات
  // هذا اليوم، + عمود «بلا فترة» عند الحاجة)، والصفوف قاعات (+ صف
  // «بلا قاعة» عند وجود جلسات بلا قاعة). كل خلية = الجلسة في تلك
  // القاعة والفترة (اسم الدورة + المدرب، ونقرها يفتح ورقة الجلسة)
  // أو الاجتماع (عنوانه، ونقره يفتح ورقة الاجتماع) أو «متاحة»
  // (نقرها — للكتّاب — يحجز اجتماعاً معبأً بالتاريخ والفترة
  // والقاعة). قاعدة الإشغال هي نفسها في checkHallAvailability:
  // الجلسة غير الملغاة ولا العطلة تشغل قاعتها، والاجتماع غير
  // الملغى يشغل قاعته؛ الملغاة/العطلة لا تشغلان فتظهر في قسم
  // «جلسات أخرى» أسفل الجدول مع مدخلات القاعات المحذوفة.
  function renderDay(today) {
    var Store = App.Store;
    var periods = Store.getAll('periods').slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    // ترتيب القاعات كما في عرض الأسبوع (ترتيب المتجر — الأولى،
    // الثانية، الثالثة) لا الترتيب الأبجدي (يضع الثالثة قبل الثانية).
    var halls = Store.getAll('halls');
    var holidays = {};
    Store.getAll('holidays').forEach(function (h) { holidays[h.date] = h.name; });
    var data = App.buildDayData(state.dayDate, filterState);
    var entries = data.days[0].sessions;
    var canWrite = App.canWrite();
    var isWeekend = isWeekendDate(state.dayDate);

    var html = '<div class="toolbar"><strong>' + UI.escapeHtml(UI.fmtDateFull(state.dayDate)) + '</strong>' +
      (state.dayDate === today ? '<span class="pill pill-navy">اليوم</span>' : '') +
      (isWeekend ? '<span class="pill pill-amber">عطلة أسبوعية</span>' : '') +
      '<label class="muted" for="cal-day-input">اختر يوماً:</label>' +
      '<input type="date" id="cal-day-input" class="input" value="' + UI.escapeHtml(state.dayDate) + '">' +
      '</div>';

    if (holidays[state.dayDate]) {
      html += '<div class="card-white"><div class="hl hl-holiday">عطلة: ' + UI.escapeHtml(holidays[state.dayDate]) + '</div></div>';
    }

    html += '<div class="legend">' +
      '<span><span class="dot" style="background:#081F31"></span>مشغولة</span>' +
      '<span><span class="dot" style="background:#2E7D32"></span>متاحة</span>' +
      '<span><span class="dot" style="background:#6D28D9"></span>اجتماع عارض</span>' +
      '<span><span class="dot" style="background:#94A3B8"></span>ملغاة</span>' +
      '<span><span class="dot" style="background:#B45309"></span>عطلة</span>' +
      '</div>';

    if (!periods.length && !entries.length) {
      html += '<div class="card-white"><div class="muted">لا فترات تدريبية معرّفة — أضف فترة من إعدادات المنصة.</div></div>';
      return html;
    }
    if (!halls.length) {
      html += '<div class="card-white"><div class="muted">لا قاعات مسجلة</div>';
      entries.forEach(function (e) { html += dayEntryRow(e, true); });
      html += '</div>';
      return html;
    }

    // أعمدة الفترات: المعروفة أولاً (بترتيبها)، ثم المحذوفة التي ما
    // زالت لها مدخلات هذا اليوم (بترتيب ظهورها)، ثم «بلا فترة».
    var columns = periods.map(function (p) {
      return { id: p.id, label: p.label, time: fmtRange12(p.start, p.end) };
    });
    var knownIds = {};
    periods.forEach(function (p) { knownIds[p.id] = true; });
    var orphanIds = [];
    entries.forEach(function (e) {
      if (e.periodId && !knownIds[e.periodId] && orphanIds.indexOf(e.periodId) === -1) orphanIds.push(e.periodId);
    });
    orphanIds.forEach(function (id) { columns.push({ id: id, label: 'فترة محذوفة', time: '' }); });
    if (entries.some(function (e) { return !e.periodId; })) columns.push({ id: '', label: 'بلا فترة', time: '' });

    // مدخلات ظهرت شاغلةً لخلية — لا تُعاد في «جلسات أخرى».
    var shownIds = {};
    function slotLookup(hallId, periodId) {
      var occupant = null, meeting = null;
      entries.forEach(function (e) {
        if (e.periodId !== periodId) return;
        if ((e.hallId || null) !== (hallId || null)) return;
        if (e.kind === 'session' && e.state !== 'cancelled' && e.state !== 'holiday' && !occupant) occupant = e;
        if (e.kind === 'meeting' && !meeting) meeting = e;
      });
      return { occupant: occupant, meeting: meeting };
    }
    // محتوى خلية: جلسة و/أو اجتماع، أو «متاحة» (صف القاعة) أو «—»
    // (صف «بلا قاعة» — لا قاعة تُحجز هناك).
    function slotHtml(slot, bookable) {
      var out = '';
      if (slot.occupant) {
        var occ = slot.occupant;
        shownIds[occ.id] = true;
        out += '<div class="cal-cell cal-cell-session" data-session-open="' + UI.escapeHtml(occ.id) + '">' +
          '<div class="cal-cell-title">' + UI.escapeHtml(occ.course || '') + '</div>' +
          (occ.trainer ? '<div class="cal-cell-sub">' + UI.escapeHtml(occ.trainer) + '</div>' : '') +
          '<span class="cal-cell-pill">مشغولة</span></div>';
      }
      if (slot.meeting) {
        var mt = slot.meeting;
        shownIds[mt.id] = true;
        out += '<div class="cal-cell cal-cell-meeting" data-meeting-open="' + UI.escapeHtml(mt.id) + '">' +
          '<div class="cal-cell-title">اجتماع: ' + UI.escapeHtml(mt.title || '') + '</div></div>';
      }
      if (!out) {
        out = bookable
          ? '<div class="cal-free">متاحة</div>' + (canWrite ? '<span class="cal-book-link">حجز اجتماع</span>' : '')
          : '<div class="cal-free cal-free-none">—</div>';
      }
      return out;
    }

    html += '<div class="card-white"><div class="table-wrap"><table class="cal-day-table"><thead><tr><th>القاعة</th>';
    columns.forEach(function (c) {
      html += '<th>' + UI.escapeHtml(c.label) +
        (c.time ? '<div class="cal-day-period-time">' + c.time + '</div>' : '') + '</th>';
    });
    html += '</tr></thead><tbody>';
    halls.forEach(function (hall) {
      var typeLabel = hallTypeLabel(hall);
      html += '<tr><th class="cal-day-hall">' + UI.escapeHtml(hall.name) +
        (typeLabel ? ' <span class="cal-hall-type">· ' + UI.escapeHtml(typeLabel) + '</span>' : '') + '</th>';
      columns.forEach(function (c) {
        var slot = slotLookup(hall.id, c.id);
        var isFree = !slot.occupant && !slot.meeting;
        // سمة الحجز على الخلايا الحرة فقط — فلا يفتح نقر خلية
        // مشغولة نموذج اجتماع.
        html += '<td' + (isFree && canWrite
          ? ' class="cal-day-free" data-hall-book="' + UI.escapeHtml(c.id) + '" data-hall-id="' + UI.escapeHtml(hall.id) + '"'
          : '') + '>' + slotHtml(slot, true) + '</td>';
      });
      html += '</tr>';
    });
    if (entries.some(function (e) { return !e.hallId; })) {
      html += '<tr><th class="cal-day-hall cal-nohall">بلا قاعة</th>';
      columns.forEach(function (c) {
        html += '<td>' + slotHtml(slotLookup(null, c.id), false) + '</td>';
      });
      html += '</tr>';
    }
    html += '</tbody></table></div></div>';

    // الباقي: ملغاة/عطلة + قاعة محذوفة + شاغل ثانٍ في خلية واحدة.
    var others = entries.filter(function (e) { return !shownIds[e.id]; });
    if (others.length) {
      html += '<div class="card-white"><div class="cal-other-title">جلسات أخرى</div>';
      others.forEach(function (e) { html += dayEntryRow(e, true); });
      html += '</div>';
    }
    return html;
  }

  // عرض النطاق المخصص: تاريخا من/إلى + زر عرض + قائمة مجمّعة بالتاريخ.
  // الأيام الفارغة تُتخطى في القائمة.
  function renderRange() {
    var Store = App.Store;
    var holidays = {};
    Store.getAll('holidays').forEach(function (h) { holidays[h.date] = h.name; });
    var data = App.buildRangeData(state.rangeFrom, state.rangeTo, filterState);

    var html = '<div class="toolbar">' +
      '<label class="muted" for="cal-range-from">من</label>' +
      '<input type="date" id="cal-range-from" class="input" value="' + UI.escapeHtml(state.rangeFrom) + '">' +
      '<label class="muted" for="cal-range-to">إلى</label>' +
      '<input type="date" id="cal-range-to" class="input" value="' + UI.escapeHtml(state.rangeTo) + '">' +
      '<button class="btn btn-sm" type="button" id="cal-range-show">عرض</button>' +
      '<span class="muted">الحد الأقصى للنطاق 93 يوماً.</span></div>';

    var shown = 0;
    html += '<div class="card-white">';
    data.days.forEach(function (day) {
      var holidayName = holidays[day.date];
      if (!day.sessions.length && !holidayName) return;
      shown++;
      // رأس اليوم نقّال (v2.3): النقر عليه يفتح عرض اليوم لذلك
      // التاريخ؛ صفوف الجلسات تحته مستقلة (معالجاتها توقف الانتشار).
      var dayWeekend = isWeekendDate(day.date);
      html += '<div style="margin-bottom:16px"><div class="cal-range-day-head" data-cal-day-open="' + day.date + '"><strong>' +
        UI.escapeHtml(UI.fmtDateFull(day.date)) + '</strong>' +
        (dayWeekend ? '<span class="cal-weekend-tag">عطلة أسبوعية</span>' : '') +
        '<span class="cal-day-open-hint">عرض هذا اليوم</span></div><div style="margin-top:6px">';
      if (holidayName) html += '<span class="m-chip m-holiday">عطلة: ' + UI.escapeHtml(holidayName) + '</span>';
      // مدخلات اليوم صفوفاً مرتبة (v2.1): عنوان + فترة وقاعة ومدرب
      // + زر «خيارات» ظاهر — بدل الشرائح المزدحمة.
      day.sessions.forEach(function (e) { html += dayEntryRow(e, true); });
      html += '</div></div>';
    });
    if (!shown) html += UI.emptyState('لا جلسات في هذا النطاق.');
    html += '</div>';
    return html;
  }

  function shortHall(name) {
    // "القاعة الأولى" → "الأولى"
    return String(name || '').replace(/^القاعة\s+/, '');
  }

  function renderMonth(today) {
    var Store = App.Store;
    var year = state.monthYear.year;
    var month = state.monthYear.month;
    var holidays = {};
    Store.getAll('holidays').forEach(function (h) { holidays[h.date] = h.name; });

    var html = '<div class="card-white"><div class="section-title-row"><h2>' +
      UI.escapeHtml(UI.fmtMonthYear(year, month)) + '</h2></div>' +
      '<div class="legend"><span><span class="dot" style="background:#2F6F8F"></span>اليوم</span>' +
      '<span><span class="dot" style="background:#6D28D9"></span>اجتماع عارض</span>' +
      '<span><span class="dot" style="background:#94A3B8"></span>ملغاة</span>' +
      '<span><span class="dot" style="background:#B45309"></span>عطلة</span></div>' +
      '<div class="table-wrap"><table class="month-table"><thead><tr>';
    UI.WEEKDAYS.forEach(function (d) { html += '<th>' + d + '</th>'; });
    html += '</tr></thead><tbody>';

    var first = new Date(year, month, 1);
    var startOffset = first.getDay();
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var day = 1;
    for (var w = 0; w < 6 && day <= daysInMonth; w++) {
      html += '<tr>';
      for (var dow = 0; dow < 7; dow++) {
        if ((w === 0 && dow < startOffset) || day > daysInMonth) {
          html += '<td class="weekend-cell"></td>';
          continue;
        }
        var dateStr = UI.dateToStr(new Date(year, month, day));
        var isToday = dateStr === today;
        var isWeekend = isWeekendDate(dateStr);
        var sessions = Store.getAll('sessions').filter(function (s) { return s.date === dateStr && sessionMatchesFilter(s); });
        // الاجتماعات العارضة المجدولة في هذا اليوم؛ الملغاة لا تظهر.
        var meetings = Store.getAll('meetings').filter(function (m) { return m.date === dateStr && m.status !== 'cancelled' && meetingMatchesFilter(m); });
        // ملخص اليوم (v2.3): عدد الجلسات غير الملغاة + الاجتماعات،
        // ونقاط التوفر (نقطة لكل فترة: خضراء = قاعة حرة، كحلية =
        // كل القاعات مشغولة). النقر على أي خلية يوم — بما فيها
        // العطل وأيام العطلة الأسبوعية — يفتح عرض اليوم لذلك التاريخ.
        var occSessions = sessions.filter(function (s) { return s.state !== 'cancelled' && s.state !== 'holiday'; });
        var summaryParts = [];
        if (occSessions.length) summaryParts.push(countText(occSessions.length, 'جلسة واحدة', 'جلستان', 'جلسات'));
        if (meetings.length) summaryParts.push(countText(meetings.length, 'اجتماع واحد', 'اجتماعان', 'اجتماعات'));
        var monthPeriods = Store.getAll('periods').slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
        var freeMap = holidays[dateStr] ? null : periodFreeMap(dateStr);
        html += '<td class="' + (isToday ? 'today-cell' : isWeekend ? 'weekend-cell' : '') + '" data-cal-day-open="' + dateStr + '"><div class="m-day">' + day + '</div>';
        if (isWeekend) html += '<div class="cal-weekend-tag">عطلة أسبوعية</div>';
        if (holidays[dateStr]) {
          html += '<span class="m-chip m-holiday">عطلة: ' + UI.escapeHtml(holidays[dateStr]) + '</span>';
        } else {
          if (summaryParts.length) {
            html += '<div class="cal-month-summary">' + summaryParts.join(' · ') + '</div>';
          } else if (!isWeekend) {
            html += '<div class="cal-month-summary">لا جلسات</div>';
          }
          if (monthPeriods.length) {
            html += '<div class="cal-month-dots">' + monthPeriods.map(function (p) {
              return '<span class="cal-month-dot ' + (freeMap[p.id] ? 'free' : 'busy') + '" title="' + UI.escapeHtml(p.label) + '"></span>';
            }).join('') + '</div>';
          }
        }
        sessions.forEach(function (s) {
          var course = App.Store.get('courses', s.courseId);
          var cancelled = s.state === 'cancelled';
          var holiday = s.state === 'holiday';
          // اسم القاعة على شريحة الجلسة (v2.1 — بند 7)؛ الاجتماع
          // يحمل قاعته أصلاً في الشريحة التالية.
          html += '<span class="m-chip' + (cancelled ? ' m-cancel' : holiday ? ' m-holiday' : '') + '" data-session-open="' + UI.escapeHtml(s.id) + '">' +
            UI.escapeHtml(course ? App.courseName(course) : '') +
            (s.hallId ? ' · ' + UI.escapeHtml(shortHall(App.hallName(s.hallId))) : '') +
            (cancelled ? ' · ملغاة' : holiday ? ' · عطلة' : '') + '</span>';
        });
        meetings.forEach(function (m) {
          var mHall = App.hallName(m.hallId);
          html += '<span class="m-chip m-meeting" data-meeting-open="' + UI.escapeHtml(m.id) + '">اجتماع: ' +
            UI.escapeHtml(m.title) + (mHall ? ' · ' + UI.escapeHtml(shortHall(mHall)) : '') + '</span>';
        });
        html += '</td>';
        day++;
      }
      html += '</tr>';
    }
    html += '</tbody></table></div></div>';
    return html;
  }

  function meetingStatusPill(status) {
    return status === 'cancelled'
      ? '<span class="pill pill-grey">ملغى</span>'
      : '<span class="pill pill-violet">مجدول</span>';
  }

  // نموذج إنشاء/تعديل اجتماع عارض. meeting = null للإنشاء.
  // prefill اختياري: {date, periodId, hallId} من خلية الرزنامة أو
  // من زر «حجز اجتماع» على صف قاعة متاحة في عرض اليوم.
  function openMeetingForm(meeting, prefill) {
    var isEdit = !!meeting;
    var halls = App.Store.getAll('halls');
    var periods = App.Store.getAll('periods').slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    if (!halls.length) { UI.toast('لا قاعات مسجلة — أضف قاعة أولاً', 'error'); return; }
    if (!periods.length) { UI.toast('لا فترات تدريبية معرّفة — أضف فترة أولاً', 'error'); return; }
    var defDate = (meeting && meeting.date) || (prefill && prefill.date) || UI.todayStr();
    var defPeriod = (meeting && meeting.periodId) || (prefill && prefill.periodId) || (periods[0] && periods[0].id) || '';
    var defHall = (meeting && meeting.hallId) || (prefill && prefill.hallId) || '';
    var fields = '<div class="form-grid">' +
      '<div class="field field-full"><label>العنوان / الغرض *</label><input type="text" name="title" required value="' + UI.escapeHtml(meeting ? meeting.title : '') + '"></div>' +
      '<div class="field"><label>التاريخ *</label><input type="date" name="date" required value="' + UI.escapeHtml(defDate) + '"></div>' +
      '<div class="field"><label>الفترة *</label><select name="periodId" required>' +
      periods.map(function (p) {
        return '<option value="' + UI.escapeHtml(p.id) + '"' + (p.id === defPeriod ? ' selected' : '') + '>' +
          UI.escapeHtml(fmtPeriodOptionLabel(p)) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field field-full"><label>القاعة *</label><select name="hallId" required>' +
      '<option value="">اختر القاعة</option>' +
      halls.map(function (h) {
        return '<option value="' + UI.escapeHtml(h.id) + '"' + (h.id === defHall ? ' selected' : '') + '>' + UI.escapeHtml(h.name) + '</option>';
      }).join('') + '</select><div class="field-hint" id="mt-availability">جارٍ فحص توفر القاعات…</div></div>' +
      '<div class="field field-full"><label>الجهة الطالبة / المنظم</label><input type="text" name="organizer" value="' + UI.escapeHtml(meeting ? meeting.organizer || '' : '') + '"></div>' +
      '<div class="field field-full"><label>ملاحظات</label><textarea name="notes">' + UI.escapeHtml(meeting ? meeting.notes || '' : '') + '</textarea></div>' +
      '</div>';
    var modal = UI.openFormModal(isEdit ? 'تعديل اجتماع عارض' : 'اجتماع عارض جديد', fields, function (form, close, submitBtn) {
      var title = form.querySelector('[name="title"]').value.trim();
      var date = form.querySelector('[name="date"]').value;
      var periodId = form.querySelector('[name="periodId"]').value;
      var hallId = form.querySelector('[name="hallId"]').value;
      var organizer = form.querySelector('[name="organizer"]').value.trim();
      var notes = form.querySelector('[name="notes"]').value.trim();
      if (!title) { UI.formError(form, 'أدخل عنوان الاجتماع'); return; }
      if (!date) { UI.formError(form, 'اختر تاريخ الاجتماع'); return; }
      if (!periodId) { UI.formError(form, 'اختر الفترة'); return; }
      if (!hallId) { UI.formError(form, 'اختر القاعة'); return; }
      UI.formError(form, '');
      UI.setBtnLoading(submitBtn, true);
      var data = { title: title, date: date, periodId: periodId, hallId: hallId, organizer: organizer, notes: notes };
      var p = isEdit
        ? window.TadreebDB.updateMeeting(meeting.id, data)
        : window.TadreebDB.createMeeting(data);
      p.then(function () {
        UI.setBtnLoading(submitBtn, false);
        close();
        UI.toast(isEdit ? 'تم تعديل الاجتماع' : 'تم حجز الاجتماع', 'success');
        App.refresh();
      }).catch(function (err) { UI.setBtnLoading(submitBtn, false); UI.formError(form, err.message); });
    }, { submitLabel: isEdit ? 'حفظ التعديلات' : 'حجز الاجتماع', width: 'normal' });

    // فحص توفر القاعات عند تغيير التاريخ أو الفترة؛ قاعة الاجتماع نفسه
    // لا تُعطَّل في موعده الحالي عند التعديل. الفحص يشمل الجلسات
    // والاجتماعات معاً (checkHallAvailability).
    var card = modal.element;
    var availEl = card.querySelector('#mt-availability');
    var hallSel = card.querySelector('[name="hallId"]');
    function checkAvail() {
      var date = card.querySelector('[name="date"]').value;
      var periodId = card.querySelector('[name="periodId"]').value;
      if (!date || !periodId) { availEl.textContent = ''; return; }
      availEl.textContent = 'جارٍ فحص توفر القاعات…';
      window.TadreebDB.checkHallAvailability(date, periodId).then(function (rows) {
        var isSelfSlot = !!(meeting && date === meeting.date && periodId === meeting.periodId);
        var isSelfHall = function (r) { return isSelfSlot && r.hallId === meeting.hallId; };
        availEl.innerHTML = hallAvailabilityListHtml(rows, isSelfHall);
        hallSel.querySelectorAll('option[value]').forEach(function (opt) {
          if (!opt.value) return;
          var row = rows.find(function (r) { return r.hallId === opt.value; });
          opt.disabled = !!(row && !row.free && !isSelfHall(row));
        });
      }).catch(function () { availEl.textContent = ''; });
    }
    card.querySelector('[name="date"]').addEventListener('change', checkAvail);
    card.querySelector('[name="periodId"]').addEventListener('change', checkAvail);
    checkAvail();
  }

  // ورقة تفاصيل الاجتماع العارض وإجراءاته (تعديل/إلغاء/حذف للكتّاب؛
  // عرض فقط للعارض، وللاجتماع الملغى إن فُتح من أي مكان).
  function openMeetingSheet(meetingId) {
    var meeting = App.Store.get('meetings', meetingId);
    if (!meeting) { UI.toast('الاجتماع غير موجود', 'error'); return; }
    var period = App.Store.get('periods', meeting.periodId);
    var canWrite = App.canWrite();
    var isCancelled = meeting.status === 'cancelled';

    var summary = '<div class="sheet-summary">' +
      '<div class="sheet-summary-title">اجتماع: ' + UI.escapeHtml(meeting.title || '') + '</div>' +
      '<div><span class="k">التاريخ</span> ' + UI.escapeHtml(UI.fmtDateFull(meeting.date)) + '</div>' +
      '<div><span class="k">الفترة</span> ' + UI.escapeHtml(period ? period.label : '') + ' ' + (period ? fmtRange12(period.start, period.end) : '') + '</div>' +
      '<div><span class="k">القاعة</span> ' + UI.escapeHtml(App.hallName(meeting.hallId) || '—') + '</div>' +
      '<div><span class="k">الجهة الطالبة / المنظم</span> ' + UI.escapeHtml(meeting.organizer || '—') + '</div>' +
      '<div><span class="k">ملاحظات</span> ' + UI.escapeHtml(meeting.notes || '—') + '</div>' +
      '<div><span class="k">الحالة</span> ' + meetingStatusPill(meeting.status) + '</div>' +
      '</div>';

    var actions = [];
    if (canWrite && !isCancelled) {
      actions.push({ key: 'edit', label: 'تعديل' });
      actions.push({ key: 'cancel', label: 'إلغاء' });
      actions.push({ key: 'delete', label: 'حذف الاجتماع', danger: true });
    }
    var listHtml = actions.map(function (a) {
      return '<button class="sheet-action' + (a.danger ? ' danger' : '') + '" type="button" data-meeting-action="' + a.key + '">' + UI.escapeHtml(a.label) + '</button>';
    }).join('');

    var modal = UI.openModal({
      title: 'تفاصيل الاجتماع',
      width: 'normal',
      bodyHTML: summary + (listHtml ? '<div class="sheet-actions">' + listHtml + '</div>' : ''),
      actions: [{ label: 'إغلاق', className: 'btn-outline', closeOnClick: true }]
    });
    if (modal.element) modal.element.classList.add('sheet');
    if (!modal.element) return;
    modal.element.querySelectorAll('[data-meeting-action]').forEach(function (btn) {
      btn.addEventListener('click', function () { handleAction(btn.getAttribute('data-meeting-action')); });
    });

    function handleAction(key) {
      modal.close();
      if (key === 'edit') {
        openMeetingForm(meeting, null);
      } else if (key === 'cancel') {
        doCancel();
      } else if (key === 'delete') {
        doDelete();
      }
    }

    function doCancel() {
      UI.openFormModal('إلغاء الاجتماع',
        '<div class="field"><label>ملاحظة (اختياري)</label><textarea name="note"></textarea></div>',
        function (form, close2, btn2) {
          var note = form.querySelector('[name="note"]').value.trim();
          UI.setBtnLoading(btn2, true);
          window.TadreebDB.cancelMeeting(meetingId, note).then(function () {
            UI.setBtnLoading(btn2, false);
            close2();
            UI.toast('تم إلغاء الاجتماع', 'success');
            App.refresh();
          }).catch(function (err) { UI.setBtnLoading(btn2, false); UI.toastError(err); });
        }, { submitLabel: 'تأكيد الإلغاء', width: 'normal' });
    }

    function doDelete() {
      UI.confirmDialog('حذف الاجتماع', 'هل أنت متأكد من حذف «' + (meeting.title || '') + '» نهائياً؟ لا يمكن التراجع.', function () {
        window.TadreebDB.deleteMeeting(meetingId).then(function () {
          UI.toast('تم حذف الاجتماع', 'success');
          App.refresh();
        }).catch(UI.toastError);
      });
    }
  }

  window.Screens.calendar = { render: render };
})();
