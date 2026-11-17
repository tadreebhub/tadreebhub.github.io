// تدريب — شاشة رزنامة القاعات (أسبوع / شهر).
// تُسجَّل في window.Screens.calendar.
(function () {
  'use strict';

  var state = {
    view: 'week',
    weekStart: null, // تاريخ الأحد (YYYY-MM-DD)
    monthYear: null, // {year, month}
    monthLabel: ''
  };

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
  }

  function render(container) {
    ensureState();
    var Store = App.Store;
    var today = UI.todayStr();

    var subtitle;
    if (state.view === 'week') {
      var start = UI.parseDateStr(state.weekStart);
      var end = UI.parseDateStr(addDays(state.weekStart, 4)); // الخميس
      subtitle = 'الأسبوع: ' + start.getDate() + ' - ' + end.getDate() + ' ' +
        UI.LEVANT_MONTHS[start.getMonth()] + ' ' + start.getFullYear();
    } else {
      subtitle = 'عرض شهري';
    }

    var html = '';
    html += '<div class="page-head"><div><h1>رزنامة القاعات</h1>' +
      '<div class="muted">' + UI.escapeHtml(subtitle) + '</div></div>' +
      '<div class="head-actions">' +
      '<button class="btn btn-outline btn-sm" type="button" id="cal-prev-btn">السابق</button>' +
      '<button class="btn btn-outline btn-sm" type="button" id="cal-today-btn">اليوم</button>' +
      '<button class="btn btn-outline btn-sm" type="button" id="cal-next-btn">التالي</button>' +
      '<button class="btn btn-outline btn-sm" type="button" id="cal-export-btn">تصدير إكسل ↓</button>' +
      '</div></div>';

    html += '<div class="chips">' +
      '<button class="chip' + (state.view === 'week' ? ' active' : '') + '" type="button" data-cal-view="week">أسبوع</button>' +
      '<button class="chip' + (state.view === 'month' ? ' active' : '') + '" type="button" data-cal-view="month">شهر</button>' +
      '</div>';

    if (state.view === 'week') {
      html += renderWeek(today);
    } else {
      html += renderMonth(today);
    }

    container.innerHTML = html;

    container.querySelectorAll('[data-cal-view]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.view = btn.getAttribute('data-cal-view');
        render(container);
      });
    });
    document.getElementById('cal-prev-btn').addEventListener('click', function () {
      if (state.view === 'week') state.weekStart = addDays(state.weekStart, -7);
      else shiftMonth(-1);
      render(container);
    });
    document.getElementById('cal-next-btn').addEventListener('click', function () {
      if (state.view === 'week') state.weekStart = addDays(state.weekStart, 7);
      else shiftMonth(1);
      render(container);
    });
    document.getElementById('cal-today-btn').addEventListener('click', function () {
      state.weekStart = sundayOf(UI.todayStr());
      var now = new Date();
      state.monthYear = { year: now.getFullYear(), month: now.getMonth() };
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

    // النقر على جلسة في أي من العرضين
    container.querySelectorAll('[data-session-open]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        if (window.SessionScreen) window.SessionScreen.open(el.getAttribute('data-session-open'));
      });
    });
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
      '<span><span class="dot" style="background:#94A3B8"></span>ملغاة</span>' +
      '<span><span class="dot" style="background:#B45309"></span>عطلة</span>' +
      '</div>';

    html += '<div class="card"><div class="table-wrap"><table><thead><tr><th>الفترة</th>';
    days.forEach(function (day) {
      var d = UI.parseDateStr(day.date);
      html += '<th>' + UI.escapeHtml(UI.WEEKDAYS[d.getDay()]) + ' ' + d.getDate() +
        (day.date === today ? ' <span class="pill pill-navy">اليوم</span>' : '') + '</th>';
    });
    html += '</tr></thead><tbody>';

    if (!periods.length) {
      html += '<tr><td colspan="6"><div class="muted">لا فترات تدريبية معرّفة — أضف فترة من الدليل.</div></td></tr>';
    }
    periods.forEach(function (p) {
      html += '<tr><td><strong>' + UI.escapeHtml(p.label) + '</strong><div class="muted">' + UI.fmtTimeRange(p.start, p.end) + '</div></td>';
      days.forEach(function (day) {
        html += '<td>';
        if (holidays[day.date]) {
          html += '<div class="hl hl-holiday">عطلة: ' + UI.escapeHtml(holidays[day.date]) + '</div>';
        } else if (!halls.length) {
          html += '<div class="muted">لا قاعات</div>';
        } else {
          halls.forEach(function (hall) {
            var sess = App.Store.getAll('sessions').find(function (s) {
              return s.date === day.date && s.periodId === p.id && s.hallId === hall.id;
            });
            if (!sess) {
              html += '<div class="hl hl-free">' + UI.escapeHtml(shortHall(hall.name)) + ': متاحة</div>';
            } else {
              var course = App.Store.get('courses', sess.courseId);
              var cancelled = sess.state === 'cancelled';
              html += '<div class="hl ' + (cancelled ? 'hl-cancel' : 'hl-busy') + '" data-session-open="' + UI.escapeHtml(sess.id) + '">' +
                UI.escapeHtml(shortHall(hall.name)) + ': ' + UI.escapeHtml(course ? course.name : '') +
                (cancelled ? ' · ملغاة' : '') + '</div>';
            }
          });
          // جلسات بلا قاعة في هذا الموعد
          var unassigned = App.Store.getAll('sessions').filter(function (s) {
            return s.date === day.date && s.periodId === p.id && !s.hallId;
          });
          unassigned.forEach(function (s) {
            var course = App.Store.get('courses', s.courseId);
            html += '<div class="hl hl-busy" data-session-open="' + UI.escapeHtml(s.id) + '">بلا قاعة: ' +
              UI.escapeHtml(course ? course.name : '') + '</div>';
          });
        }
        html += '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table></div></div>';
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

    var html = '<div class="card"><div class="section-title-row"><h2 style="margin:0">' +
      UI.escapeHtml(UI.fmtMonthYear(year, month)) + '</h2></div>' +
      '<div class="legend"><span><span class="dot" style="background:#2F6F8F"></span>اليوم</span>' +
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
        var isWeekend = dow === 5 || dow === 6;
        var sessions = Store.getAll('sessions').filter(function (s) { return s.date === dateStr; });
        html += '<td class="' + (isToday ? 'today-cell' : isWeekend ? 'weekend-cell' : '') + '"><div class="m-day">' + day + '</div>';
        if (holidays[dateStr]) {
          html += '<span class="m-chip m-holiday">عطلة: ' + UI.escapeHtml(holidays[dateStr]) + '</span>';
        }
        sessions.forEach(function (s) {
          var course = App.Store.get('courses', s.courseId);
          var cancelled = s.state === 'cancelled';
          html += '<span class="m-chip' + (cancelled ? ' m-cancel' : '') + '" data-session-open="' + UI.escapeHtml(s.id) + '">' +
            UI.escapeHtml(course ? course.name : '') + (cancelled ? ' · ملغاة' : '') + '</span>';
        });
        html += '</td>';
        day++;
      }
      html += '</tr>';
    }
    html += '</tbody></table></div></div>';
    return html;
  }

  window.Screens.calendar = { render: render };
})();
