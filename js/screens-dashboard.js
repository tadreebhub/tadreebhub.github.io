// تدريب — شاشة لوحة المعلومات.
// تُسجَّل في window.Screens.dashboard. تعتمد على App.Store و UI.
(function () {
  'use strict';

  function weekBounds() {
    var now = new Date();
    var start = new Date(now.getTime());
    start.setDate(start.getDate() - start.getDay()); // الأحد
    var end = new Date(start.getTime());
    end.setDate(end.getDate() + 6); // السبت
    return { start: UI.dateToStr(start), end: UI.dateToStr(end) };
  }

  function render(container) {
    var Store = App.Store;
    var today = UI.todayStr();
    var courses = Store.getAll('courses');
    var activeCourses = courses.filter(function (c) { return c.status === 'active'; });
    var sessions = Store.getAll('sessions');
    var todaySessions = sessions.filter(function (s) { return s.date === today; })
      .sort(function (a, b) {
        var pa = Store.get('periods', a.periodId);
        var pb = Store.get('periods', b.periodId);
        return (pa ? pa.order : 99) - (pb ? pb.order : 99);
      });
    var traineesCount = Store.getAll('trainees').length;

    var upcoming = sessions.filter(function (s) {
      return s.date > today && s.state !== 'cancelled';
    }).sort(function (a, b) { return a.date < b.date ? -1 : 1; }).slice(0, 8);

    var html = '';
    html += '<div class="page-head"><div><h1>لوحة المعلومات</h1>' +
      '<div class="muted">' + UI.escapeHtml(UI.fmtDateFull(new Date())) + '</div></div>' +
      '<div class="head-actions"><button class="btn btn-outline btn-sm" type="button" id="dash-export-btn">تصدير إكسل ↓</button></div></div>';

    html += '<div class="stats">' +
      '<div class="stat"><div class="stat-num">' + UI.fmtNumber(activeCourses.length) + '</div><div class="stat-label">دورات نشطة</div></div>' +
      '<div class="stat"><div class="stat-num">' + UI.fmtNumber(todaySessions.length) + '</div><div class="stat-label">جلسات اليوم</div></div>' +
      '<div class="stat"><div class="stat-num" id="dash-week-rate">—</div><div class="stat-label">نسبة الحضور هذا الأسبوع</div></div>' +
      '<div class="stat"><div class="stat-num">' + UI.fmtNumber(traineesCount) + '</div><div class="stat-label">متدرب مسجل</div></div>' +
      '</div>';

    html += '<div class="cols">';
    // جلسات اليوم
    html += '<div class="card"><h2>جلسات اليوم</h2>';
    if (!todaySessions.length) {
      html += UI.emptyState('لا جلسات اليوم', 'لا توجد جلسات مجدولة لهذا اليوم.');
    } else {
      todaySessions.forEach(function (s) {
        var course = Store.get('courses', s.courseId);
        var period = Store.get('periods', s.periodId);
        html += '<div class="session-item clickable" data-session-open="' + UI.escapeHtml(s.id) + '">' +
          '<div><strong>' + UI.escapeHtml(course ? course.name : '') + '</strong>' +
          '<div class="muted">' + UI.escapeHtml(App.hallName(s.hallId) || 'بلا قاعة') +
          ' · ' + UI.escapeHtml(course ? App.trainerName(course.trainerId) || 'بلا مدرب' : '') +
          ' ' + UI.pillForSessionState(s.state) + '</div></div>' +
          '<div class="session-time ltr">' + UI.escapeHtml(period ? period.start : '') + '</div></div>';
      });
    }
    html += '</div>';

    // ملخص الحضور هذا الأسبوع
    html += '<div class="card"><h2>ملخص الحضور هذا الأسبوع</h2><div id="dash-week-attendance">' +
      UI.loadingState('جارٍ تحميل الحضور…') + '</div></div>';
    html += '</div>';

    // الجلسات القادمة
    html += '<div class="card"><h2>الجلسات القادمة</h2>';
    if (!upcoming.length) {
      html += UI.emptyState('لا جلسات قادمة', 'لا توجد جلسات مجدولة في الأيام القادمة.');
    } else {
      html += '<div class="table-wrap"><table class="t-compact"><thead><tr><th>الدورة</th><th>التاريخ</th><th>الوقت</th><th class="hide-m">القاعة</th><th class="hide-m">المدرب</th></tr></thead><tbody>';
      upcoming.forEach(function (s) {
        var course = Store.get('courses', s.courseId);
        var period = Store.get('periods', s.periodId);
        html += '<tr class="clickable" data-session-open="' + UI.escapeHtml(s.id) + '"><td>' +
          UI.escapeHtml(course ? course.name : '') + '</td><td>' +
          UI.escapeHtml(UI.fmtDateFull(s.date)) + '</td><td>' +
          (period ? UI.fmtTimeRange(period.start, period.end) : '') + '</td>' +
          '<td class="hide-m">' + UI.escapeHtml(App.hallName(s.hallId) || 'بلا قاعة') + '</td>' +
          '<td class="hide-m">' + UI.escapeHtml(course ? App.trainerName(course.trainerId) || 'بلا مدرب' : '') + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }
    html += '</div>';

    // تقدم الدورات النشطة
    html += '<div class="card"><h2>تقدم الدورات النشطة</h2>';
    if (!activeCourses.length) {
      html += UI.emptyState('لا دورات نشطة', 'أنشئ دورة جديدة من شاشة الدورات لتبدأ.', App.canWrite() ? 'دورة جديدة' : null, 'dash-new-course');
    } else {
      activeCourses.forEach(function (c) {
        var prog = App.courseProgress(c.id);
        html += '<div style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;gap:10px"><span class="track-name" data-course-open="' +
          UI.escapeHtml(c.id) + '">' + UI.escapeHtml(c.name) + '</span><span class="muted">' +
          prog.done + ' من ' + prog.total + ' جلسة</span></div>' +
          '<div class="progress" style="margin-top:6px"><i style="width:' + prog.percent + '%"></i></div></div>';
      });
    }
    html += '</div>';

    // متابعة الدورات
    html += '<div class="card"><h2>متابعة الدورات</h2>';
    if (!activeCourses.length) {
      html += '<div class="muted">لا دورات نشطة للمتابعة.</div>';
    } else {
      activeCourses.forEach(function (c) {
        var prog = App.courseProgress(c.id);
        var budget = App.budgetFromCache(c.id);
        var spentPct = budget.allocated > 0 ? Math.min(100, Math.round((budget.totalSpent / budget.allocated) * 100)) : 0;
        html += '<div class="track-row"><div class="track-name" data-course-open="' + UI.escapeHtml(c.id) + '">' +
          UI.escapeHtml(c.name) + '</div>' +
          '<div class="track-meter"><div class="track-label">الجلسات: ' + prog.done + ' من ' + prog.total + ' · ' + prog.percent + '%</div>' +
          '<div class="progress"><i style="width:' + prog.percent + '%"></i></div></div>' +
          '<div class="track-meter"><div class="track-label">الميزانية: ' + UI.fmtMoney(budget.totalSpent) + ' من ' + UI.fmtMoney(budget.allocated) + ' · ' + spentPct + '%</div>' +
          '<div class="progress"><i style="width:' + spentPct + '%"></i></div></div></div>';
      });
    }
    html += '</div>';

    container.innerHTML = html;

    // ربط الأحداث
    container.querySelectorAll('[data-session-open]').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-session-open');
        if (window.SessionScreen) window.SessionScreen.open(id);
      });
    });
    container.querySelectorAll('[data-course-open]').forEach(function (el) {
      el.addEventListener('click', function () {
        App.showScreen('course-detail', { courseId: el.getAttribute('data-course-open') });
      });
    });
    var newCourseBtn = document.getElementById('dash-new-course');
    if (newCourseBtn) newCourseBtn.addEventListener('click', function () { App.showScreen('courses'); });

    var exportBtn = document.getElementById('dash-export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        UI.openPicker({
          title: 'تصدير أوقات اليوم',
          sections: [
            { id: 'today', label: 'أوقات اليوم', checked: true }
          ],
          scopeOptions: [
            { id: 'today', label: 'اليوم فقط' },
            { id: 'week', label: 'الأسبوع كاملاً' }
          ],
          onConfirm: function (result) {
            if (result.scope === 'week') {
              var bounds = weekBounds();
              var start = UI.parseDateStr(bounds.start);
              UI.callExport('exportWeekCalendar', [App.buildWeekData(bounds.start)]);
            } else {
              UI.callExport('exportToday', [App.buildTodayData(today)]);
            }
          }
        });
      });
    }

    // ملخص حضور الأسبوع (تحميل غير متزامن)
    loadWeekAttendance();

    function loadWeekAttendance() {
      var bounds = weekBounds();
      var weekSessions = sessions.filter(function (s) {
        return s.date >= bounds.start && s.date <= bounds.end;
      });
      if (!weekSessions.length) {
        var box0 = document.getElementById('dash-week-attendance');
        if (box0) box0.innerHTML = '<div class="muted">لا جلسات هذا الأسبوع.</div>';
        var rate0 = document.getElementById('dash-week-rate');
        if (rate0) rate0.textContent = '—';
        return;
      }
      var counts = { present: 0, absent: 0, excused: 0 };
      var chain = Promise.resolve();
      weekSessions.forEach(function (s) {
        chain = chain.then(function () {
          return window.TadreebDB.getSessionAttendance(s.id).then(function (map) {
            Object.keys(map).forEach(function (k) {
              var st = map[k].status;
              if (counts[st] != null) counts[st]++;
            });
          }).catch(function () { /* جلسة بلا حضور مسجل — تُتجاهل */ });
        });
      });
      chain.then(function () {
        var total = counts.present + counts.absent + counts.excused;
        var box = document.getElementById('dash-week-attendance');
        var rate = document.getElementById('dash-week-rate');
        if (rate) rate.textContent = total ? UI.fmtPercent(counts.present, total) : '—';
        if (!box) return;
        if (!total) {
          box.innerHTML = '<div class="muted">لم يُسجَّل حضور بعد هذا الأسبوع.</div>';
          return;
        }
        var pct = function (n) { return Math.round((n / total) * 100); };
        box.innerHTML =
          '<div>موجود · ' + counts.present + ' <span class="muted">(' + pct(counts.present) + '%)</span></div>' +
          '<div class="mini-bar"><i style="width:' + pct(counts.present) + '%;background:#2E7D32"></i></div>' +
          '<div>غائب · ' + counts.absent + ' <span class="muted">(' + pct(counts.absent) + '%)</span></div>' +
          '<div class="mini-bar"><i style="width:' + pct(counts.absent) + '%;background:#C62828"></i></div>' +
          '<div>معتذر · ' + counts.excused + ' <span class="muted">(' + pct(counts.excused) + '%)</span></div>' +
          '<div class="mini-bar"><i style="width:' + pct(counts.excused) + '%;background:#B45309"></i></div>' +
          '<div class="muted">إجمالي الحضور المسجل هذا الأسبوع: ' + total + '</div>';
      });
    }
  }

  window.Screens.dashboard = { render: render };
})();
