// تدريب — تفاصيل الجلسة والحضور (نافذة كبيرة + مكوّن حضور مشترك).
// يكشف window.SessionScreen = { open(sessionId), renderAttendanceBlock(el, sessionId, opts) }.
(function () {
  'use strict';

  // ---------- مكوّن الحضور (يُستخدم داخل تفاصيل الدورة ونافذة الجلسة) ----------
  // opts: { embedded: true } — داخل بطاقة موجودة مسبقاً.
  function renderAttendanceBlock(container, sessionId, opts) {
    opts = opts || {};
    var session = App.Store.get('sessions', sessionId);
    if (!session) {
      container.innerHTML = UI.emptyState('الجلسة غير موجودة', 'ربما حُذفت هذه الجلسة.');
      return;
    }
    var course = App.Store.get('courses', session.courseId);
    var canWrite = App.canWrite();
    container.innerHTML = UI.loadingState('جارٍ تحميل الحضور…');

    window.TadreebDB.getSessionAttendance(sessionId).then(function (attMap) {
      var trainees = course ? App.courseTrainees(course) : [];
      var period = App.Store.get('periods', session.periodId);
      var trainer = course ? App.Store.get('trainers', course.trainerId) : null;

      var html = '<div class="muted" style="margin-bottom:14px">' +
        UI.escapeHtml(UI.fmtDateFull(session.date)) + ' · ' +
        UI.escapeHtml(period ? period.label : '') + ' · ' +
        UI.escapeHtml(App.hallName(session.hallId) || 'بلا قاعة') + ' · ' +
        UI.pillForSessionState(session.state) + '</div>';

      // حضور المدرب
      if (trainer) {
        html += '<div class="att-row"><div><strong>المدرب: ' + UI.escapeHtml(trainer.name) + '</strong></div>' +
          '<div class="att-choices">';
        if (canWrite) {
          html += '<button class="att-choice' + (session.trainerPresent === true ? ' sel-present' : '') + '" type="button" data-trainer-att="present">موجود</button>' +
            '<button class="att-choice' + (session.trainerPresent === false ? ' sel-absent' : '') + '" type="button" data-trainer-att="absent">غائب</button>';
        } else {
          html += session.trainerPresent == null ? '<span class="muted">بلا تسجيل</span>' :
            UI.pillForAttendance(session.trainerPresent ? 'present' : 'absent');
        }
        html += '</div></div>';
      }

      if (!trainees.length) {
        html += '<div class="muted" style="margin-top:12px">لا متدربين في هذه الدورة.</div>';
      } else {
        html += '<div style="margin-top:6px">';
        trainees.forEach(function (t) {
          var rec = attMap[t.id] || {};
          var status = rec.status || null;
          html += '<div class="att-row" data-att-row="' + UI.escapeHtml(t.id) + '">' +
            '<div><strong>' + UI.escapeHtml(t.name) + '</strong>' +
            '<div class="muted">' + UI.escapeHtml(App.directorateName(t.directorateId) || 'بلا مديرية') + '</div></div>';
          if (canWrite) {
            html += '<div class="att-choices">' +
              '<button class="att-choice' + (status === 'present' ? ' sel-present' : '') + '" type="button" data-att="present">موجود</button>' +
              '<button class="att-choice' + (status === 'absent' ? ' sel-absent' : '') + '" type="button" data-att="absent">غائب</button>' +
              '<button class="att-choice' + (status === 'excused' ? ' sel-excused' : '') + '" type="button" data-att="excused">معتذر</button>' +
              '</div>' +
              '<div class="att-note-wrap"' + (status === 'excused' ? '' : ' hidden') + '>' +
              '<input type="text" class="att-note" data-att-note placeholder="مبرر الاعتذار (مطلوب عند الاعتذار)" value="' + UI.escapeHtml(rec.note || '') + '"></div>';
          } else {
            html += '<div>' + UI.pillForAttendance(status) +
              (rec.note ? '<div class="muted" style="font-size:13px">المبرر: ' + UI.escapeHtml(rec.note) + '</div>' : '') + '</div>';
          }
          html += '</div>';
        });
        html += '</div>';
        if (canWrite) {
          html += '<div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap">' +
            '<button class="btn" type="button" id="att-save-btn">حفظ الحضور</button>' +
            '<button class="btn btn-outline" type="button" id="att-all-present-btn">تحديد الكل موجوداً</button></div>' +
            '<div class="muted" style="margin-top:8px">يمكن تسجيل الحضور وتصحيحه لأي جلسة — سابقة أو قادمة — وتُسجَّل كل التغييرات في سجل التدقيق.</div>';
        }
      }

      container.innerHTML = html;

      if (!canWrite) return;

      // حالة الحضور المحلية (تُحفظ دفعة واحدة)
      var local = {};
      trainees.forEach(function (t) {
        var rec = attMap[t.id] || {};
        local[t.id] = { status: rec.status || null, note: rec.note || '' };
      });

      container.querySelectorAll('[data-att-row]').forEach(function (row) {
        var traineeId = row.getAttribute('data-att-row');
        var noteWrap = row.querySelector('.att-note-wrap');
        var noteInput = row.querySelector('[data-att-note]');
        row.querySelectorAll('[data-att]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var status = btn.getAttribute('data-att');
            local[traineeId].status = status;
            row.querySelectorAll('[data-att]').forEach(function (b) {
              b.classList.remove('sel-present', 'sel-absent', 'sel-excused');
            });
            btn.classList.add(status === 'present' ? 'sel-present' : status === 'absent' ? 'sel-absent' : 'sel-excused');
            if (noteWrap) noteWrap.hidden = status !== 'excused';
          });
        });
        if (noteInput) {
          noteInput.addEventListener('input', function () { local[traineeId].note = noteInput.value.trim(); });
        }
      });

      var allPresentBtn = container.querySelector('#att-all-present-btn');
      if (allPresentBtn) {
        allPresentBtn.addEventListener('click', function () {
          trainees.forEach(function (t) { local[t.id].status = 'present'; });
          container.querySelectorAll('[data-att-row]').forEach(function (row) {
            row.querySelectorAll('[data-att]').forEach(function (b) {
              b.classList.toggle('sel-present', b.getAttribute('data-att') === 'present');
              b.classList.remove('sel-absent', 'sel-excused');
            });
            var wrap = row.querySelector('.att-note-wrap');
            if (wrap) wrap.hidden = true;
          });
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
          // التحقق: المعتذر يحتاج مبرراً.
          var missing = [];
          trainees.forEach(function (t) {
            if (local[t.id].status === 'excused' && !local[t.id].note) missing.push(t.name);
          });
          if (missing.length) {
            UI.toast('اكتب مبرر الاعتذار لكل معتذر: ' + missing.join('، '), 'error');
            return;
          }
          UI.setBtnLoading(saveBtn, true, 'جارٍ الحفظ…');
          var chain = Promise.resolve();
          var changed = 0;
          trainees.forEach(function (t) {
            var rec = local[t.id];
            var old = attMap[t.id] || {};
            if (!rec.status) return; // بلا اختيار — لا يُحفظ
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
        '<div class="meta-grid" style="grid-template-columns:repeat(3,1fr)">' +
        '<div class="meta-box"><div class="k">الدورة</div><div class="v">' + UI.escapeHtml(course ? course.name : '') + '</div></div>' +
        '<div class="meta-box"><div class="k">التاريخ</div><div class="v">' + UI.escapeHtml(UI.fmtDateFull(session.date)) + '</div></div>' +
        '<div class="meta-box"><div class="k">الفترة</div><div class="v">' + UI.escapeHtml(period ? period.label : '') + ' ' + (period ? UI.fmtTimeRange(period.start, period.end) : '') + '</div></div>' +
        '<div class="meta-box"><div class="k">القاعة</div><div class="v">' + UI.escapeHtml(App.hallName(session.hallId) || 'بلا قاعة') + '</div></div>' +
        '<div class="meta-box"><div class="k">المدرب</div><div class="v">' + UI.escapeHtml(course ? App.trainerName(course.trainerId) || 'بلا مدرب' : '') + '</div></div>' +
        '<div class="meta-box"><div class="k">الحالة</div><div class="v">' + UI.pillForSessionState(session.state) + '</div></div>' +
        '</div>' +
        (session.note ? '<div class="card-white" style="margin-bottom:18px"><strong>ملاحظة الجلسة:</strong> ' + UI.escapeHtml(session.note) + '</div>' : '') +
        '<h3>الحضور</h3><div id="sess-att-block"></div>' +
        '<h3 style="margin-top:24px">ملاحظات الجلسة</h3><div id="sess-notes-box"></div>' +
        (canWrite ? '<div style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap">' +
          '<button class="btn btn-outline btn-sm" type="button" id="sess-state-btn">تغيير الحالة</button>' +
          '<button class="btn btn-outline btn-sm" type="button" id="sess-hall-btn">تغيير القاعة</button>' +
          '<button class="btn btn-outline btn-sm" type="button" id="sess-note-btn">ملاحظة الجلسة</button>' +
          '<button class="btn btn-outline btn-sm" type="button" id="sess-course-btn">فتح الدورة</button>' +
          '<button class="btn btn-outline btn-sm" type="button" id="sess-export-btn">تصدير الحضور ↓</button>' +
          '</div>' : ''),
      actions: [{ label: 'إغلاق', className: 'btn-outline', closeOnClick: true }],
      onClose: function () { if (notesDestroy) { notesDestroy(); notesDestroy = null; } }
    });

    renderAttendanceBlock(modal.element.querySelector('#sess-att-block'), sessionId, {});
    var notesDestroy = UI.notesWidget('session', sessionId, modal.element.querySelector('#sess-notes-box'), { canWrite: canWrite });

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
      UI.openFormModal('تغيير قاعة الجلسة',
        '<div class="field"><label>القاعة</label><select name="hallId"><option value="">بدون قاعة</option>' +
        App.Store.getAll('halls').map(function (h) {
          return '<option value="' + UI.escapeHtml(h.id) + '"' + (session.hallId === h.id ? ' selected' : '') + '>' + UI.escapeHtml(h.name) + '</option>';
        }).join('') + '</select><div class="field-hint" id="sess-hall-avail">جارٍ فحص توفر القاعات…</div></div>',
        function (form, close2, btn2) {
          var hallId = form.querySelector('[name="hallId"]').value || null;
          UI.setBtnLoading(btn2, true);
          window.TadreebDB.update('sessions', sessionId, { hallId: hallId }).then(function () {
            UI.setBtnLoading(btn2, false);
            close2();
            UI.toast('تم تغيير قاعة الجلسة', 'success');
            App.refresh();
            reopen();
          }).catch(function (err) { UI.setBtnLoading(btn2, false); UI.toastError(err); });
        }, { submitLabel: 'حفظ', width: 'normal' });
      window.TadreebDB.checkHallAvailability(session.date, session.periodId).then(function (rows) {
        var el = document.querySelector('#sess-hall-avail');
        if (!el) return;
        var busy = rows.filter(function (r) { return !r.free && r.hallId !== session.hallId; });
        el.textContent = busy.length ?
          'مشغولة في هذا الموعد: ' + busy.map(function (r) { return r.hallName + ' (' + r.sessionCourse + ')'; }).join('، ') :
          'كل القاعات متاحة في هذا الموعد.';
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
  }

  window.SessionScreen = { open: open, renderAttendanceBlock: renderAttendanceBlock };
})();
