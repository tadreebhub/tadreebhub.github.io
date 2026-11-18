// تدريب — تفاصيل الجلسة والحضور (نافذة كبيرة + مكوّن حضور مشترك + ورقة إجراءات).
// يكشف window.SessionScreen = { open(sessionId), openActionSheet(sessionId, opts), renderAttendanceBlock(el, sessionId, opts) }.
(function () {
  'use strict';

  // نطاق الفترة بنظام 12 ساعة («09:00 ص - 11:00 ص») عبر TadreebTime؛
  // إن غابت الوحدة يُعرض النص الخام (بلا تعطّل أبداً).
  function periodRange12(p) {
    try {
      if (window.TadreebTime && typeof window.TadreebTime.formatTimeRange12 === 'function') {
        return window.TadreebTime.formatTimeRange12(p.start, p.end);
      }
    } catch (e) { /* احتياطي أدناه */ }
    return (p.start || '') + ' - ' + (p.end || '');
  }

  // ---------- مساعدات v2.3 (نقل/دمج/تأجيل/حضور) ----------
  // تسميات حالات الحضور الإضافية: ui-helpers.js لا يملك «ملغي»
  // و«لم يحضر» — نمدّد خريطة التسميات المشتركة عند التحميل (هذا
  // الملف يُحمَّل بعد ui-helpers.js دائماً) حتى تظهر التسميتان في
  // الشارات والتصدير دون تعديل ملف آخر.
  if (typeof UI !== 'undefined' && UI.ATTENDANCE_LABELS) {
    if (!UI.ATTENDANCE_LABELS.cancelled) UI.ATTENDANCE_LABELS.cancelled = 'ملغي';
    if (!UI.ATTENDANCE_LABELS['did-not-attend']) UI.ATTENDANCE_LABELS['did-not-attend'] = 'لم يحضر';
  }
  // حالة إرثية: تُعرض بتسميتها الأصلية ولا تُختار (3 خيارات فقط).
  function isLegacyAttStatus(status) { return status === 'excused' || status === 'did-not-attend'; }

  // نوع القاعة: 'computer' أو 'admin' (الغائب = إدارية). مصدر
  // الحقيقة TadreebDB.hallTypeOf (يملكه عامل الأنواع — الحقل
  // hallType)؛ الاحتياطي يقرأ hallType ثم type.
  function hallTypeOf(hall) {
    try {
      if (window.TadreebDB && typeof window.TadreebDB.hallTypeOf === 'function') {
        var t = window.TadreebDB.hallTypeOf(hall);
        if (t === 'computer' || t === 'admin') return t;
      }
    } catch (e) { /* احتياطي أدناه */ }
    if (hall && (hall.hallType === 'computer' || hall.type === 'computer')) return 'computer';
    return 'admin';
  }
  function hallTypeLabel(type) { return type === 'computer' ? 'حاسوب' : 'إدارية'; }
  function hallOptionLabel(h) {
    return App.displayCode(h, 'halls') + ' — ' + h.name + ' (' + hallTypeLabel(hallTypeOf(h)) + ')';
  }

  // نوع القاعة المطلوب لجلسة عند إعادة جدولتها (v2.3.1): لدورة
  // مختلطة يُشتق من ترتيب الجلسة في دورتها (الأولى إدارية ثم
  // التقنية — App.sessionTypeOf) لا من قاعتها الحالية؛ لغير
  // المختلطة نوع القاعة الحالية كما قبل (بلا قاعة حالية: أي نوع).
  function sessionWantHallType(session) {
    var course = session && session.courseId ? App.Store.get('courses', session.courseId) : null;
    if (course && window.TadreebDB && typeof window.TadreebDB.courseTypeOf === 'function' &&
        window.TadreebDB.courseTypeOf(course) === 'mixed' &&
        typeof App.sessionTypeOf === 'function') {
      return App.sessionTypeOf(session) === 'technical' ? 'computer' : 'admin';
    }
    var currentHall = session && session.hallId ? App.Store.get('halls', session.hallId) : null;
    return currentHall ? hallTypeOf(currentHall) : null;
  }

  // أيام العطلة الأسبوعية: من الإعدادات عبر
  // TadreebDB.getWeekendDays() إن وُجدت، وإلا الجمعة + السبت.
  function weekendDays() {
    try {
      if (window.TadreebDB && typeof window.TadreebDB.getWeekendDays === 'function') {
        var wd = window.TadreebDB.getWeekendDays();
        if (Array.isArray(wd) && wd.length) return wd;
      }
    } catch (e) { /* الافتراضي أدناه */ }
    return [5, 6];
  }

  function addDaysISO(dateStr, n) {
    var d = UI.parseDateStr(dateStr);
    if (!d) return dateStr;
    d.setDate(d.getDate() + n);
    return UI.dateToStr(d);
  }
  function todayDamascusISO() {
    try {
      if (window.TadreebTime && typeof window.TadreebTime.todayISO === 'function') return window.TadreebTime.todayISO();
    } catch (e) { /* احتياطي أدناه */ }
    return UI.todayStr();
  }
  function weekdayOf(dateStr) {
    var d = UI.parseDateStr(dateStr);
    return d ? d.getDay() : -1;
  }
  // قفل تحرير الحضور: مسموح يوم الجلسة واليوم التالي فقط؛ من
  // اليوم الثاني بعدها يُغلق للجميع بلا استثناء (بتوقيت دمشق).
  function isAttendanceLocked(sessionDate) {
    if (!sessionDate) return false;
    return todayDamascusISO() > addDaysISO(sessionDate, 1);
  }
  // هل التاريخ عطلة مسجلة؟
  function isHolidayDate(dateStr) {
    return App.Store.getAll('holidays').some(function (h) { return h.date === dateStr; });
  }

  // إشغال موعد من المخزن المحلي (بنفس قواعد checkHallAvailability:
  // جلسة مجدولة غير ملغاة/عطلة أو اجتماع غير ملغى). تُعيد خريطة
  // hallId -> تسمية الشاغل، باستثناء الجلسة نفسها.
  function slotOccupants(dateStr, periodId, excludeSessionId) {
    var busy = {};
    App.Store.getAll('sessions').forEach(function (s) {
      if (s.id === excludeSessionId) return;
      if (s.date !== dateStr || s.periodId !== periodId) return;
      if (!s.hallId || s.state === 'cancelled' || s.state === 'holiday') return;
      var c = App.Store.get('courses', s.courseId);
      busy[s.hallId] = c ? App.courseName(c) : 'جلسة تدريبية';
    });
    App.Store.getAll('meetings').forEach(function (m) {
      if (m.date !== dateStr || m.periodId !== periodId) return;
      if (!m.hallId || m.status === 'cancelled') return;
      busy[m.hallId] = 'اجتماع: ' + (m.title || '');
    });
    return busy;
  }
  // أول قاعة حرة من النوع المطلوب (القاعة الحالية أولاً إن كانت حرة).
  function firstFreeHallOfType(dateStr, periodId, wantType, preferHallId, excludeSessionId) {
    var busy = slotOccupants(dateStr, periodId, excludeSessionId);
    var halls = App.Store.getAll('halls').slice();
    halls.sort(function (a, b) {
      if (a.id === preferHallId) return -1;
      if (b.id === preferHallId) return 1;
      return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
    });
    for (var i = 0; i < halls.length; i++) {
      if (busy[halls[i].id]) continue;
      if (wantType && hallTypeOf(halls[i]) !== wantType) continue;
      return halls[i];
    }
    return null;
  }
  // البحث التلقائي عن أقرب موعد حر: بدءاً من الغد (أو من اليوم
  // التالي للجلسة إن كانت مستقبلية)، الفترة نفسها أولاً ثم باقي
  // الفترات، قاعة من النوع المطابق، تخطّي العطل الأسبوعية
  // والمسجلة، أفق 56 يوماً. تُعيد {date, periodId, hallId} أو null.
  function findNextFreeSlot(session) {
    var periods = App.Store.getAll('periods').slice()
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    if (!periods.length) return null;
    var ordered = periods.slice().sort(function (a, b) {
      if (a.id === session.periodId) return -1;
      if (b.id === session.periodId) return 1;
      return (a.order || 0) - (b.order || 0);
    });
    var wantType = sessionWantHallType(session);
    var holidays = {};
    App.Store.getAll('holidays').forEach(function (h) { holidays[h.date] = true; });
    var wd = weekendDays();
    var start = addDaysISO(session.date, 1);
    var tomorrow = addDaysISO(todayDamascusISO(), 1);
    if (start < tomorrow) start = tomorrow;
    for (var d = 0; d < 56; d++) {
      var date = addDaysISO(start, d);
      if (holidays[date]) continue;
      if (wd.indexOf(weekdayOf(date)) !== -1) continue;
      for (var p = 0; p < ordered.length; p++) {
        var hall = firstFreeHallOfType(date, ordered[p].id, wantType, session.hallId, session.id);
        if (hall) return { date: date, periodId: ordered[p].id, hallId: hall.id };
      }
    }
    return null;
  }

  // صندوق تحذير النقل بين نوعي قاعة (v2.3) — يُضمَّن في نماذج
  // تغيير القاعة؛ يظهر عند اختيار قاعة من نوع مختلف ويطلب تأكيداً
  // صريحاً بخانة اختيار قبل السماح بالحفظ.
  function crossTypeWarnHtml() {
    return '<div class="hall-type-warn" data-cross-type-warn hidden>' +
      '<strong>تحذير: نقل إلى نوع قاعة مختلف</strong>' +
      '<div data-cross-type-detail></div>' +
      '<label class="check-row" style="margin-top:8px"><input type="checkbox" name="crossTypeConfirm"> أؤكد النقل إلى قاعة من نوع مختلف</label></div>';
  }
  // يربط صندوق التحذير بقائمة القاعات في النموذج؛ تُعيد دالة حارس
  // تُستدعى عند الحفظ (true = مسموح: نفس النوع أو مؤكد صراحةً).
  function bindCrossTypeGuard(modalEl, currentHallId) {
    var sel = modalEl.querySelector('[name="hallId"]');
    var warnEl = modalEl.querySelector('[data-cross-type-warn]');
    var detailEl = modalEl.querySelector('[data-cross-type-detail]');
    var confirmBox = modalEl.querySelector('[name="crossTypeConfirm"]');
    var formEl = modalEl.querySelector('form') || modalEl;
    if (!sel || !warnEl) return function () { return true; };
    var currentHall = currentHallId ? App.Store.get('halls', currentHallId) : null;
    function refresh() {
      var targetId = sel.value || null;
      var target = targetId ? App.Store.get('halls', targetId) : null;
      var cross = !!(currentHall && target && targetId !== currentHallId &&
        hallTypeOf(currentHall) !== hallTypeOf(target));
      warnEl.hidden = !cross;
      if (cross && detailEl) {
        detailEl.textContent = 'القاعة الحالية (' + currentHall.name + ') من نوع ' +
          hallTypeLabel(hallTypeOf(currentHall)) + '، والقاعة المختارة (' + target.name + ') من نوع ' +
          hallTypeLabel(hallTypeOf(target)) + ' — قد لا تناسب متطلبات مجموعة التدريب.';
      }
      if (!cross && confirmBox) confirmBox.checked = false;
      return cross;
    }
    sel.addEventListener('change', refresh);
    refresh();
    return function () {
      if (!refresh()) return true;
      if (confirmBox && confirmBox.checked) return true;
      UI.formError(formEl, 'أكّد النقل إلى قاعة من نوع مختلف بوضع علامة في خانة التأكيد');
      return false;
    };
  }

  // قائمة توفر القاعات (نمط v2.2 hallAvailabilityListHtml + نوع القاعة).
  function hallAvailabilityListHtmlV23(rows, isSelfHall) {
    if (!rows.length) return 'لا قاعات مسجلة.';
    return rows.map(function (r) {
      var hall = App.Store.get('halls', r.hallId);
      var typeTag = hall ? ' <span class="muted">(' + hallTypeLabel(hallTypeOf(hall)) + ')</span>' : '';
      var self = isSelfHall ? isSelfHall(r) : false;
      if (r.free || self) {
        return '<div>' + UI.escapeHtml(r.hallName) + typeTag + ' <span class="pill pill-green">متاحة</span></div>';
      }
      return '<div>' + UI.escapeHtml(r.hallName) + typeTag + ' <span class="pill pill-red">مشغولة' +
        (r.sessionCourse ? ' — ' + UI.escapeHtml(r.sessionCourse) : '') + '</span></div>';
    }).join('');
  }

  // ---------- مكوّن الحضور (يُستخدم داخل تفاصيل الدورة ونافذة الجلسة) ----------
  // opts: { embedded: true } — داخل بطاقة موجودة مسبقاً.
  function renderAttendanceBlock(container, sessionId, opts) {
    opts = opts || {};
    if (typeof container._notesDestroy === 'function') {
      container._notesDestroy();
      container._notesDestroy = null;
    }
    var session = App.Store.get('sessions', sessionId);
    if (!session) {
      container.innerHTML = UI.emptyState('الجلسة غير موجودة', 'ربما حُذفت هذه الجلسة.');
      return;
    }
    var course = App.Store.get('courses', session.courseId);
    var canWrite = App.canWrite();
    // قفل التحرير (v2.3): يوم الجلسة + اليوم التالي فقط، للجميع
    // بلا استثناء (بتوقيت دمشق) — قفل واجهة فقط.
    var attLocked = isAttendanceLocked(session.date);
    var canEditAtt = canWrite && !attLocked;
    container.innerHTML = UI.loadingState('جارٍ تحميل الحضور…');

    window.TadreebDB.getSessionAttendance(sessionId).then(function (attMap) {
      var trainees = course ? App.courseTrainees(course) : [];
      var period = App.Store.get('periods', session.periodId);
      var trainer = course ? App.Store.get('trainers', course.trainerId) : null;

      var html = '<div class="muted" style="margin-bottom:14px"><strong>' +
        UI.escapeHtml(App.sessionLabel(session, course)) + '</strong> · ' +
        UI.escapeHtml(UI.fmtDateFull(session.date)) + ' · ' +
        UI.escapeHtml(period ? period.label : '') + ' · ' +
        UI.escapeHtml(App.hallName(session.hallId) || 'بلا قاعة') + ' · ' +
        UI.pillForSessionState(session.state) + '</div>';

      if (session.note) {
        html += '<div class="att-note-box"><strong>ملاحظة الجلسة:</strong> ' + UI.escapeHtml(session.note) + '</div>';
      }
      html += '<div id="att-summary"></div>';
      // لوحة إحصاءات الجلسة (v2.1 — بند 10): بطاقات حضور + تخصيص + تصدير.
      html += '<div id="att-stats-panel"></div>';
      if (attLocked) {
        html += '<div class="att-lock-note">الحضور مغلق — انتهت مهلة التعديل (يوم واحد بعد الجلسة). تُعرض السجلات للقراءة فقط.</div>';
      }

      // حضور المدرب
      if (trainer) {
        html += '<div class="att-row"><div><strong>المدرب: ' + UI.escapeHtml(trainer.name) + '</strong></div>' +
          '<div class="att-choices">';
        if (canEditAtt) {
          html += '<button class="att-choice' + (session.trainerPresent === true ? ' sel-present' : '') + '" type="button" data-trainer-att="present">موجود</button>' +
            '<button class="att-choice' + (session.trainerPresent === false ? ' sel-absent' : '') + '" type="button" data-trainer-att="absent">غائب</button>';
        } else {
          html += session.trainerPresent == null ? '<span class="muted">بلا تسجيل</span>' :
            UI.pillForAttendance(session.trainerPresent ? 'present' : 'absent');
        }
        html += '</div></div>';
      }

      if (!trainees.length) {
        html += '<div class="muted" style="margin-top:12px">لا متدربين في مجموعة التدريب هذه.</div>';
      } else {
        html += '<div style="margin-top:6px">';
        trainees.forEach(function (t) {
          var rec = attMap[t.id] || {};
          var status = rec.status || null;
          html += '<div class="att-row" data-att-row="' + UI.escapeHtml(t.id) + '">' +
            '<div><strong>' + UI.escapeHtml(t.name) + '</strong>' +
            '<div class="muted">' + UI.escapeHtml(App.directorateName(t.directorateId) || 'بلا مديرية') + '</div></div>';
          var legacy = isLegacyAttStatus(status);
          if (canEditAtt) {
            // v2.3: ثلاثة خيارات فقط — موجود / غائب / ملغي.
            html += '<div class="att-choices">' +
              '<button class="att-choice' + (status === 'present' ? ' sel-present' : '') + '" type="button" data-att="present">موجود</button>' +
              '<button class="att-choice' + (status === 'absent' ? ' sel-absent' : '') + '" type="button" data-att="absent">غائب</button>' +
              '<button class="att-choice' + (status === 'cancelled' ? ' sel-cancelled' : '') + '" type="button" data-att="cancelled">ملغي</button>' +
              // مسح التسجيل (إعادة إلى «بلا تسجيل») — يظهر عند وجود
              // تسجيل محفوظ أو اختيار محلي؛ يُحفظ مع زر «حفظ الحضور».
              '<button class="link-btn" type="button" data-att-clear' + (status ? '' : ' hidden') + '>مسح التسجيل</button>' +
              '</div>' +
              // سجل إرثي (معتذر/لم يحضر): يُعرض بتسميته الأصلية
              // ولا يُختار؛ اختيار أحد الخيارات الثلاثة يستبدله.
              (legacy ? '<div class="att-legacy" data-legacy-badge>' + UI.pillForAttendance(status) +
                (rec.note ? ' <span class="muted" style="font-size:13px">المبرر: ' + UI.escapeHtml(rec.note) + '</span>' : '') + '</div>' : '');
          } else {
            html += '<div>' + UI.pillForAttendance(status) +
              (rec.note ? '<div class="muted" style="font-size:13px">المبرر: ' + UI.escapeHtml(rec.note) + '</div>' : '') + '</div>';
          }
          html += '</div>';
        });
        html += '</div>';
        if (canEditAtt) {
          html += '<div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap">' +
            '<button class="btn" type="button" id="att-save-btn">حفظ الحضور</button>' +
            '<button class="btn btn-outline" type="button" id="att-all-present-btn">تحديد الكل موجوداً</button></div>' +
            '<div class="muted" style="margin-top:8px">يمكن تسجيل الحضور وتصحيحه حتى نهاية اليوم التالي للجلسة، ثم يُغلق الحضور. ويمكن مسح تسجيل خاطئ بزر «مسح التسجيل» بجانب المتدرب، وتُسجَّل كل التغييرات في سجل التدقيق.</div>';
        }
      }

      if (opts.embedded) {
        html += '<h3 style="margin-top:24px">ملاحظات الجلسة</h3><div id="att-notes-box"></div>';
      }

      container.innerHTML = html;

      // ملخص الحضور: مجموعات بعددها (حاضرون / غائبون / معتذرون / بلا تسجيل)،
      // يُعاد حسابه من الحالة المحلية عند كل تغيير اختيار.
      var summaryEl = container.querySelector('#att-summary');
      // لوحة إحصاءات الجلسة (v2.1 — بند 10): تُرسم مرة واحدة ثم تُحدَّث
      // قيمها عند كل تغيير اختيار (بلا إعادة رسم كاملة حتى لا يضيع
      // تخصيص المستخدم). تُتخطى بهدوء إن غابت وحدة الإحصاءات.
      var statsPanelEl = container.querySelector('#att-stats-panel');
      var statsRendered = false;
      function updateStatsPanel(stateMap) {
        if (!statsPanelEl || !window.TadreebStats) return;
        var metrics = window.TadreebStats.computeSession(stateMap, trainees, session.trainerPresent).metrics;
        if (!statsRendered) {
          statsRendered = true;
          window.TadreebStats.renderPanel(statsPanelEl, {
            section: 'session',
            title: 'إحصاءات الجلسة',
            metrics: metrics,
            export: {
              label: 'تصدير الحضور ↓',
              onClick: function () {
                App.buildAttendanceData(sessionId).then(function (data) {
                  UI.callExport('exportAttendance', [data]);
                }).catch(UI.toastError);
              }
            }
          });
        } else {
          window.TadreebStats.updateMetrics(statsPanelEl, metrics);
        }
      }
      function summaryHtml(stateMap) {
        var groups = { present: [], absent: [], excused: [], didNotAttend: [], cancelled: [], none: [] };
        trainees.forEach(function (t) {
          var st = (stateMap[t.id] || {}).status || null;
          if (st === 'present') groups.present.push(t);
          else if (st === 'absent') groups.absent.push(t);
          else if (st === 'excused') groups.excused.push(t);
          else if (st === 'did-not-attend') groups.didNotAttend.push(t);
          else if (st === 'cancelled') groups.cancelled.push(t);
          else groups.none.push(t);
        });
        function groupHtml(title, list, withNote) {
          var names = list.length ? list.map(function (t) {
            var n = UI.escapeHtml(t.name);
            if (withNote) {
              var note = (stateMap[t.id] || {}).note;
              if (note) n += ' <span class="muted">(' + UI.escapeHtml(note) + ')</span>';
            }
            return n;
          }).join('، ') : 'لا أحد';
          return '<div class="att-sum-group"><div class="att-sum-title">' + title + ' (' + list.length + ')</div><div>' + names + '</div></div>';
        }
        var out = '<div class="att-summary">';
        if (trainer) {
          var tp = session.trainerPresent == null ? 'بلا تسجيل' : (session.trainerPresent ? 'موجود' : 'غائب');
          out += '<div class="att-sum-trainer">المدرب: ' + UI.escapeHtml(trainer.name) + ' — ' + tp + '</div>';
        }
        out += groupHtml('الحاضرون', groups.present, false);
        out += groupHtml('الغائبون', groups.absent, false);
        out += groupHtml('الملغاة', groups.cancelled, false);
        out += groupHtml('المعتذرون', groups.excused, true);
        if (groups.didNotAttend.length) out += groupHtml('لم يحضر', groups.didNotAttend, false);
        out += groupHtml('بلا تسجيل', groups.none, false);
        out += '</div>';
        return out;
      }
      function renderSummary(stateMap) {
        if (summaryEl) summaryEl.innerHTML = summaryHtml(stateMap);
        updateStatsPanel(stateMap);
      }

      // ملاحظات الجلسة في الوضع المدمج فقط (النافذة الكاملة فيها مكوّن ملاحظات أصلاً).
      if (opts.embedded) {
        var notesBox = container.querySelector('#att-notes-box');
        if (notesBox) container._notesDestroy = UI.notesWidget('session', sessionId, notesBox, { canWrite: canWrite });
      }

      if (!canEditAtt) {
        renderSummary(attMap);
        return;
      }

      // حالة الحضور المحلية (تُحفظ دفعة واحدة)
      var local = {};
      trainees.forEach(function (t) {
        var rec = attMap[t.id] || {};
        local[t.id] = { status: rec.status || null, note: rec.note || '' };
      });
      renderSummary(local);

      container.querySelectorAll('[data-att-row]').forEach(function (row) {
        var traineeId = row.getAttribute('data-att-row');
        var legacyBadge = row.querySelector('[data-legacy-badge]');
        var clearBtn = row.querySelector('[data-att-clear]');
        row.querySelectorAll('[data-att]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var status = btn.getAttribute('data-att');
            local[traineeId].status = status;
            local[traineeId].note = '';
            row.querySelectorAll('[data-att]').forEach(function (b) {
              b.classList.remove('sel-present', 'sel-absent', 'sel-cancelled');
            });
            btn.classList.add(status === 'present' ? 'sel-present' : status === 'absent' ? 'sel-absent' : 'sel-cancelled');
            if (legacyBadge) legacyBadge.hidden = true;
            if (clearBtn) clearBtn.hidden = false;
            renderSummary(local);
          });
        });
        if (clearBtn) {
          clearBtn.addEventListener('click', function () {
            local[traineeId] = { status: null, note: '' };
            row.querySelectorAll('[data-att]').forEach(function (b) {
              b.classList.remove('sel-present', 'sel-absent', 'sel-cancelled');
            });
            if (legacyBadge) legacyBadge.hidden = true;
            clearBtn.hidden = true;
            renderSummary(local);
          });
        }
      });

      var allPresentBtn = container.querySelector('#att-all-present-btn');
      if (allPresentBtn) {
        allPresentBtn.addEventListener('click', function () {
          trainees.forEach(function (t) { local[t.id] = { status: 'present', note: '' }; });
          container.querySelectorAll('[data-att-row]').forEach(function (row) {
            row.querySelectorAll('[data-att]').forEach(function (b) {
              b.classList.toggle('sel-present', b.getAttribute('data-att') === 'present');
              b.classList.remove('sel-absent', 'sel-cancelled');
            });
            var badge = row.querySelector('[data-legacy-badge]');
            if (badge) badge.hidden = true;
            var cb = row.querySelector('[data-att-clear]');
            if (cb) cb.hidden = false;
          });
          renderSummary(local);
        });
      }

      // حضور المدرب
      container.querySelectorAll('[data-trainer-att]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var present = btn.getAttribute('data-trainer-att') === 'present';
          window.TadreebDB.recordTrainerAttendance(sessionId, present).then(function () {
            UI.toast(present ? 'تم تسجيل حضور المدرب' : 'تم تسجيل غياب المدرب', 'success');
            App.refresh();
          }).catch(UI.toastError);
        });
      });

      var saveBtn = container.querySelector('#att-save-btn');
      if (saveBtn) {
        saveBtn.addEventListener('click', function () {
          UI.setBtnLoading(saveBtn, true, 'جارٍ الحفظ…');
          var chain = Promise.resolve();
          var changed = 0;
          trainees.forEach(function (t) {
            var rec = local[t.id];
            var old = attMap[t.id] || {};
            if (!rec.status) {
              // مسح تسجيل سابق (إعادة إلى «بلا تسجيل»)؛ بلا تسجيل
              // قديم لا شيء يُحفظ.
              if (old.status) {
                changed++;
                chain = chain.then(function () {
                  return window.TadreebDB.clearAttendance(sessionId, t.id);
                });
              }
              return;
            }
            if (rec.status === old.status && rec.note === (old.note || '')) return; // بلا تغيير
            changed++;
            chain = chain.then(function () {
              return window.TadreebDB.setAttendance(sessionId, t.id, rec.status, rec.note);
            });
          });
          chain.then(function () {
            UI.setBtnLoading(saveBtn, false);
            UI.toast(changed ? 'تم حفظ الحضور (' + changed + ' سجلاً)' : 'لا تغييرات للحفظ', 'success');
            App.refresh();
          }).catch(function (err) {
            UI.setBtnLoading(saveBtn, false);
            UI.toastError(err);
          });
        });
      }
    }).catch(function (err) {
      container.innerHTML = '<div class="muted">تعذّر تحميل الحضور.</div>';
      UI.toastError(err);
    });
  }

  // ---------- نافذة تفاصيل الجلسة ----------
  function open(sessionId) {
    var session = App.Store.get('sessions', sessionId);
    if (!session) { UI.toast('الجلسة غير موجودة', 'error'); return; }
    var course = App.Store.get('courses', session.courseId);
    var canWrite = App.canWrite();
    var period = App.Store.get('periods', session.periodId);

    var modal = UI.openModal({
      title: 'تفاصيل الجلسة',
      width: 'xwide',
      bodyHTML:
        '<div class="meta-grid">' +
        '<div class="meta-box"><div class="k">الجلسة</div><div class="v">' + UI.escapeHtml(App.sessionLabel(session, course)) + '</div></div>' +
        '<div class="meta-box"><div class="k">الدورة</div><div class="v">' + UI.escapeHtml(course ? App.courseName(course) : '') + '</div></div>' +
        '<div class="meta-box"><div class="k">التاريخ</div><div class="v">' + UI.escapeHtml(UI.fmtDateFull(session.date)) + '</div></div>' +
        '<div class="meta-box"><div class="k">الفترة</div><div class="v">' + UI.escapeHtml(period ? period.label : '') + ' ' + (period ? UI.fmtTimeRange(period.start, period.end) : '') + '</div></div>' +
        '<div class="meta-box"><div class="k">القاعة</div><div class="v">' + UI.escapeHtml(App.hallName(session.hallId) || 'بلا قاعة') + '</div></div>' +
        '<div class="meta-box"><div class="k">المدرب</div><div class="v">' + UI.escapeHtml(course ? App.trainerName(course.trainerId) || 'بلا مدرب' : '') + '</div></div>' +
        '<div class="meta-box"><div class="k">الحالة</div><div class="v">' + UI.pillForSessionState(session.state) + '</div></div>' +
        '</div>' +
        (session.note ? '<div class="card-white" style="margin-bottom:18px"><strong>ملاحظة الجلسة:</strong> ' + UI.escapeHtml(session.note) + '</div>' : '') +
        // v2.3: جلسة تتعارض مع عطلة سُجلت بعد جدولتها — تُعرض
        // إعادة الجدولة مباشرة من التفاصيل.
        ((session.state === 'scheduled' || session.state === 'done') && isHolidayDate(session.date) ?
          '<div class="sess-holiday-banner">تنبيه: تاريخ هذه الجلسة يوم عطلة مسجلة. ' +
          '<button class="link-btn" type="button" id="sess-reschedule-btn">إعادة جدولة الجلسة</button></div>' : '') +
        ((session.splitFrom || session.splitInto) ?
          '<div class="card-white" style="margin-bottom:18px">جزء من جلسة مقسومة' +
          (App.Store.get('sessions', session.splitFrom || session.splitInto) ?
            ' <button class="link-btn" type="button" id="sess-split-other-btn">فتح الجزء الآخر</button>' : '') + '</div>' : '') +
        '<h3>الحضور</h3><div id="sess-att-block"></div>' +
        '<h3 style="margin-top:24px">ملاحظات الجلسة</h3><div id="sess-notes-box"></div>' +
        (canWrite ? '<div style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap">' +
          '<button class="btn btn-outline btn-sm" type="button" id="sess-state-btn">تغيير الحالة</button>' +
          '<button class="btn btn-outline btn-sm" type="button" id="sess-hall-btn">تغيير القاعة</button>' +
          '<button class="btn btn-outline btn-sm" type="button" id="sess-note-btn">ملاحظة الجلسة</button>' +
          '<button class="btn btn-outline btn-sm" type="button" id="sess-course-btn">فتح مجموعة التدريب</button>' +
          '<button class="btn btn-outline btn-sm" type="button" id="sess-export-btn">تصدير الحضور ↓</button>' +
          '</div>' : ''),
      actions: [{ label: 'إغلاق', className: 'btn-outline', closeOnClick: true }],
      onClose: function () { if (notesDestroy) { notesDestroy(); notesDestroy = null; } }
    });

    renderAttendanceBlock(modal.element.querySelector('#sess-att-block'), sessionId, {});
    var notesDestroy = UI.notesWidget('session', sessionId, modal.element.querySelector('#sess-notes-box'), { canWrite: canWrite });

    // إعادة جدولة جلسة متعارضة مع عطلة (v2.3).
    var rescheduleBtn = modal.element.querySelector('#sess-reschedule-btn');
    if (rescheduleBtn) rescheduleBtn.addEventListener('click', function () {
      modal.close();
      setTimeout(function () { openPostponeModal(sessionId); }, 50);
    });

    // إجراءات الجلسة (تُعيد فتح النافذة بعد الحفظ)
    function reopen() {
      modal.close();
      setTimeout(function () { open(sessionId); }, 50);
    }
    var stateBtn = modal.element.querySelector('#sess-state-btn');
    if (stateBtn) stateBtn.addEventListener('click', function () {
      UI.openFormModal('تغيير حالة الجلسة',
        '<div class="field"><label>حالة الجلسة</label><select name="state">' +
        Object.keys(UI.SESSION_STATE_LABELS).map(function (k) {
          return '<option value="' + k + '"' + (session.state === k ? ' selected' : '') + '>' + UI.SESSION_STATE_LABELS[k] + '</option>';
        }).join('') + '</select></div>' +
        '<div class="field"><label>ملاحظة</label><textarea name="note">' + UI.escapeHtml(session.note || '') + '</textarea></div>',
        function (form, close2, btn2) {
          var state = form.querySelector('[name="state"]').value;
          var note = form.querySelector('[name="note"]').value.trim();
          UI.setBtnLoading(btn2, true);
          window.TadreebDB.setSessionState(sessionId, state, note).then(function () {
            UI.setBtnLoading(btn2, false);
            close2();
            UI.toast('تم تحديث حالة الجلسة', 'success');
            App.refresh();
            reopen();
          }).catch(function (err) { UI.setBtnLoading(btn2, false); UI.toastError(err); });
        }, { submitLabel: 'حفظ', width: 'normal' });
    });
    var hallBtn = modal.element.querySelector('#sess-hall-btn');
    if (hallBtn) hallBtn.addEventListener('click', function () {
      var hallGuard = null;
      var hm = UI.openFormModal('تغيير قاعة الجلسة',
        '<div class="field"><label>القاعة</label><select name="hallId"><option value="">بدون قاعة</option>' +
        App.Store.getAll('halls').map(function (h) {
          return '<option value="' + UI.escapeHtml(h.id) + '"' + (session.hallId === h.id ? ' selected' : '') + '>' + UI.escapeHtml(hallOptionLabel(h)) + '</option>';
        }).join('') + '</select><div class="field-hint" id="sess-hall-avail">جارٍ فحص توفر القاعات…</div></div>' + crossTypeWarnHtml(),
        function (form, close2, btn2) {
          var hallId = form.querySelector('[name="hallId"]').value || null;
          if (hallGuard && !hallGuard()) return;
          UI.setBtnLoading(btn2, true);
          // عبر updateSession (لا update العام) ليفحص التعارض قبل الحفظ.
          window.TadreebDB.updateSession(sessionId, { hallId: hallId }).then(function () {
            UI.setBtnLoading(btn2, false);
            close2();
            UI.toast('تم تغيير قاعة الجلسة', 'success');
            App.refresh();
            reopen();
          }).catch(function (err) { UI.setBtnLoading(btn2, false); UI.toastError(err); });
        }, { submitLabel: 'حفظ', width: 'normal' });
      if (hm.element) hallGuard = bindCrossTypeGuard(hm.element, session.hallId);
      window.TadreebDB.checkHallAvailability(session.date, session.periodId).then(function (rows) {
        if (!hm.element || !hm.element.isConnected) return;
        var el = hm.element.querySelector('#sess-hall-avail');
        var busy = rows.filter(function (r) { return !r.free && r.hallId !== session.hallId; });
        if (el) el.textContent = busy.length ?
          'مشغولة في هذا الموعد: ' + busy.map(function (r) { return r.hallName + ' (' + r.sessionCourse + ')'; }).join('، ') :
          'كل القاعات متاحة في هذا الموعد.';
        // تعطيل القاعات المشغولة (قاعة الجلسة نفسها تبقى متاحة).
        var sel = hm.element.querySelector('[name="hallId"]');
        if (sel) sel.querySelectorAll('option[value]').forEach(function (opt) {
          if (!opt.value) return;
          var row = rows.find(function (r) { return r.hallId === opt.value; });
          opt.disabled = !!(row && !row.free && row.hallId !== session.hallId);
        });
      }).catch(function () {});
    });
    var noteBtn = modal.element.querySelector('#sess-note-btn');
    if (noteBtn) noteBtn.addEventListener('click', function () {
      UI.openFormModal('ملاحظة الجلسة',
        '<div class="field"><label>ملاحظة</label><textarea name="note">' + UI.escapeHtml(session.note || '') + '</textarea></div>',
        function (form, close2, btn2) {
          var note = form.querySelector('[name="note"]').value.trim();
          UI.setBtnLoading(btn2, true);
          window.TadreebDB.update('sessions', sessionId, { note: note }).then(function () {
            UI.setBtnLoading(btn2, false);
            close2();
            UI.toast('تم حفظ الملاحظة', 'success');
            App.refresh();
            reopen();
          }).catch(function (err) { UI.setBtnLoading(btn2, false); UI.toastError(err); });
        }, { submitLabel: 'حفظ', width: 'normal' });
    });
    var courseBtn = modal.element.querySelector('#sess-course-btn');
    if (courseBtn) courseBtn.addEventListener('click', function () {
      modal.close();
      if (course) App.showScreen('course-detail', { courseId: course.id });
    });
    var exportBtn = modal.element.querySelector('#sess-export-btn');
    if (exportBtn) exportBtn.addEventListener('click', function () {
      App.buildAttendanceData(sessionId).then(function (data) {
        UI.callExport('exportAttendance', [data]);
      }).catch(UI.toastError);
    });
    var splitOtherBtn = modal.element.querySelector('#sess-split-other-btn');
    if (splitOtherBtn) splitOtherBtn.addEventListener('click', function () {
      var otherId = session.splitFrom || session.splitInto;
      modal.close();
      setTimeout(function () { open(otherId); }, 50);
    });
  }

  // ---------- تأجيل ذكي (v2.3) ----------
  // وضعان: يدوي (افتراضي — نفس حقول التأجيل السابقة: التاريخ +
  // الفترة + القاعة + الملاحظة، مع شرائح فترات بالتوفر وقائمة
  // توفر القاعات) وتلقائي (يبحث عن أقرب موعد حر مطابق: الفترة
  // نفسها أولاً، قاعة من النوع نفسه، تخطّي العطل الأسبوعية
  // والمسجلة). دالة مستقلة لتصل إليها ورقة الإجراءات وشارة العطلة
  // في التفاصيل. الحفظ عبر postponeSession دائماً (فيتحقق من
  // العطلة والتعارض قبل الكتابة).
  function openPostponeModal(sessionId) {
    var session = App.Store.get('sessions', sessionId);
    if (!session) { UI.toast('الجلسة غير موجودة', 'error'); return; }
    var wantType = sessionWantHallType(session);
    var autoResult = null;

    function ppPeriodOptions(selectedId) {
      return App.Store.getAll('periods').slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); }).map(function (p) {
        return '<option value="' + UI.escapeHtml(p.id) + '"' + (p.id === selectedId ? ' selected' : '') + '>' +
          UI.escapeHtml(App.displayCode(p, 'periods') + ' — ' + p.label) + ' (' + UI.escapeHtml(periodRange12(p)) + ')</option>';
      }).join('');
    }
    function ppHallOptions(selectedId) {
      return '<option value="">بدون قاعة</option>' + App.Store.getAll('halls').map(function (h) {
        return '<option value="' + UI.escapeHtml(h.id) + '"' + (h.id === selectedId ? ' selected' : '') + '>' + UI.escapeHtml(hallOptionLabel(h)) + '</option>';
      }).join('');
    }

    var fields = '<div class="field"><label>طريقة التأجيل</label>' +
      '<label class="check-row"><input type="radio" name="postponeMode" value="manual" checked> يدوي — أختار التاريخ والفترة والقاعة</label>' +
      '<label class="check-row"><input type="radio" name="postponeMode" value="auto"> تلقائي — أقرب موعد متاح' +
      (wantType ? ' (قاعة ' + hallTypeLabel(wantType) + ')' : '') + '</label></div>' +
      '<div id="postpone-manual">' +
      '<div class="form-grid">' +
      '<div class="field"><label>التاريخ الجديد *</label><input type="date" name="date" required value="' + UI.escapeHtml(session.date) + '"></div>' +
      '<div class="field"><label>الفترة *</label><select name="periodId" required>' + ppPeriodOptions(session.periodId) + '</select></div>' +
      '</div>' +
      '<div class="field"><label>الفترات في اليوم المختار</label><div id="postpone-period-chips" class="pp-chips"></div></div>' +
      '<div class="field"><label>القاعة</label><select name="hallId">' + ppHallOptions(session.hallId) + '</select><div class="field-hint" id="sheet-postpone-avail"></div><div id="postpone-hall-list" class="pp-hall-list"></div></div>' +
      '</div>' +
      '<div id="postpone-auto" hidden>' +
      '<div class="muted" style="margin-bottom:10px">يبحث النظام عن أقرب موعد متاح بدءاً من الغد: الفترة نفسها أولاً' +
      (wantType ? '، في قاعة ' + hallTypeLabel(wantType) : '') + '، مع تخطّي العطل الأسبوعية والمسجلة.</div>' +
      '<button class="btn btn-outline" type="button" id="postpone-auto-search">بحث عن أقرب موعد متاح</button>' +
      '<div id="postpone-auto-result" class="pp-auto-result" hidden></div>' +
      '</div>' +
      '<div class="field" style="margin-top:14px"><label>ملاحظة (اختياري)</label><textarea name="note"></textarea></div>';

    var m = UI.openFormModal('تأجيل الجلسة', fields, function (form, close2, btn2) {
      var mode = form.querySelector('[name="postponeMode"]:checked').value;
      var note = form.querySelector('[name="note"]').value.trim();
      var date, periodId, hallId;
      if (mode === 'auto') {
        if (!autoResult) { UI.formError(form, 'ابحث أولاً عن أقرب موعد متاح'); return; }
        date = autoResult.date; periodId = autoResult.periodId; hallId = autoResult.hallId;
      } else {
        date = form.querySelector('[name="date"]').value;
        periodId = form.querySelector('[name="periodId"]').value;
        hallId = form.querySelector('[name="hallId"]').value || null;
        if (!date) { UI.formError(form, 'اختر تاريخ الجلسة'); return; }
        if (!periodId) { UI.formError(form, 'اختر الفترة'); return; }
      }
      UI.formError(form, '');
      UI.setBtnLoading(btn2, true);
      window.TadreebDB.postponeSession(sessionId, date, periodId, hallId, note).then(function () {
        UI.setBtnLoading(btn2, false);
        close2();
        UI.toast('تم تأجيل الجلسة', 'success');
        App.refresh();
      }).catch(function (err) { UI.setBtnLoading(btn2, false); UI.formError(form, err.message); });
    }, { submitLabel: 'تأجيل الجلسة' });
    if (!m.element) return;
    var card = m.element;
    var dateInput = card.querySelector('[name="date"]');
    var periodSel = card.querySelector('[name="periodId"]');
    var hallSel = card.querySelector('[name="hallId"]');
    var chipsEl = card.querySelector('#postpone-period-chips');
    var availEl = card.querySelector('#sheet-postpone-avail');
    var hallListEl = card.querySelector('#postpone-hall-list');

    // شرائح الفترات لليوم المختار: التوفر من المخزن المحلي (قاعات
    // حرة من النوع المطابق). النقر على شريحة يختار فترتها.
    function renderChips() {
      var date = dateInput.value;
      if (!chipsEl) return;
      if (!date) { chipsEl.innerHTML = ''; return; }
      if (isHolidayDate(date)) {
        chipsEl.innerHTML = '<span class="muted">هذا اليوم عطلة مسجلة — لا جلسات.</span>';
        return;
      }
      if (weekendDays().indexOf(weekdayOf(date)) !== -1) {
        chipsEl.innerHTML = '<span class="muted">هذا اليوم عطلة أسبوعية — لا جلسات.</span>';
        return;
      }
      var periods = App.Store.getAll('periods').slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      chipsEl.innerHTML = periods.map(function (p) {
        var busy = slotOccupants(date, p.id, sessionId);
        var freeCount = App.Store.getAll('halls').filter(function (h) {
          return !busy[h.id] && (!wantType || hallTypeOf(h) === wantType);
        }).length;
        var free = freeCount > 0;
        return '<button type="button" class="pp-chip' + (p.id === periodSel.value ? ' active' : '') + (free ? '' : ' busy') +
          '" data-pp-period="' + UI.escapeHtml(p.id) + '">' +
          '<span class="pp-chip-label">' + UI.escapeHtml(p.label) + '</span>' +
          '<span class="pp-chip-status">' + (free ? '✓ متاح (' + freeCount + ')' : '✕ محجوز') + '</span></button>';
      }).join('');
      chipsEl.querySelectorAll('[data-pp-period]').forEach(function (chip) {
        chip.addEventListener('click', function () {
          periodSel.value = chip.getAttribute('data-pp-period');
          renderChips();
          checkAvail();
        });
      });
    }

    // فحص توفر القاعات عند تغيير التاريخ أو الفترة؛ قاعة الجلسة
    // نفسها لا تُعطَّل في موعدها الحالي. نص التلميح كما كان تماماً.
    function checkAvail() {
      var date = dateInput.value;
      var periodId = periodSel.value;
      if (!date || !periodId) { if (availEl) availEl.textContent = ''; if (hallListEl) hallListEl.innerHTML = ''; return; }
      if (availEl) availEl.textContent = 'جارٍ فحص توفر القاعات…';
      window.TadreebDB.checkHallAvailability(date, periodId).then(function (rows) {
        var isSelfSlot = (date === session.date && periodId === session.periodId);
        var isSelfHall = function (r) { return isSelfSlot && r.hallId === session.hallId; };
        var free = rows.filter(function (r) { return r.free || isSelfHall(r); }).map(function (r) { return r.hallName; });
        var busy = rows.filter(function (r) { return !r.free && !isSelfHall(r); }).map(function (r) { return r.hallName + ' (' + r.sessionCourse + ')'; });
        if (availEl) availEl.textContent = 'متاحة: ' + (free.length ? free.join('، ') : 'لا قاعة حرة') +
          (busy.length ? ' — مشغولة: ' + busy.join('، ') : '');
        if (hallListEl) hallListEl.innerHTML = hallAvailabilityListHtmlV23(rows, isSelfHall);
        if (hallSel) hallSel.querySelectorAll('option[value]').forEach(function (opt) {
          if (!opt.value) return;
          var row = rows.find(function (r) { return r.hallId === opt.value; });
          opt.disabled = !!(row && !row.free && !isSelfHall(row));
        });
      }).catch(function () { if (availEl) availEl.textContent = ''; });
    }

    var manualEl = card.querySelector('#postpone-manual');
    var autoEl = card.querySelector('#postpone-auto');
    card.querySelectorAll('[name="postponeMode"]').forEach(function (r) {
      r.addEventListener('change', function () {
        var auto = card.querySelector('[name="postponeMode"]:checked').value === 'auto';
        if (manualEl) manualEl.hidden = auto;
        if (autoEl) autoEl.hidden = !auto;
      });
    });

    var autoResultEl = card.querySelector('#postpone-auto-result');
    var searchBtn = card.querySelector('#postpone-auto-search');
    if (searchBtn) searchBtn.addEventListener('click', function () {
      var slot = findNextFreeSlot(session);
      autoResult = slot;
      if (!autoResultEl) return;
      autoResultEl.hidden = false;
      if (!slot) {
        autoResultEl.innerHTML = '<div class="pp-auto-none">لا يوجد موعد متاح خلال الأسابيع الثمانية القادمة — جرّب الاختيار اليدوي.</div>';
        return;
      }
      var p = App.Store.get('periods', slot.periodId);
      var h = App.Store.get('halls', slot.hallId);
      autoResultEl.innerHTML = '<div class="pp-auto-found"><strong>أقرب موعد متاح:</strong> ' +
        UI.escapeHtml(UI.fmtDateFull(slot.date)) + ' · ' + UI.escapeHtml(p ? p.label : '') +
        (p ? ' (' + UI.escapeHtml(periodRange12(p)) + ')' : '') +
        ' · ' + UI.escapeHtml(h ? h.name : 'بلا قاعة') +
        '<div class="muted" style="margin-top:6px">اضغط «تأجيل الجلسة» للتأكيد.</div></div>';
    });

    dateInput.addEventListener('change', function () { renderChips(); checkAvail(); });
    periodSel.addEventListener('change', function () { renderChips(); checkAvail(); });
    renderChips();
    checkAvail();
  }

  // ---------- ورقة إجراءات الجلسة (قائمة مشتركة من الرزنامة ولوحة المعلومات وتفاصيل الدورة) ----------
  // opts: { onCheck: function(sessionId) } — اختياري؛ عند غيابه يفتح «تفقد» نافذة التفاصيل.
  function openActionSheet(sessionId, opts) {
    opts = opts || {};
    var session = App.Store.get('sessions', sessionId);
    if (!session) { UI.toast('الجلسة غير موجودة', 'error'); return; }
    var course = App.Store.get('courses', session.courseId);
    var period = App.Store.get('periods', session.periodId);
    var canWrite = App.canWrite();

    var actions = [{ key: 'check', label: 'تفقد' }];
    if (canWrite) {
      actions.push({ key: 'cancel', label: 'إلغاء' });
      actions.push({ key: 'merge', label: 'دمج' });
      actions.push({ key: 'postpone', label: 'تأجيل' });
      actions.push({ key: 'split', label: 'تقسيم' });
      actions.push({ key: 'holiday', label: 'عطلة' });
      actions.push({ key: 'trainer-absent', label: 'غياب مدرب' });
      actions.push({ key: 'notes', label: 'ملاحظات' });
      actions.push({ key: 'state', label: 'تغيير الحالة' });
      actions.push({ key: 'stop', label: 'إيقاف مع سبب' });
      actions.push({ key: 'hall', label: 'تغيير القاعة' });
      actions.push({ key: 'note', label: 'ملاحظة الجلسة' });
      actions.push({ key: 'edit', label: 'تعديل الجلسة' });
      actions.push({ key: 'delete', label: 'حذف الجلسة', danger: true });
    }
    actions.push({ key: 'course', label: 'فتح مجموعة التدريب' });
    actions.push({ key: 'export', label: 'تصدير الحضور ↓' });

    var splitOtherId = session.splitFrom || session.splitInto || null;
    var splitOtherExists = splitOtherId ? !!App.Store.get('sessions', splitOtherId) : false;

    var summary = '<div class="sheet-summary">' +
      '<div class="sheet-summary-title">' + UI.escapeHtml(course ? App.courseName(course) : '') + '</div>' +
      '<div><span class="k">الجلسة</span> ' + UI.escapeHtml(App.sessionLabel(session, course)) + '</div>' +
      '<div><span class="k">التاريخ</span> ' + UI.escapeHtml(UI.fmtDateFull(session.date)) + '</div>' +
      '<div><span class="k">الفترة</span> ' + UI.escapeHtml(period ? period.label : '') + ' ' + (period ? UI.fmtTimeRange(period.start, period.end) : '') + '</div>' +
      '<div><span class="k">القاعة</span> ' + UI.escapeHtml(App.hallName(session.hallId) || 'بلا قاعة') + '</div>' +
      '<div><span class="k">المدرب</span> ' + UI.escapeHtml(course ? App.trainerName(course.trainerId) || 'بلا مدرب' : '') + '</div>' +
      '<div><span class="k">الحالة</span> ' + UI.pillForSessionState(session.state) + '</div>' +
      ((session.splitFrom || session.splitInto) ?
        '<div><span class="k">تقسيم</span> جزء من جلسة مقسومة' +
        (splitOtherExists ? ' <button class="link-btn" type="button" data-split-other>فتح الجزء الآخر</button>' : '') + '</div>' : '') +
      '</div>';

    var listHtml = actions.map(function (a) {
      return '<button class="sheet-action' + (a.danger ? ' danger' : '') + '" type="button" data-sheet-action="' + a.key + '">' + UI.escapeHtml(a.label) + '</button>';
    }).join('');

    var modal = UI.openModal({
      title: 'خيارات الجلسة',
      width: 'normal',
      bodyHTML: summary + '<div class="sheet-actions">' + listHtml + '</div>',
      actions: [{ label: 'إغلاق', className: 'btn-outline', closeOnClick: true }]
    });
    if (modal.element) modal.element.classList.add('sheet');
    if (!modal.element) return;
    modal.element.querySelectorAll('[data-sheet-action]').forEach(function (btn) {
      btn.addEventListener('click', function () { handleAction(btn.getAttribute('data-sheet-action')); });
    });
    var splitOtherBtn = modal.element.querySelector('[data-split-other]');
    if (splitOtherBtn) splitOtherBtn.addEventListener('click', function () {
      modal.close();
      openActionSheet(splitOtherId);
    });

    // كل إجراء يغلق الورقة أولاً (عدا التصدير — لا يغيّر شيئاً).
    function handleAction(key) {
      if (key === 'export') { doExport(); return; }
      modal.close();
      if (key === 'check') {
        if (typeof opts.onCheck === 'function') opts.onCheck(sessionId);
        else open(sessionId);
      } else if (key === 'course') {
        if (course) App.showScreen('course-detail', { courseId: course.id });
      } else if (key === 'cancel') { doCancel(); }
      else if (key === 'merge') { doMerge(); }
      else if (key === 'postpone') { doPostpone(); }
      else if (key === 'split') { doSplit(); }
      else if (key === 'holiday') { doHoliday(); }
      else if (key === 'trainer-absent') { doTrainerAbsent(); }
      else if (key === 'notes') { doNotes(); }
      else if (key === 'state') { doState(); }
      else if (key === 'stop') { doStop(); }
      else if (key === 'hall') { doHall(); }
      else if (key === 'note') { doNote(); }
      else if (key === 'edit') { doEdit(); }
      else if (key === 'delete') { doDelete(); }
    }

    function doExport() {
      App.buildAttendanceData(sessionId).then(function (data) {
        UI.callExport('exportAttendance', [data]);
      }).catch(UI.toastError);
    }

    function doCancel() {
      UI.openFormModal('إلغاء الجلسة',
        '<div class="field"><label>ملاحظة (اختياري)</label><textarea name="note"></textarea></div>',
        function (form, close2, btn2) {
          var note = form.querySelector('[name="note"]').value.trim();
          UI.setBtnLoading(btn2, true);
          window.TadreebDB.setSessionState(sessionId, 'cancelled', note).then(function () {
            UI.setBtnLoading(btn2, false);
            close2();
            UI.toast('تم إلغاء الجلسة', 'success');
            App.refresh();
          }).catch(function (err) { UI.setBtnLoading(btn2, false); UI.toastError(err); });
        }, { submitLabel: 'تأكيد الإلغاء', width: 'normal' });
    }

    // دمج جلستين (v2.3 — تحقق 18 تشرين الثاني 2026): mergeSessions
    // يدمج الحضور (حاضر > معتذر > غائب) ثم يحذف الجلسة المُزالة،
    // فيبقى جلسة واحدة — نص النافذة أدناه يطابق السلوك فعلاً.
    function doMerge() {
      var others = App.Store.getAll('sessions').filter(function (s) {
        return s.courseId === session.courseId && s.id !== sessionId;
      }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
      if (!others.length) { UI.toast('لا توجد جلسات أخرى في مجموعة التدريب هذه للدمج'); return; }
      var rowsHtml = others.map(function (s) {
        var p = App.Store.get('periods', s.periodId);
        return '<button class="sheet-action" type="button" data-merge-pick="' + UI.escapeHtml(s.id) + '">' +
          UI.escapeHtml(UI.fmtDateFull(s.date)) + ' · ' + UI.escapeHtml(p ? p.label : '') + ' · ' +
          UI.escapeHtml(App.hallName(s.hallId) || 'بلا قاعة') + ' · ' + UI.pillForSessionState(s.state) + '</button>';
      }).join('');
      var picker = UI.openModal({
        title: 'اختر الجلسة المراد دمجها',
        width: 'normal',
        bodyHTML: '<div class="muted" style="margin-bottom:12px">سيُدمج حضور الجلسة المختارة في جلسة ' +
          UI.escapeHtml(UI.fmtDateFull(session.date)) + '، ثم تُحذف الجلسة المدمجة.</div>' +
          '<div class="sheet-actions">' + rowsHtml + '</div>',
        actions: [{ label: 'إلغاء', className: 'btn-outline', closeOnClick: true }]
      });
      if (!picker.element) return;
      picker.element.querySelectorAll('[data-merge-pick]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var picked = App.Store.get('sessions', btn.getAttribute('data-merge-pick'));
          if (!picked) return;
          picker.close();
          UI.confirmDialog('دمج الجلستين',
            'سيُدمج حضور جلسة ' + UI.fmtDate(picked.date) + ' في جلسة ' + UI.fmtDate(session.date) + '، ثم تُحذف الجلسة المدمجة. هل أنت متأكد؟',
            function () {
              window.TadreebDB.mergeSessions(sessionId, picked.id).then(function () {
                UI.toast('تم دمج الجلستين', 'success');
                App.refresh();
              }).catch(UI.toastError);
            });
        });
      });
    }

    function periodOptionsHtml(selectedId) {
      return App.Store.getAll('periods').slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); }).map(function (p) {
        return '<option value="' + UI.escapeHtml(p.id) + '"' + (p.id === selectedId ? ' selected' : '') + '>' +
          UI.escapeHtml(App.displayCode(p, 'periods') + ' — ' + p.label) + ' (' + UI.escapeHtml(periodRange12(p)) + ')</option>';
      }).join('');
    }

    function hallOptionsHtml(selectedId) {
      return '<option value="">بدون قاعة</option>' + App.Store.getAll('halls').map(function (h) {
        return '<option value="' + UI.escapeHtml(h.id) + '"' + (h.id === selectedId ? ' selected' : '') + '>' + UI.escapeHtml(hallOptionLabel(h)) + '</option>';
      }).join('');
    }

    // فحص توفر القاعات عند تغيير التاريخ أو الفترة؛ قاعة الجلسة نفسها لا تُعطَّل في موعدها الحالي.
    function bindHallAvailability(card, hintId) {
      var availEl = card.querySelector('#' + hintId);
      var hallSel = card.querySelector('[name="hallId"]');
      function checkAvail() {
        var date = card.querySelector('[name="date"]').value;
        var periodId = card.querySelector('[name="periodId"]').value;
        if (!date || !periodId) { if (availEl) availEl.textContent = ''; return; }
        if (availEl) availEl.textContent = 'جارٍ فحص توفر القاعات…';
        window.TadreebDB.checkHallAvailability(date, periodId).then(function (rows) {
          var isSelfSlot = (date === session.date && periodId === session.periodId);
          var isSelfHall = function (r) { return isSelfSlot && r.hallId === session.hallId; };
          var free = rows.filter(function (r) { return r.free || isSelfHall(r); }).map(function (r) { return r.hallName; });
          var busy = rows.filter(function (r) { return !r.free && !isSelfHall(r); }).map(function (r) { return r.hallName + ' (' + r.sessionCourse + ')'; });
          if (availEl) availEl.textContent = 'متاحة: ' + (free.length ? free.join('، ') : 'لا قاعة حرة') +
            (busy.length ? ' — مشغولة: ' + busy.join('، ') : '');
          if (hallSel) hallSel.querySelectorAll('option[value]').forEach(function (opt) {
            if (!opt.value) return;
            var row = rows.find(function (r) { return r.hallId === opt.value; });
            opt.disabled = !!(row && !row.free && !isSelfHall(row));
          });
        }).catch(function () { if (availEl) availEl.textContent = ''; });
      }
      card.querySelector('[name="date"]').addEventListener('change', checkAvail);
      card.querySelector('[name="periodId"]').addEventListener('change', checkAvail);
      checkAvail();
    }

    function doPostpone() {
      openPostponeModal(sessionId);
    }

    // تقسيم الجلسة: الجزء الثاني في فترة أخرى من اليوم نفسه أو في يوم آخر.
    // خانة نقل الحضور تظهر فقط عند وجود سجلات حضور على الجلسة الأصلية.
    function doSplit() {
      if (session.state !== 'scheduled') {
        UI.toast('لا يمكن تقسيم جلسة مكتملة أو ملغاة', 'error');
        return;
      }
      window.TadreebDB.getSessionAttendance(sessionId).then(function (attMap) {
        openSplitModal(Object.keys(attMap || {}).length > 0);
      }).catch(function () { openSplitModal(false); });
    }

    function openSplitModal(hasAttendance) {
      var tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      var tomorrowStr = UI.dateToStr(tomorrow);

      function splitPeriodOptions(excludeOriginal) {
        return App.Store.getAll('periods').slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); })
          .filter(function (p) { return !excludeOriginal || p.id !== session.periodId; })
          .map(function (p) {
            return '<option value="' + UI.escapeHtml(p.id) + '">' +
              UI.escapeHtml(App.displayCode(p, 'periods') + ' — ' + p.label) + ' (' + UI.escapeHtml(periodRange12(p)) + ')</option>';
          }).join('');
      }

      var fields = '<div class="field"><label>نمط التقسيم</label>' +
        '<label class="check-row"><input type="radio" name="splitMode" value="same-day" checked> نفس اليوم — فترة ثانية</label>' +
        '<label class="check-row"><input type="radio" name="splitMode" value="different-days"> يوم آخر</label></div>' +
        '<div class="form-grid">' +
        '<div class="field" id="split-date-wrap" hidden><label>تاريخ الجزء الثاني *</label><input type="date" name="date" value="' + UI.escapeHtml(tomorrowStr) + '"></div>' +
        '<div class="field"><label>الفترة *</label><select name="periodId" required>' + splitPeriodOptions(true) + '</select></div>' +
        '<div class="field field-full"><label>القاعة</label><select name="hallId"><option value="">تلقائياً — أول قاعة حرة</option>' +
        App.Store.getAll('halls').map(function (h) {
          return '<option value="' + UI.escapeHtml(h.id) + '">' + UI.escapeHtml(App.displayCode(h, 'halls') + ' — ' + h.name) + '</option>';
        }).join('') + '</select><div class="field-hint" id="sheet-split-avail"></div></div>' +
        (hasAttendance ? '<label class="check-row field-full"><input type="checkbox" name="moveAttendance"> نقل الحضور المسجل إلى الجزء الجديد</label>' : '') +
        '<div class="field field-full"><label>ملاحظة (اختياري)</label><textarea name="note"></textarea></div>' +
        '</div>';

      var m = UI.openFormModal('تقسيم الجلسة', fields, function (form, close2, btn2) {
        var mode = form.querySelector('[name="splitMode"]:checked').value;
        var date = mode === 'same-day' ? session.date : form.querySelector('[name="date"]').value;
        var periodId = form.querySelector('[name="periodId"]').value;
        var hallId = form.querySelector('[name="hallId"]').value || undefined;
        var moveBox = form.querySelector('[name="moveAttendance"]');
        var moveAtt = moveBox ? moveBox.checked : false;
        var note = form.querySelector('[name="note"]').value.trim();
        if (mode === 'different-days' && !date) { UI.formError(form, 'اختر تاريخ الجزء الثاني'); return; }
        if (!periodId) { UI.formError(form, 'اختر الفترة'); return; }
        UI.formError(form, '');
        UI.setBtnLoading(btn2, true);
        window.TadreebDB.splitSession(sessionId, {
          mode: mode, date: date, periodId: periodId, hallId: hallId, moveAttendance: moveAtt, note: note
        }).then(function () {
          UI.setBtnLoading(btn2, false);
          close2();
          UI.toast('تم تقسيم الجلسة', 'success');
          App.refresh();
        }).catch(function (err) { UI.setBtnLoading(btn2, false); UI.formError(form, err.message); });
      }, { submitLabel: 'تقسيم الجلسة' });

      if (!m.element) return;
      var card = m.element;
      var dateWrap = card.querySelector('#split-date-wrap');
      var dateInput = card.querySelector('[name="date"]');
      var periodSel = card.querySelector('[name="periodId"]');
      var hallSel = card.querySelector('[name="hallId"]');
      var availEl = card.querySelector('#sheet-split-avail');

      // فحص توفر القاعات للموعد الجديد — بنفس نمط نموذج التأجيل،
      // لكن بلا استثناء لقاعة الجلسة نفسها (الموعد الجديد مختلف دائماً).
      function checkSplitAvail() {
        var mode = card.querySelector('[name="splitMode"]:checked').value;
        var date = mode === 'same-day' ? session.date : dateInput.value;
        var periodId = periodSel.value;
        if (!date || !periodId) { if (availEl) availEl.textContent = ''; return; }
        if (availEl) availEl.textContent = 'جارٍ فحص توفر القاعات…';
        window.TadreebDB.checkHallAvailability(date, periodId).then(function (rows) {
          var free = rows.filter(function (r) { return r.free; }).map(function (r) { return r.hallName; });
          var busy = rows.filter(function (r) { return !r.free; }).map(function (r) { return r.hallName + ' (' + r.sessionCourse + ')'; });
          if (availEl) availEl.textContent = 'متاحة: ' + (free.length ? free.join('، ') : 'لا قاعة حرة') +
            (busy.length ? ' — مشغولة: ' + busy.join('، ') : '');
          if (hallSel) hallSel.querySelectorAll('option[value]').forEach(function (opt) {
            if (!opt.value) return;
            var row = rows.find(function (r) { return r.hallId === opt.value; });
            opt.disabled = !!(row && !row.free);
          });
        }).catch(function () { if (availEl) availEl.textContent = ''; });
      }

      function onModeChange() {
        var mode = card.querySelector('[name="splitMode"]:checked').value;
        if (dateWrap) dateWrap.hidden = mode !== 'different-days';
        if (mode === 'different-days' && !dateInput.value) dateInput.value = tomorrowStr;
        // نفس اليوم: كل الفترات عدا فترة الأصل؛ يوم آخر: كل الفترات.
        var current = periodSel.value;
        periodSel.innerHTML = splitPeriodOptions(mode === 'same-day');
        if (current && periodSel.querySelector('option[value="' + current + '"]')) periodSel.value = current;
        checkSplitAvail();
      }

      card.querySelectorAll('[name="splitMode"]').forEach(function (r) {
        r.addEventListener('change', onModeChange);
      });
      dateInput.addEventListener('change', checkSplitAvail);
      periodSel.addEventListener('change', checkSplitAvail);
      checkSplitAvail();
    }

    function doHoliday() {
      UI.openFormModal('تسجيل الجلسة عطلة',
        '<div class="field"><label>ملاحظة (اختياري)</label><textarea name="note"></textarea></div>' +
        '<label class="check-row"><input type="checkbox" name="addHoliday" checked> أضف هذا اليوم إلى قائمة العطل</label>',
        function (form, close2, btn2) {
          var note = form.querySelector('[name="note"]').value.trim();
          var addToHolidays = form.querySelector('[name="addHoliday"]').checked;
          UI.setBtnLoading(btn2, true);
          window.TadreebDB.markSessionHoliday(sessionId, note, addToHolidays).then(function () {
            UI.setBtnLoading(btn2, false);
            close2();
            UI.toast('تم تسجيل الجلسة عطلة', 'success');
            App.refresh();
          }).catch(function (err) { UI.setBtnLoading(btn2, false); UI.toastError(err); });
        }, { submitLabel: 'حفظ', width: 'normal' });
    }

    function doTrainerAbsent() {
      UI.confirmDialog('غياب مدرب', 'هل أنت متأكد من تسجيل غياب المدرب عن هذه الجلسة؟',
        function () {
          window.TadreebDB.recordTrainerAttendance(sessionId, false).then(function () {
            UI.toast('تم تسجيل غياب المدرب', 'success');
            App.refresh();
          }).catch(UI.toastError);
        });
    }

    function doNotes() {
      var destroy = null;
      var m = UI.openModal({
        title: 'ملاحظات الجلسة — ' + UI.fmtDateFull(session.date),
        bodyHTML: '<div id="sheet-notes-box"></div>',
        actions: [{ label: 'إغلاق', className: 'btn-outline', closeOnClick: true }],
        onClose: function () { if (typeof destroy === 'function') destroy(); }
      });
      if (m.element) destroy = UI.notesWidget('session', sessionId, m.element.querySelector('#sheet-notes-box'), { canWrite: canWrite });
    }

    function doState() {
      UI.openFormModal('تغيير حالة الجلسة',
        '<div class="field"><label>حالة الجلسة</label><select name="state">' +
        Object.keys(UI.SESSION_STATE_LABELS).map(function (k) {
          return '<option value="' + k + '"' + (session.state === k ? ' selected' : '') + '>' + UI.SESSION_STATE_LABELS[k] + '</option>';
        }).join('') + '</select></div>' +
        '<div class="field"><label>ملاحظة</label><textarea name="note">' + UI.escapeHtml(session.note || '') + '</textarea></div>',
        function (form, close2, btn2) {
          var state = form.querySelector('[name="state"]').value;
          var note = form.querySelector('[name="note"]').value.trim();
          UI.setBtnLoading(btn2, true);
          window.TadreebDB.setSessionState(sessionId, state, note).then(function () {
            UI.setBtnLoading(btn2, false);
            close2();
            UI.toast('تم تحديث حالة الجلسة', 'success');
            App.refresh();
          }).catch(function (err) { UI.setBtnLoading(btn2, false); UI.toastError(err); });
        }, { submitLabel: 'حفظ', width: 'normal' });
    }

    function doStop() {
      UI.openFormModal('إيقاف الجلسة مع سبب',
        '<div class="field"><label>سبب الإيقاف *</label><textarea name="reason"></textarea></div>',
        function (form, close2, btn2) {
          var reason = form.querySelector('[name="reason"]').value.trim();
          if (!reason) { UI.formError(form, 'اكتب سبب الإيقاف'); return; }
          UI.formError(form, '');
          UI.setBtnLoading(btn2, true);
          window.TadreebDB.setSessionState(sessionId, 'cancelled', 'إيقاف: ' + reason).then(function () {
            UI.setBtnLoading(btn2, false);
            close2();
            UI.toast('تم إيقاف الجلسة', 'success');
            App.refresh();
          }).catch(function (err) { UI.setBtnLoading(btn2, false); UI.toastError(err); });
        }, { submitLabel: 'إيقاف الجلسة', width: 'normal' });
    }

    function doHall() {
      var hallGuard = null;
      var hm = UI.openFormModal('تغيير قاعة الجلسة',
        '<div class="field"><label>القاعة</label><select name="hallId">' + hallOptionsHtml(session.hallId) + '</select><div class="field-hint" id="sheet-hall-avail">جارٍ فحص توفر القاعات…</div></div>' + crossTypeWarnHtml(),
        function (form, close2, btn2) {
          var hallId = form.querySelector('[name="hallId"]').value || null;
          if (hallGuard && !hallGuard()) return;
          UI.setBtnLoading(btn2, true);
          // عبر updateSession (لا update العام) ليفحص التعارض قبل الحفظ.
          window.TadreebDB.updateSession(sessionId, { hallId: hallId }).then(function () {
            UI.setBtnLoading(btn2, false);
            close2();
            UI.toast('تم تغيير قاعة الجلسة', 'success');
            App.refresh();
          }).catch(function (err) { UI.setBtnLoading(btn2, false); UI.toastError(err); });
        }, { submitLabel: 'حفظ', width: 'normal' });
      if (hm.element) hallGuard = bindCrossTypeGuard(hm.element, session.hallId);
      window.TadreebDB.checkHallAvailability(session.date, session.periodId).then(function (rows) {
        if (!hm.element || !hm.element.isConnected) return;
        var el = hm.element.querySelector('#sheet-hall-avail');
        var busy = rows.filter(function (r) { return !r.free && r.hallId !== session.hallId; });
        if (el) el.textContent = busy.length ?
          'مشغولة في هذا الموعد: ' + busy.map(function (r) { return r.hallName + ' (' + r.sessionCourse + ')'; }).join('، ') :
          'كل القاعات متاحة في هذا الموعد.';
        // تعطيل القاعات المشغولة (قاعة الجلسة نفسها تبقى متاحة).
        var sel = hm.element.querySelector('[name="hallId"]');
        if (sel) sel.querySelectorAll('option[value]').forEach(function (opt) {
          if (!opt.value) return;
          var row = rows.find(function (r) { return r.hallId === opt.value; });
          opt.disabled = !!(row && !row.free && row.hallId !== session.hallId);
        });
      }).catch(function () {});
    }

    function doNote() {
      UI.openFormModal('ملاحظة الجلسة',
        '<div class="field"><label>ملاحظة</label><textarea name="note">' + UI.escapeHtml(session.note || '') + '</textarea></div>',
        function (form, close2, btn2) {
          var note = form.querySelector('[name="note"]').value.trim();
          UI.setBtnLoading(btn2, true);
          window.TadreebDB.update('sessions', sessionId, { note: note }).then(function () {
            UI.setBtnLoading(btn2, false);
            close2();
            UI.toast('تم حفظ الملاحظة', 'success');
            App.refresh();
          }).catch(function (err) { UI.setBtnLoading(btn2, false); UI.toastError(err); });
        }, { submitLabel: 'حفظ', width: 'normal' });
    }

    function doEdit() {
      var fields = '<div class="form-grid">' +
        '<div class="field"><label>التاريخ *</label><input type="date" name="date" required value="' + UI.escapeHtml(session.date) + '"></div>' +
        '<div class="field"><label>الفترة *</label><select name="periodId" required>' + periodOptionsHtml(session.periodId) + '</select></div>' +
        '<div class="field field-full"><label>القاعة</label><select name="hallId">' + hallOptionsHtml(session.hallId) + '</select><div class="field-hint" id="sheet-edit-avail"></div></div>' +
        '<div class="field field-full"><label>ملاحظة</label><textarea name="note">' + UI.escapeHtml(session.note || '') + '</textarea></div>' +
        '</div>';
      var m = UI.openFormModal('تعديل الجلسة', fields, function (form, close2, btn2) {
        var date = form.querySelector('[name="date"]').value;
        var periodId = form.querySelector('[name="periodId"]').value;
        var hallId = form.querySelector('[name="hallId"]').value || null;
        var note = form.querySelector('[name="note"]').value.trim();
        if (!date) { UI.formError(form, 'اختر تاريخ الجلسة'); return; }
        if (!periodId) { UI.formError(form, 'اختر الفترة'); return; }
        UI.formError(form, '');
        UI.setBtnLoading(btn2, true);
        window.TadreebDB.updateSession(sessionId, { date: date, periodId: periodId, hallId: hallId, note: note }).then(function () {
          UI.setBtnLoading(btn2, false);
          close2();
          UI.toast('تم تعديل الجلسة', 'success');
          App.refresh();
        }).catch(function (err) { UI.setBtnLoading(btn2, false); UI.formError(form, err.message); });
      }, { submitLabel: 'حفظ' });
      if (m.element) bindHallAvailability(m.element, 'sheet-edit-avail');
    }

    function doDelete() {
      UI.confirmDialog('حذف الجلسة', 'هل أنت متأكد من حذف جلسة ' + UI.fmtDateFull(session.date) + '؟ سيُحذف حضورها المسجل أيضاً.',
        function () {
          window.TadreebDB.remove('sessions', sessionId).then(function () {
            UI.toast('تم حذف الجلسة', 'success');
            App.refresh();
          }).catch(UI.toastError);
        });
    }
  }

  window.SessionScreen = { open: open, openActionSheet: openActionSheet, renderAttendanceBlock: renderAttendanceBlock, openPostponeModal: openPostponeModal, isAttendanceLocked: isAttendanceLocked };
})();
