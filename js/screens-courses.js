// تدريب — شاشتا الدورات وتفاصيل الدورة.
// تُسجَّل في window.Screens.courses و window.Screens['course-detail'].
(function () {
  'use strict';

  var currentFilter = 'all';

  // ================= قائمة الدورات =================
  function renderCourses(container) {
    var Store = App.Store;
    var canWrite = App.canWrite();
    var courses = Store.getAll('courses').slice();
    if (currentFilter !== 'all') {
      courses = courses.filter(function (c) { return c.status === currentFilter; });
    }
    courses.sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
    });

    var html = '';
    html += '<div class="page-head"><div><h1>الدورات</h1>' +
      '<div class="muted">جميع الدورات التدريبية الحالية والسابقة</div></div>' +
      '<div class="head-actions"><button class="btn btn-outline btn-sm" type="button" id="courses-export-btn">تصدير إكسل ↓</button>';
    if (canWrite) html += '<button class="btn" type="button" id="new-course-btn">دورة جديدة</button>';
    html += '</div></div>';

    var chips = [['all', 'الكل'], ['active', 'نشطة'], ['completed', 'مكتملة'], ['cancelled', 'ملغاة']];
    html += '<div class="chips">';
    chips.forEach(function (chip) {
      html += '<button class="chip' + (currentFilter === chip[0] ? ' active' : '') + '" type="button" data-filter="' +
        chip[0] + '">' + chip[1] + '</button>';
    });
    html += '</div>';

    html += '<div class="card">';
    if (!courses.length) {
      html += UI.emptyState('لا دورات هنا', currentFilter === 'all' ?
        'لم تُنشأ أي دورة بعد.' : 'لا دورات بهذه الحالة.',
        canWrite && currentFilter === 'all' ? 'دورة جديدة' : null, 'courses-empty-new');
    } else {
      html += '<div class="table-wrap"><table><thead><tr><th>الدورة</th><th>المدرب</th><th>القاعات</th><th>الأيام</th><th>الجلسات</th><th>التقدم</th><th>الحالة</th><th>المتدربون</th><th>إجراءات</th></tr></thead><tbody>';
      courses.forEach(function (c) {
        var prog = App.courseProgress(c.id);
        var halls = App.hallsUsedByCourse(c.id);
        html += '<tr class="clickable" data-course-open="' + UI.escapeHtml(c.id) + '">' +
          '<td><strong>' + UI.escapeHtml(c.name) + '</strong></td>' +
          '<td>' + UI.escapeHtml(App.trainerName(c.trainerId) || 'بلا مدرب') + '</td>' +
          '<td>' + UI.escapeHtml(halls.length ? halls.join(' · ') : '—') + '</td>' +
          '<td>' + UI.escapeHtml(UI.daysLabel(c.days)) + '</td>' +
          '<td>' + UI.fmtNumber(c.sessionCount) + '</td>' +
          '<td><div class="prog-row"><div class="progress"><i style="width:' + prog.percent + '%"></i></div><span class="muted">' + prog.percent + '%</span></div></td>' +
          '<td>' + UI.pillForCourseStatus(c.status) + '</td>' +
          '<td>' + UI.fmtNumber((c.traineeIds || []).length) + '</td>' +
          '<td><div class="row-actions">' +
          '<button class="link-btn" type="button" data-course-view="' + UI.escapeHtml(c.id) + '">عرض</button>';
        if (canWrite) {
          html += '<button class="link-btn" type="button" data-course-edit="' + UI.escapeHtml(c.id) + '">تعديل</button>' +
            '<button class="link-btn danger" type="button" data-course-del="' + UI.escapeHtml(c.id) + '">حذف</button>';
        }
        html += '</div></td></tr>';
      });
      html += '</tbody></table></div>';
    }
    html += '</div>';

    container.innerHTML = html;

    container.querySelectorAll('[data-filter]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        currentFilter = btn.getAttribute('data-filter');
        renderCourses(container);
      });
    });
    var newBtn = document.getElementById('new-course-btn');
    if (newBtn) newBtn.addEventListener('click', function () { openCourseForm(null); });
    var emptyNew = document.getElementById('courses-empty-new');
    if (emptyNew) emptyNew.addEventListener('click', function () { openCourseForm(null); });

    container.querySelectorAll('[data-course-open]').forEach(function (row) {
      row.addEventListener('click', function (e) {
        if (e.target.closest('button')) return; // زر إجراء — لا تفتح التفاصيل
        App.showScreen('course-detail', { courseId: row.getAttribute('data-course-open') });
      });
    });
    container.querySelectorAll('[data-course-view]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        App.showScreen('course-detail', { courseId: btn.getAttribute('data-course-view') });
      });
    });
    container.querySelectorAll('[data-course-edit]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        openCourseForm(App.Store.get('courses', btn.getAttribute('data-course-edit')));
      });
    });
    container.querySelectorAll('[data-course-del]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var course = App.Store.get('courses', btn.getAttribute('data-course-del'));
        if (!course) return;
        UI.confirmDialog('حذف الدورة', 'هل أنت متأكد من حذف دورة «' + course.name + '»؟ تُحذف الدورة فقط — جلساتها ومصاريفها تبقى في قاعدة البيانات ويمكن حذفها منفردة.',
          function () {
            window.TadreebDB.remove('courses', course.id).then(function () {
              UI.toast('تم حذف الدورة', 'success');
              App.refresh();
            }).catch(UI.toastError);
          });
      });
    });

    var exportBtn = document.getElementById('courses-export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        UI.openPicker({
          title: 'تصدير قائمة الدورات',
          columns: [
            { id: 'trainer', label: 'المدرب', checked: true },
            { id: 'days', label: 'الأيام', checked: true },
            { id: 'period', label: 'الفترة', checked: true },
            { id: 'progress', label: 'التقدم', checked: true },
            { id: 'trainees', label: 'عدد المتدربين', checked: true }
          ],
          scopeOptions: [
            { id: 'filtered', label: 'العرض الحالي (' + (currentFilter === 'all' ? 'الكل' : UI.COURSE_STATUS_LABELS[currentFilter]) + ')' },
            { id: 'all', label: 'كل الدورات' }
          ],
          onConfirm: function (result) {
            var rows = App.buildCoursesListData(result.scope === 'all' ? 'all' : currentFilter);
            rows = rows.map(function (r) {
              var out = { name: r.name, status: r.status, sessions: r.sessions };
              if (result.columns.trainer !== false) out.trainer = r.trainer;
              if (result.columns.days !== false) out.days = r.days;
              if (result.columns.period !== false) out.period = r.period;
              if (result.columns.progress !== false) out.done = r.done;
              if (result.columns.trainees !== false) out.trainees = r.trainees;
              return out;
            });
            UI.callExport('exportCoursesList', [rows]);
          }
        });
      });
    }
  }

  // ================= نموذج الدورة (إنشاء / تعديل) =================
  function trainerOptionsHtml(selectedId) {
    var html = '<option value="">بدون مدرب حالياً</option>';
    App.Store.getAll('trainers').forEach(function (t) {
      html += '<option value="' + UI.escapeHtml(t.id) + '"' +
        (t.id === selectedId ? ' selected' : '') + '>' + UI.escapeHtml(t.name) + '</option>';
    });
    html += '<option value="__new__">إضافة مدرب جديد…</option>';
    return html;
  }

  function periodOptionsHtml(selectedId) {
    var periods = App.Store.getAll('periods').slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var html = '<option value="">اختر الفترة</option>';
    periods.forEach(function (p) {
      html += '<option value="' + UI.escapeHtml(p.id) + '"' + (p.id === selectedId ? ' selected' : '') + '>' +
        UI.escapeHtml(p.label) + ' (' + UI.escapeHtml(p.start) + ' - ' + UI.escapeHtml(p.end) + ')</option>';
    });
    return html;
  }

  function openCourseForm(course) {
    var isEdit = !!course;
    var Store = App.Store;
    var selectedTrainees = new Set((course && course.traineeIds) || []);
    var selectedDirectorates = new Set((course && course.directorateIds) || []);
    var selectedDays = new Set((course && course.days) || []);

    var trainees = Store.getAll('trainees').slice().sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
    });
    var directorates = Store.getAll('directorates').slice().sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
    });

    var traineeRows = trainees.map(function (t) {
      return '<label class="check-row" data-trainee-row="' + UI.escapeHtml(t.name) + '">' +
        '<input type="checkbox" data-trainee-id="' + UI.escapeHtml(t.id) + '"' +
        (selectedTrainees.has(t.id) ? ' checked' : '') + '> ' + UI.escapeHtml(t.name) +
        ' <span class="muted">(' + UI.escapeHtml(App.directorateName(t.directorateId) || 'بلا مديرية') + ')</span></label>';
    }).join('');

    var dirRows = directorates.map(function (d) {
      return '<label class="check-row"><input type="checkbox" data-dir-id="' + UI.escapeHtml(d.id) + '"' +
        (selectedDirectorates.has(d.id) ? ' checked' : '') + '> ' + UI.escapeHtml(d.name) + '</label>';
    }).join('');

    var dayBoxes = UI.WEEKDAYS.map(function (name, i) {
      return '<label class="day-chip' + (selectedDays.has(i) ? ' checked' : '') + '"><input type="checkbox" data-day="' +
        i + '"' + (selectedDays.has(i) ? ' checked' : '') + '> ' + name + '</label>';
    }).join('');

    var fields = '<div class="form-grid">' +
      '<div class="field field-full"><label>اسم الدورة *</label>' +
      '<input type="text" name="name" required value="' + UI.escapeHtml(course ? course.name : '') + '" placeholder="مثال: دورة إكسل"></div>' +
      '<div class="field"><label>المدرب</label><select name="trainerId">' + trainerOptionsHtml(course ? course.trainerId : null) + '</select>' +
      '<div class="field-hint">يمكن إنشاء الدورة بدون مدرب والتعاقد معه لاحقاً.</div></div>' +
      '<div class="field"><label>الفترة التدريبية *</label><select name="periodId" required>' + periodOptionsHtml(course ? course.periodId : null) + '</select></div>' +
      '<div class="field"><label>عدد الجلسات *</label><input type="number" name="sessionCount" min="1" max="200" required value="' +
      UI.escapeHtml(course ? course.sessionCount : 20) + '"></div>' +
      '<div class="field"><label>ميزانية الدورة (ل.س)</label><input type="number" name="budget" min="0" step="1" value="' +
      UI.escapeHtml(course ? (course.budget || 0) : 0) + '"></div>' +
      (isEdit ? '<div class="field"><label>حالة الدورة</label><select name="status">' +
        Object.keys(UI.COURSE_STATUS_LABELS).map(function (k) {
          return '<option value="' + k + '"' + (course.status === k ? ' selected' : '') + '>' + UI.COURSE_STATUS_LABELS[k] + '</option>';
        }).join('') + '</select></div>' : '') +
      (!isEdit ? '<div class="field"><label>توليد الجدول لعدد أسابيع</label><select name="weeks">' +
        '<option value="1">أسبوع واحد</option><option value="2" selected>أسبوعان</option>' +
        '<option value="3">3 أسابيع</option><option value="4">4 أسابيع</option></select>' +
        '<div class="field-hint">يُنشئ الجلسات أسبوعاً بعد أسبوع ويتخطى العطل تلقائياً.</div></div>' : '') +
      '<div class="field field-full"><label>أيام الدورة الأسبوعية *</label><div class="day-picker">' + dayBoxes + '</div></div>' +
      '<div class="field field-full"><label>المديريات</label>' +
      (dirRows ? '<div class="check-list">' + dirRows + '</div>' : '<div class="muted">لا مديريات مسجلة — أضف مديرية من الدليل أولاً.</div>') + '</div>' +
      '<div class="field field-full"><label>المتدربون</label>' +
      '<input type="text" class="check-list-search" id="cf-trainee-search" placeholder="ابحث بالاسم…">' +
      (traineeRows ? '<div class="check-list" id="cf-trainee-list">' + traineeRows + '</div>' :
        '<div class="muted">لا متدربين مسجلين — أضف متدرباً جديداً أدناه.</div>') +
      '<div class="inline-add"><h3>إضافة متدرب جديد</h3><div class="form-grid">' +
      '<div class="field"><label>الاسم</label><input type="text" name="newTraineeName" placeholder="اسم المتدرب"></div>' +
      '<div class="field"><label>المديرية</label><select name="newTraineeDirectorate"><option value="">اختر المديرية</option>' +
      directorates.map(function (d) { return '<option value="' + UI.escapeHtml(d.id) + '">' + UI.escapeHtml(d.name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label>رقم الهاتف</label><input type="text" name="newTraineePhone" placeholder="رقم الهاتف"></div>' +
      '<div class="field"><label>ملاحظات</label><input type="text" name="newTraineeNotes" placeholder="ملاحظات أخرى (اختياري)"></div>' +
      '</div><div class="field-hint">إن كتبت اسماً هنا، سيُضاف المتدرب الجديد إلى الدورة تلقائياً.</div></div>' +
      '</div>' +
      '<div class="field field-full" id="cf-new-trainer" hidden><div class="inline-add"><h3>مدرب جديد</h3><div class="form-grid">' +
      '<div class="field"><label>اسم المدرب</label><input type="text" name="newTrainerName" placeholder="اسم المدرب"></div>' +
      '<div class="field"><label>التخصص</label><input type="text" name="newTrainerSpecialty" placeholder="التخصص"></div>' +
      '<div class="field"><label>رقم الهاتف</label><input type="text" name="newTrainerPhone" placeholder="رقم الهاتف"></div>' +
      '</div></div></div>' +
      '</div>';

    var modal = UI.openFormModal(isEdit ? 'تعديل الدورة' : 'دورة جديدة', fields, function (form, close, submitBtn) {
      submitCourseForm(form, close, submitBtn, course, isEdit);
    }, { submitLabel: isEdit ? 'حفظ التعديلات' : 'إنشاء الدورة وتوليد الجدول', width: 'xwide' });

    // تفاعلات النموذج
    var card = modal.element;
    var trainerSelect = card.querySelector('select[name="trainerId"]');
    var newTrainerBox = card.querySelector('#cf-new-trainer');
    if (trainerSelect) {
      trainerSelect.addEventListener('change', function () {
        newTrainerBox.hidden = trainerSelect.value !== '__new__';
      });
    }
    var search = card.querySelector('#cf-trainee-search');
    var list = card.querySelector('#cf-trainee-list');
    if (search && list) {
      search.addEventListener('input', function () {
        var q = search.value.trim();
        list.querySelectorAll('[data-trainee-row]').forEach(function (row) {
          row.style.display = !q || row.getAttribute('data-trainee-row').indexOf(q) !== -1 ? '' : 'none';
        });
      });
    }
    card.querySelectorAll('.day-chip input').forEach(function (cb) {
      cb.addEventListener('change', function () {
        cb.closest('.day-chip').classList.toggle('checked', cb.checked);
      });
    });
  }

  function submitCourseForm(form, close, submitBtn, course, isEdit) {
    var name = form.querySelector('[name="name"]').value.trim();
    var periodId = form.querySelector('[name="periodId"]').value;
    var sessionCount = parseInt(form.querySelector('[name="sessionCount"]').value, 10);
    var budget = parseInt(form.querySelector('[name="budget"]').value, 10) || 0;
    var trainerSel = form.querySelector('[name="trainerId"]').value;

    var days = [];
    form.querySelectorAll('[data-day]:checked').forEach(function (cb) { days.push(parseInt(cb.getAttribute('data-day'), 10)); });
    var traineeIds = [];
    form.querySelectorAll('[data-trainee-id]:checked').forEach(function (cb) { traineeIds.push(cb.getAttribute('data-trainee-id')); });
    var directorateIds = [];
    form.querySelectorAll('[data-dir-id]:checked').forEach(function (cb) { directorateIds.push(cb.getAttribute('data-dir-id')); });

    if (!name) { UI.formError(form, 'اسم الدورة مطلوب'); return; }
    if (!periodId) { UI.formError(form, 'اختر الفترة التدريبية'); return; }
    if (!sessionCount || sessionCount < 1) { UI.formError(form, 'عدد الجلسات غير صالح'); return; }
    if (!days.length) { UI.formError(form, 'اختر يوماً واحداً على الأقل من أيام الأسبوع'); return; }

    var newTraineeName = form.querySelector('[name="newTraineeName"]').value.trim();
    var newTrainerName = trainerSel === '__new__' ? form.querySelector('[name="newTrainerName"]').value.trim() : '';

    if (trainerSel === '__new__' && !newTrainerName) {
      UI.formError(form, 'اكتب اسم المدرب الجديد أو اختر مدرباً مسجلاً');
      return;
    }

    UI.formError(form, '');
    UI.setBtnLoading(submitBtn, true, isEdit ? 'جارٍ الحفظ…' : 'جارٍ الإنشاء…');

    var chain = Promise.resolve({ trainerId: trainerSel === '__new__' ? null : (trainerSel || null) });

    if (trainerSel === '__new__') {
      chain = chain.then(function (ctx) {
        return window.TadreebDB.add('trainers', {
          name: newTrainerName,
          specialty: form.querySelector('[name="newTrainerSpecialty"]').value.trim(),
          phone: form.querySelector('[name="newTrainerPhone"]').value.trim()
        }).then(function (id) { ctx.trainerId = id; return ctx; });
      });
    }
    if (newTraineeName) {
      chain = chain.then(function (ctx) {
        return window.TadreebDB.add('trainees', {
          name: newTraineeName,
          directorateId: form.querySelector('[name="newTraineeDirectorate"]').value || null,
          phone: form.querySelector('[name="newTraineePhone"]').value.trim(),
          notes: form.querySelector('[name="newTraineeNotes"]').value.trim(),
          status: null
        }).then(function (id) { traineeIds.push(id); return ctx; });
      });
    }

    chain.then(function (ctx) {
      var data = {
        name: name,
        trainerId: ctx.trainerId,
        traineeIds: traineeIds,
        directorateIds: directorateIds,
        days: days,
        periodId: periodId,
        sessionCount: sessionCount,
        budget: budget
      };
      if (isEdit) {
        data.status = form.querySelector('[name="status"]').value;
        return window.TadreebDB.update('courses', course.id, data).then(function () {
          return { courseId: course.id, edited: true };
        });
      }
      data.status = 'active';
      data.trainerContract = null;
      return window.TadreebDB.add('courses', data).then(function (id) {
        return { courseId: id, edited: false };
      });
    }).then(function (res) {
      if (res.edited) {
        UI.setBtnLoading(submitBtn, false);
        close();
        UI.toast('تم حفظ تعديلات الدورة', 'success');
        return App.refresh();
      }
      // توليد الجدول للدورة الجديدة
      var weeks = parseInt(form.querySelector('[name="weeks"]').value, 10) || 2;
      return window.TadreebDB.generateSchedule(res.courseId, weeks).then(function (result) {
        UI.setBtnLoading(submitBtn, false);
        close();
        UI.toast('تم إنشاء الدورة وتوليد الجدول', 'success');
        showScheduleResult(result);
        return App.refresh().then(function () {
          App.showScreen('course-detail', { courseId: res.courseId });
        });
      }).catch(function (err) {
        UI.setBtnLoading(submitBtn, false);
        close();
        UI.toastError(err);
        return App.refresh().then(function () {
          App.showScreen('course-detail', { courseId: res.courseId });
        });
      });
    }).catch(function (err) {
      UI.setBtnLoading(submitBtn, false);
      UI.formError(form, err && err.message ? err.message : 'تعذّر حفظ الدورة');
    });
  }

  function showScheduleResult(result) {
    var body = '<p>أُنشئت <strong>' + result.created + '</strong> جلسة جديدة.</p>';
    if (result.skippedHolidays) {
      body += '<p>تُخطي <strong>' + result.skippedHolidays + '</strong> يوم عطلة (بلا جلسات).</p>';
    }
    if (result.unassignedHalls && result.unassignedHalls.length) {
      body += '<p>جلسات بلا قاعة حرة (تحتاج تعييناً يدوياً):</p><ul>';
      result.unassignedHalls.forEach(function (d) {
        body += '<li>' + UI.escapeHtml(UI.fmtDateFull(d)) + '</li>';
      });
      body += '</ul>';
    } else if (result.created) {
      body += '<p>عُيّنت قاعة حرة لكل جلسة.</p>';
    }
    UI.openModal({
      title: 'نتيجة توليد الجدول',
      bodyHTML: body,
      actions: [{ label: 'حسناً', closeOnClick: true }]
    });
  }

  // ================= تفاصيل الدورة =================
  var detailState = { courseId: null, selectedSessionId: null, mergeFromId: null, notesDestroy: null };

  function renderCourseDetail(container, params) {
    var courseId = params && params.courseId;
    var course = App.Store.get('courses', courseId);
    if (!course) {
      container.innerHTML = '<div class="error-view"><div class="error-title">الدورة غير موجودة</div>' +
        '<p>ربما حُذفت هذه الدورة.</p><button class="btn" type="button" id="cd-back-btn">العودة إلى الدورات</button></div>';
      document.getElementById('cd-back-btn').addEventListener('click', function () { App.showScreen('courses'); });
      return;
    }
    // عند الانتقال إلى دورة أخرى، تُصفَّر الجلسة المحددة ووضع الدمج
    // (وإلا عُرض حضور جلسة من الدورة السابقة).
    if (detailState.courseId !== courseId) {
      detailState.courseId = courseId;
      detailState.selectedSessionId = null;
      detailState.mergeFromId = null;
    }
    var canWrite = App.canWrite();
    var Store = App.Store;
    var sessions = App.sessionsForCourse(courseId);
    var prog = App.courseProgress(courseId);
    var period = App.periodFor(course);
    var trainer = course.trainerId ? Store.get('trainers', course.trainerId) : null;
    var contract = course.trainerContract || null;
    var feeDue = App.trainerFeeFor(course);
    var budget = App.budgetFromCache(courseId);
    var trainees = App.courseTrainees(course);

    // الجلسة المحددة افتراضياً: جلسة اليوم، ثم القادمة، ثم الأولى.
    if (!detailState.selectedSessionId || !Store.get('sessions', detailState.selectedSessionId)) {
      var today = UI.todayStr();
      var pick = sessions.find(function (s) { return s.date === today; }) ||
        sessions.find(function (s) { return s.date > today; }) || sessions[0];
      detailState.selectedSessionId = pick ? pick.id : null;
    }
    var selectedSession = detailState.selectedSessionId ? Store.get('sessions', detailState.selectedSessionId) : null;

    var html = '';
    html += '<div class="page-head"><div><a class="back-link" href="#" id="cd-back">العودة إلى الدورات</a>' +
      '<h1>' + UI.escapeHtml(course.name) + '</h1>' +
      '<div class="muted">' + UI.escapeHtml(UI.daysLabel(course.days)) + ' · ' +
      UI.escapeHtml(period ? period.label : '') + '</div></div>' +
      '<div class="head-actions">' + UI.pillForCourseStatus(course.status) +
      '<button class="btn btn-outline btn-sm" type="button" id="cd-export-btn">تصدير ملف الدورة ↓</button>' +
      (canWrite ? '<button class="btn btn-outline btn-sm" type="button" id="cd-edit-btn">تعديل الدورة</button>' : '') +
      '</div></div>';

    // البطاقات الوصفية
    var contractHtml = '';
    if (contract) {
      if (contract.type === 'fixed') {
        contractHtml = 'الأجر: ثابت للدورة كاملة · ' + UI.fmtMoney(contract.amount);
      } else {
        var hours = 0;
        if (period) {
          var mins = function (t) { var p = String(t).split(':'); return parseInt(p[0], 10) * 60 + parseInt(p[1], 10); };
          hours = (Number(course.sessionCount) || 0) * Math.max(0, (mins(period.end) - mins(period.start)) / 60);
        }
        contractHtml = 'الأجر: بالساعة · ' + UI.fmtMoney(contract.rate) + ' للساعة<br>إجمالي العقد: ' +
          UI.fmtMoney(feeDue) + ' (' + hours + ' ساعة)';
      }
    }
    html += '<div class="meta-grid">' +
      '<div class="meta-box"><div class="k">المدرب</div><div class="v">' +
      UI.escapeHtml(trainer ? trainer.name : 'بدون مدرب حالياً') + '</div>' +
      (contractHtml ? '<div class="muted" style="font-size:12px;line-height:1.6">' + contractHtml + '</div>' : '') +
      (canWrite ? '<div style="margin-top:8px"><button class="link-btn" type="button" id="cd-contract-btn">' +
        (trainer ? 'تغيير المدرب / العقد' : 'تعاقد مع مدرب') + '</button></div>' : '') + '</div>' +
      '<div class="meta-box"><div class="k">الفترة</div><div class="v">' + UI.escapeHtml(period ? period.label : '—') + '</div></div>' +
      '<div class="meta-box"><div class="k">الأيام</div><div class="v">' + UI.escapeHtml(UI.daysLabel(course.days)) + '</div></div>' +
      '<div class="meta-box"><div class="k">الوقت</div><div class="v">' + (period ? UI.fmtTimeRange(period.start, period.end) : '—') + '</div></div>' +
      '<div class="meta-box"><div class="k">المديريات</div><div class="v">' +
      UI.escapeHtml((course.directorateIds || []).map(App.directorateName).filter(Boolean).join(' · ') || '—') + '</div></div>' +
      '</div>';

    // التقدم
    html += '<div class="card"><div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px"><strong>التقدم في الدورة</strong>' +
      '<span class="muted">' + prog.done + ' جلسات مكتملة من ' + prog.total + ' · المتبقي ' + prog.remaining + ' جلسة</span></div>' +
      '<div class="progress" style="margin-top:12px;height:12px"><i style="width:' + prog.percent + '%"></i></div></div>';

    // جدول الجلسات
    html += '<div class="card"><div class="section-title-row"><h2 style="margin:0">جدول الجلسات</h2><div class="head-actions">';
    if (canWrite) {
      html += '<button class="btn btn-outline btn-sm" type="button" id="cd-generate-btn">توليد جلسات إضافية</button>' +
        '<button class="btn btn-sm" type="button" id="cd-add-session-btn">إضافة جلسة</button>';
    }
    html += '</div></div>';
    if (detailState.mergeFromId) {
      html += '<div class="form-error" style="background:#EAF3F8;color:#081F31">وضع الدمج: اختر الجلسة التي تريد دمجها في الجلسة المحددة، أو <button class="link-btn" type="button" id="cd-merge-cancel">إلغاء الدمج</button></div>';
    }
    if (!sessions.length) {
      html += UI.emptyState('لا جلسات بعد', 'ولّد الجدول أو أضف جلسة يدوياً.', canWrite ? 'توليد الجدول' : null, 'cd-empty-generate');
    } else {
      html += '<div class="table-wrap"><table><thead><tr><th>الجلسة</th><th>التاريخ</th><th>اليوم</th><th>الوقت</th><th>القاعة</th><th>الحالة</th><th>ملاحظة</th>' +
        (canWrite ? '<th>إجراءات</th>' : '') + '</tr></thead><tbody>';
      sessions.forEach(function (s, i) {
        var sp = Store.get('periods', s.periodId);
        var isSel = selectedSession && selectedSession.id === s.id;
        html += '<tr class="clickable' + (isSel ? ' selected-row' : '') + (detailState.mergeFromId === s.id ? ' merge-pick' : '') +
          '" data-session-row="' + UI.escapeHtml(s.id) + '"><td>' + (i + 1) + '</td>' +
          '<td>' + UI.escapeHtml(UI.fmtDateShort(s.date)) + '</td>' +
          '<td>' + UI.escapeHtml(UI.fmtWeekday(s.date)) + '</td>' +
          '<td>' + (sp ? UI.fmtTimeRange(sp.start, sp.end) : '') + '</td>' +
          '<td>' + UI.escapeHtml(App.hallName(s.hallId) || 'بلا قاعة') + '</td>' +
          '<td>' + UI.pillForSessionState(s.state) + '</td>' +
          '<td>' + UI.escapeHtml(s.note || '') + '</td>';
        if (canWrite) {
          html += '<td><div class="row-actions">' +
            '<button class="link-btn" type="button" data-sess-state="' + UI.escapeHtml(s.id) + '">الحالة</button>' +
            '<button class="link-btn" type="button" data-sess-hall="' + UI.escapeHtml(s.id) + '">القاعة</button>' +
            '<button class="link-btn" type="button" data-sess-note="' + UI.escapeHtml(s.id) + '">ملاحظة</button>' +
            '<button class="link-btn" type="button" data-sess-merge="' + UI.escapeHtml(s.id) + '">دمج</button>' +
            '<button class="link-btn danger" type="button" data-sess-del="' + UI.escapeHtml(s.id) + '">حذف</button>' +
            '</div></td>';
        }
        html += '</tr>';
      });
      html += '</tbody></table></div>';
      html += '<div class="muted" style="margin-top:10px">انقر على أي جلسة لعرض حضورها وتسجيله — يمكن تسجيل الحضور وتصحيحه لأي جلسة، سابقة أو قادمة.</div>';
    }
    html += '</div>';

    // حضور الجلسة المحددة
    html += '<div class="card" id="cd-attendance-card"><div class="section-title-row"><h2 style="margin:0">حضور الجلسة</h2>' +
      (selectedSession ? '<button class="btn btn-outline btn-sm" type="button" id="cd-att-export-btn">تصدير الحضور ↓</button>' : '') +
      '</div><div id="cd-attendance-body">' + UI.loadingState('جارٍ تحميل الحضور…') + '</div></div>';

    // المتدربون
    html += '<div class="card"><h2>المتدربون (' + trainees.length + ')</h2>';
    if (!trainees.length) {
      html += '<div class="muted">لا متدربين في هذه الدورة بعد — أضفهم من تعديل الدورة.</div>';
    } else {
      html += '<div class="table-wrap"><table><thead><tr><th>المتدرب</th><th>المديرية</th><th>رقم الهاتف</th><th>الحالة</th><th>ملاحظات</th>' +
        (canWrite ? '<th>إجراءات</th>' : '') + '</tr></thead><tbody>';
      trainees.forEach(function (t) {
        html += '<tr><td>' + UI.escapeHtml(t.name) + '</td>' +
          '<td>' + UI.escapeHtml(App.directorateName(t.directorateId) || '—') + '</td>' +
          '<td><span class="ltr">' + UI.escapeHtml(t.phone || '—') + '</span></td>' +
          '<td>' + (canWrite ?
            '<select class="input" data-trainee-status="' + UI.escapeHtml(t.id) + '" style="padding:6px 8px">' +
            '<option value="">بلا حالة</option>' +
            Object.keys(UI.TRAINEE_STATUS_LABELS).map(function (k) {
              return '<option value="' + k + '"' + (t.status === k ? ' selected' : '') + '>' + UI.TRAINEE_STATUS_LABELS[k] + '</option>';
            }).join('') + '</select>' : UI.pillForTraineeStatus(t.status)) + '</td>' +
          '<td>' + UI.escapeHtml(t.notes || '') + '</td>';
        if (canWrite) {
          html += '<td><div class="row-actions">' +
            '<button class="link-btn" type="button" data-trainee-notes="' + UI.escapeHtml(t.id) + '">ملاحظات</button>' +
            '<button class="link-btn danger" type="button" data-trainee-remove="' + UI.escapeHtml(t.id) + '">إزالة من الدورة</button>' +
            '</div></td>';
        }
        html += '</tr>';
      });
      html += '</tbody></table></div>';
    }
    html += '</div>';

    // ملاحظات الدورة
    html += '<div class="card"><h2>ملاحظات الدورة</h2><div id="cd-notes"></div></div>';

    // الميزانية
    var spentPct = budget.allocated > 0 ? Math.min(100, Math.round((budget.totalSpent / budget.allocated) * 100)) : 0;
    html += '<div class="card"><div class="section-title-row"><h2 style="margin:0">ميزانية الدورة</h2>' +
      '<div class="head-actions"><button class="btn btn-outline btn-sm" type="button" id="cd-budget-export-btn">تصدير الميزانية ↓</button>' +
      '<button class="btn btn-outline btn-sm" type="button" id="cd-closing-btn">تقرير ختامي</button></div></div>' +
      '<div class="period-grid">' +
      '<div class="meta-box"><div class="k">الميزانية المعتمدة</div><div class="v">' + UI.fmtMoney(budget.allocated) + '</div></div>' +
      '<div class="meta-box"><div class="k">إجمالي المصاريف</div><div class="v">' + UI.fmtMoney(budget.totalSpent) + '</div></div>' +
      '<div class="meta-box"><div class="k">المتبقي</div><div class="v">' + UI.fmtMoney(budget.remaining) + '</div></div>' +
      '</div>' +
      '<div class="table-wrap"><table><thead><tr><th>الفئة</th><th>المصروف</th></tr></thead><tbody>';
    var cats = Object.keys(budget.byCategory);
    if (!cats.length && !budget.trainerFeeDue) {
      html += '<tr><td colspan="2" class="muted">لا مصاريف مسجلة بعد.</td></tr>';
    } else {
      cats.forEach(function (cat) {
        html += '<tr><td>' + UI.escapeHtml(cat) + '</td><td>' + UI.fmtMoney(budget.byCategory[cat]) + '</td></tr>';
      });
      if (budget.trainerFeeDue > 0) {
        html += '<tr><td>أجور المدربين <span class="muted">(مستحقة — غير مسجلة كمصروف بعد)</span></td><td>' + UI.fmtMoney(budget.trainerFeeDue) + '</td></tr>';
      }
      html += '<tr><td><strong>إجمالي المصاريف</strong></td><td><strong>' + UI.fmtMoney(budget.totalSpent) + '</strong></td></tr>';
      if (budget.trainerFeeDue > 0) {
        html += '<tr><td><strong>الإجمالي مع أجور المدربين المستحقة</strong></td><td><strong>' + UI.fmtMoney(budget.totalWithFees) + '</strong></td></tr>' +
          '<tr><td><strong>المتبقي مع الأجور المستحقة</strong></td><td><strong>' + UI.fmtMoney(budget.remainingWithFees) + '</strong></td></tr>';
      }
    }
    html += '</tbody></table></div>' +
      '<div style="margin-top:14px"><div style="display:flex;justify-content:space-between"><span>تم صرف ' + spentPct + '% من الميزانية</span>' +
      '<span class="muted">المتبقي: ' + UI.fmtMoney(budget.remaining) + '</span></div>' +
      '<div class="progress" style="margin-top:6px;height:12px"><i style="width:' + spentPct + '%"></i></div></div>';

    // تفاصيل المصاريف
    html += '<h3 style="margin-top:22px">تفاصيل المصاريف</h3>';
    if (!budget.expenses.length) {
      html += '<div class="muted">لا بنود مصاريف بعد.</div>';
    } else {
      html += '<div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>الفئة</th><th>البيان</th><th>المبلغ</th>' +
        (canWrite ? '<th>إجراءات</th>' : '') + '</tr></thead><tbody>';
      budget.expenses.forEach(function (e) {
        html += '<tr><td>' + UI.escapeHtml(UI.fmtDate(e.date)) + '</td><td>' + UI.escapeHtml(e.category) + '</td>' +
          '<td>' + UI.escapeHtml(e.description || '') + '</td><td>' + UI.fmtMoney(e.amount) + '</td>';
        if (canWrite) {
          html += '<td><div class="row-actions">' +
            '<button class="link-btn" type="button" data-exp-edit="' + UI.escapeHtml(e.id) + '">تعديل</button>' +
            '<button class="link-btn" type="button" data-exp-notes="' + UI.escapeHtml(e.id) + '">ملاحظات</button>' +
            '<button class="link-btn danger" type="button" data-exp-del="' + UI.escapeHtml(e.id) + '">حذف</button>' +
            '</div></td>';
        }
        html += '</tr>';
      });
      html += '</tbody></table></div>';
    }
    if (canWrite) {
      html += '<div style="margin-top:18px"><button class="btn btn-outline btn-sm" type="button" id="cd-add-expense-btn">إضافة مصروف</button></div>';
    }
    html += '</div>';

    container.innerHTML = html;

    // ----- ربط الأحداث -----
    document.getElementById('cd-back').addEventListener('click', function (e) {
      e.preventDefault();
      App.showScreen('courses');
    });
    var editBtn = document.getElementById('cd-edit-btn');
    if (editBtn) editBtn.addEventListener('click', function () { openCourseForm(course); });
    var contractBtn = document.getElementById('cd-contract-btn');
    if (contractBtn) contractBtn.addEventListener('click', function () { openContractModal(course); });

    var genBtn = document.getElementById('cd-generate-btn');
    if (genBtn) genBtn.addEventListener('click', function () { openGenerateMoreModal(course); });
    var emptyGen = document.getElementById('cd-empty-generate');
    if (emptyGen) emptyGen.addEventListener('click', function () { openGenerateMoreModal(course); });
    var addSessBtn = document.getElementById('cd-add-session-btn');
    if (addSessBtn) addSessBtn.addEventListener('click', function () { openAddSessionModal(course); });
    var mergeCancel = document.getElementById('cd-merge-cancel');
    if (mergeCancel) mergeCancel.addEventListener('click', function () {
      detailState.mergeFromId = null;
      App.refresh();
    });

    // صفوف الجلسات
    container.querySelectorAll('[data-session-row]').forEach(function (row) {
      row.addEventListener('click', function (e) {
        if (e.target.closest('button')) return;
        var id = row.getAttribute('data-session-row');
        if (detailState.mergeFromId) {
          if (id === detailState.mergeFromId) return;
          var keep = App.Store.get('sessions', detailState.mergeFromId);
          var remove = App.Store.get('sessions', id);
          UI.confirmDialog('دمج الجلستين',
            'سيُدمج حضور جلسة ' + UI.fmtDate(remove.date) + ' في جلسة ' + UI.fmtDate(keep.date) + '، ثم تُحذف الجلسة المدمجة. هل أنت متأكد؟',
            function () {
              window.TadreebDB.mergeSessions(keep.id, remove.id).then(function () {
                detailState.mergeFromId = null;
                if (detailState.selectedSessionId === remove.id) detailState.selectedSessionId = keep.id;
                UI.toast('تم دمج الجلستين', 'success');
                App.refresh();
              }).catch(UI.toastError);
            });
          return;
        }
        detailState.selectedSessionId = id;
        App.renderScreen('course-detail', { courseId: courseId });
      });
    });
    container.querySelectorAll('[data-sess-state]').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.stopPropagation(); openSessionStateModal(btn.getAttribute('data-sess-state')); });
    });
    container.querySelectorAll('[data-sess-hall]').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.stopPropagation(); openSessionHallModal(btn.getAttribute('data-sess-hall')); });
    });
    container.querySelectorAll('[data-sess-note]').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.stopPropagation(); openSessionNoteModal(btn.getAttribute('data-sess-note')); });
    });
    container.querySelectorAll('[data-sess-merge]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        detailState.mergeFromId = btn.getAttribute('data-sess-merge');
        UI.toast('اختر الجلسة التي تريد دمجها في الجلسة المحددة', 'success');
        App.refresh();
      });
    });
    container.querySelectorAll('[data-sess-del]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var s = App.Store.get('sessions', btn.getAttribute('data-sess-del'));
        UI.confirmDialog('حذف الجلسة', 'هل أنت متأكد من حذف جلسة ' + UI.fmtDateFull(s.date) + '؟ سيُحذف حضورها المسجل أيضاً.',
          function () {
            window.TadreebDB.remove('sessions', s.id).then(function () {
              if (detailState.selectedSessionId === s.id) detailState.selectedSessionId = null;
              UI.toast('تم حذف الجلسة', 'success');
              App.refresh();
            }).catch(UI.toastError);
          });
      });
    });

    // المتدربون
    container.querySelectorAll('[data-trainee-status]').forEach(function (sel) {
      sel.addEventListener('change', function () {
        var id = sel.getAttribute('data-trainee-status');
        var status = sel.value || null;
        window.TadreebDB.setTraineeStatus(id, status).then(function () {
          UI.toast('تم تحديث حالة المتدرب', 'success');
        }).catch(UI.toastError);
      });
    });
    container.querySelectorAll('[data-trainee-notes]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var t = App.Store.get('trainees', btn.getAttribute('data-trainee-notes'));
        UI.openFormModal('ملاحظات المتدرب — ' + t.name,
          '<div class="field"><label>ملاحظات</label><textarea name="notes">' + UI.escapeHtml(t.notes || '') + '</textarea></div>',
          function (form, close, submitBtn) {
            var notes = form.querySelector('[name="notes"]').value.trim();
            UI.setBtnLoading(submitBtn, true);
            window.TadreebDB.update('trainees', t.id, { notes: notes }).then(function () {
              UI.setBtnLoading(submitBtn, false);
              close();
              UI.toast('تم حفظ الملاحظات', 'success');
              App.refresh();
            }).catch(function (err) { UI.setBtnLoading(submitBtn, false); UI.toastError(err); });
          });
      });
    });
    container.querySelectorAll('[data-trainee-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var t = App.Store.get('trainees', btn.getAttribute('data-trainee-remove'));
        UI.confirmDialog('إزالة المتدرب من الدورة', 'هل أنت متأكد من إزالة «' + t.name + '» من هذه الدورة؟ يبقى المتدرب مسجلاً في الدليل.',
          function () {
            var ids = (course.traineeIds || []).filter(function (id) { return id !== t.id; });
            window.TadreebDB.update('courses', course.id, { traineeIds: ids }).then(function () {
              UI.toast('تمت إزالة المتدرب من الدورة', 'success');
              App.refresh();
            }).catch(UI.toastError);
          });
      });
    });

    // المصاريف
    var addExpBtn = document.getElementById('cd-add-expense-btn');
    if (addExpBtn) addExpBtn.addEventListener('click', function () { openExpenseModal(course, null); });
    container.querySelectorAll('[data-exp-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openExpenseModal(course, App.Store.get('expenses', btn.getAttribute('data-exp-edit')));
      });
    });
    container.querySelectorAll('[data-exp-del]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var ex = App.Store.get('expenses', btn.getAttribute('data-exp-del'));
        UI.confirmDialog('حذف المصروف', 'هل أنت متأكد من حذف مصروف «' + (ex.description || ex.category) + '»؟',
          function () {
            window.TadreebDB.remove('expenses', ex.id).then(function () {
              UI.toast('تم حذف المصروف', 'success');
              App.refresh();
            }).catch(UI.toastError);
          });
      });
    });
    container.querySelectorAll('[data-exp-notes]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var ex = App.Store.get('expenses', btn.getAttribute('data-exp-notes'));
        var m = UI.openModal({
          title: 'ملاحظات بند المصاريف',
          bodyHTML: '<div class="muted" style="margin-bottom:12px">' + UI.escapeHtml(ex.description || ex.category) + ' · ' + UI.fmtMoney(ex.amount) + '</div><div id="exp-notes-box"></div>',
          actions: [{ label: 'إغلاق', className: 'btn-outline', closeOnClick: true }]
        });
        UI.notesWidget('expense', ex.id, m.element.querySelector('#exp-notes-box'), { canWrite: canWrite });
      });
    });

    // التصدير
    document.getElementById('cd-export-btn').addEventListener('click', function () {
      UI.openPicker({
        title: 'تصدير ملف الدورة',
        sections: [
          { id: 'info', label: 'معلومات الدورة', checked: true },
          { id: 'schedule', label: 'جدول الجلسات', checked: true },
          { id: 'trainees', label: 'أسماء المتدربين', checked: true },
          { id: 'attendance', label: 'الحضور والغياب', checked: true },
          { id: 'budget', label: 'الميزانية', checked: true }
        ],
        onConfirm: function (result) {
          UI.toast('جارٍ تجهيز ملف الدورة…');
          App.buildCourseFileData(courseId).then(function (data) {
            UI.callExport('exportCourseFile', [data, { sections: result.sections }]);
          }).catch(UI.toastError);
        }
      });
    });
    document.getElementById('cd-budget-export-btn').addEventListener('click', function () {
      UI.callExport('exportBudget', [App.buildBudgetData(courseId)]);
    });
    document.getElementById('cd-closing-btn').addEventListener('click', function () {
      UI.openPicker({
        title: 'تصدير التقرير الختامي',
        sections: [
          { id: 'info', label: 'معلومات الدورة', checked: true },
          { id: 'schedule', label: 'جدول الجلسات', checked: true },
          { id: 'trainees', label: 'أسماء المتدربين', checked: true },
          { id: 'attendance', label: 'الحضور والغياب', checked: true },
          { id: 'budget', label: 'الميزانية', checked: true }
        ],
        onConfirm: function (result) {
          UI.toast('جارٍ تجهيز التقرير الختامي…');
          App.buildCourseFileData(courseId).then(function (data) {
            // التقرير الختامي يتضمن ملخصاً ختامياً إضافة إلى أقسام الملف.
            if (UI.hasExport('exportClosingReport')) {
              UI.callExport('exportClosingReport', [data]);
            } else {
              UI.callExport('exportCourseFile', [data, { sections: result.sections }]);
            }
          }).catch(UI.toastError);
        }
      });
    });
    var attExpBtn = document.getElementById('cd-att-export-btn');
    if (attExpBtn) attExpBtn.addEventListener('click', function () {
      if (!selectedSession) return;
      App.buildAttendanceData(selectedSession.id).then(function (data) {
        UI.callExport('exportAttendance', [data]);
      }).catch(UI.toastError);
    });

    // حضور الجلسة المحددة (مكوّن مشترك)
    var attBody = document.getElementById('cd-attendance-body');
    if (window.SessionScreen && selectedSession) {
      window.SessionScreen.renderAttendanceBlock(attBody, selectedSession.id, { embedded: true });
    } else if (attBody) {
      attBody.innerHTML = UI.emptyState('لا جلسة محددة', 'اختر جلسة من الجدول أعلاه لعرض حضورها.');
    }

    // ملاحظات الدورة
    var notesBox = document.getElementById('cd-notes');
    if (notesBox) {
      detailState.notesDestroy = UI.notesWidget('course', courseId, notesBox, { canWrite: canWrite });
    }

    return function cleanup() {
      if (typeof detailState.notesDestroy === 'function') detailState.notesDestroy();
      detailState.notesDestroy = null;
    };
  }

  // ================= نوافذ مساعدة لتفاصيل الدورة =================
  function openContractModal(course) {
    var trainers = App.Store.getAll('trainers');
    var fields = '<div class="form-grid">' +
      '<div class="field field-full"><label>المدرب</label><select name="trainerId">' + trainerOptionsHtml(course.trainerId) + '</select></div>' +
      '<div class="field field-full" id="ct-new-trainer" hidden><div class="inline-add"><h3>مدرب جديد</h3>' +
      '<div class="form-grid"><div class="field"><label>اسم المدرب</label><input type="text" name="newTrainerName"></div>' +
      '<div class="field"><label>التخصص</label><input type="text" name="newTrainerSpecialty"></div>' +
      '<div class="field"><label>رقم الهاتف</label><input type="text" name="newTrainerPhone"></div></div></div></div>' +
      '<div class="field field-full"><label>نوع الأجر</label>' +
      '<label class="check-row"><input type="radio" name="payType" value="fixed"' + (!course.trainerContract || course.trainerContract.type === 'fixed' ? ' checked' : '') + '> أجرة ثابتة للدورة كاملة</label>' +
      '<label class="check-row"><input type="radio" name="payType" value="hourly"' + (course.trainerContract && course.trainerContract.type === 'hourly' ? ' checked' : '') + '> أجر بالساعة</label></div>' +
      '<div class="field" id="ct-fixed-box"><label>المبلغ الثابت (ل.س)</label><input type="number" name="amount" min="0" value="' +
      UI.escapeHtml(course.trainerContract && course.trainerContract.type === 'fixed' ? course.trainerContract.amount : '') + '"></div>' +
      '<div class="field" id="ct-hourly-box"><label>الأجر للساعة الواحدة (ل.س)</label><input type="number" name="rate" min="0" value="' +
      UI.escapeHtml(course.trainerContract && course.trainerContract.type === 'hourly' ? course.trainerContract.rate : '') + '"></div>' +
      '</div>';
    var modal = UI.openFormModal(course.trainerId ? 'تغيير المدرب / العقد' : 'تعاقد مع مدرب', fields, function (form, close, submitBtn) {
      var trainerSel = form.querySelector('[name="trainerId"]').value;
      var payType = form.querySelector('[name="payType"]:checked').value;
      var newTrainerName = trainerSel === '__new__' ? form.querySelector('[name="newTrainerName"]').value.trim() : '';
      if (!trainerSel && trainerSel !== '__new__') {
        // إزالة المدرب والعقد
        UI.setBtnLoading(submitBtn, true);
        window.TadreebDB.update('courses', course.id, { trainerId: null, trainerContract: null }).then(function () {
          UI.setBtnLoading(submitBtn, false);
          close();
          UI.toast('تمت إزالة المدرب من الدورة', 'success');
          App.refresh();
        }).catch(function (err) { UI.setBtnLoading(submitBtn, false); UI.toastError(err); });
        return;
      }
      if (trainerSel === '__new__' && !newTrainerName) { UI.formError(form, 'اكتب اسم المدرب الجديد'); return; }
      var amount = parseInt(form.querySelector('[name="amount"]').value, 10) || 0;
      var rate = parseInt(form.querySelector('[name="rate"]').value, 10) || 0;
      if (payType === 'fixed' && amount <= 0) { UI.formError(form, 'أدخل المبلغ الثابت للدورة'); return; }
      if (payType === 'hourly' && rate <= 0) { UI.formError(form, 'أدخل الأجر للساعة الواحدة'); return; }
      UI.formError(form, '');
      UI.setBtnLoading(submitBtn, true);
      var chain = Promise.resolve(trainerSel);
      if (trainerSel === '__new__') {
        chain = window.TadreebDB.add('trainers', {
          name: newTrainerName,
          specialty: form.querySelector('[name="newTrainerSpecialty"]').value.trim(),
          phone: form.querySelector('[name="newTrainerPhone"]').value.trim()
        });
      }
      chain.then(function (trainerId) {
        var contract = payType === 'fixed' ? { type: 'fixed', amount: amount } : { type: 'hourly', rate: rate };
        return window.TadreebDB.update('courses', course.id, { trainerId: trainerId, trainerContract: contract });
      }).then(function () {
        UI.setBtnLoading(submitBtn, false);
        close();
        UI.toast('تم حفظ عقد المدرب', 'success');
        App.refresh();
      }).catch(function (err) { UI.setBtnLoading(submitBtn, false); UI.toastError(err); });
    }, { submitLabel: 'حفظ العقد' });

    var card = modal.element;
    var sel = card.querySelector('select[name="trainerId"]');
    sel.addEventListener('change', function () {
      card.querySelector('#ct-new-trainer').hidden = sel.value !== '__new__';
    });
    var fixedBox = card.querySelector('#ct-fixed-box');
    var hourlyBox = card.querySelector('#ct-hourly-box');
    function togglePay() {
      var type = card.querySelector('[name="payType"]:checked').value;
      fixedBox.hidden = type !== 'fixed';
      hourlyBox.hidden = type !== 'hourly';
    }
    card.querySelectorAll('[name="payType"]').forEach(function (r) { r.addEventListener('change', togglePay); });
    togglePay();
  }

  function openGenerateMoreModal(course) {
    UI.openFormModal('توليد جلسات إضافية',
      '<div class="field"><label>عدد الأسابيع (بدءاً من اليوم)</label><select name="weeks">' +
      '<option value="1">أسبوع واحد</option><option value="2" selected>أسبوعان</option>' +
      '<option value="3">3 أسابيع</option><option value="4">4 أسابيع</option></select>' +
      '<div class="field-hint">تُنشأ الجلسات الجديدة فقط — الجلسات الموجودة لا تتكرر، والعطل تُتخطى.</div></div>',
      function (form, close, submitBtn) {
        var weeks = parseInt(form.querySelector('[name="weeks"]').value, 10) || 2;
        UI.setBtnLoading(submitBtn, true, 'جارٍ التوليد…');
        window.TadreebDB.generateSchedule(course.id, weeks).then(function (result) {
          UI.setBtnLoading(submitBtn, false);
          close();
          showScheduleResult(result);
          App.refresh();
        }).catch(function (err) { UI.setBtnLoading(submitBtn, false); UI.formError(form, err.message); });
      }, { submitLabel: 'توليد الجلسات', width: 'normal' });
  }

  function openAddSessionModal(course) {
    var periods = App.Store.getAll('periods').slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var fields = '<div class="form-grid">' +
      '<div class="field"><label>التاريخ *</label><input type="date" name="date" required value="' + UI.todayStr() + '"></div>' +
      '<div class="field"><label>الفترة *</label><select name="periodId" required>' +
      periods.map(function (p) {
        return '<option value="' + UI.escapeHtml(p.id) + '"' + (p.id === course.periodId ? ' selected' : '') + '>' +
          UI.escapeHtml(p.label) + ' (' + UI.escapeHtml(p.start) + ' - ' + UI.escapeHtml(p.end) + ')</option>';
      }).join('') + '</select></div>' +
      '<div class="field field-full"><label>القاعة</label><select name="hallId"><option value="">بدون قاعة (تُعيَّن لاحقاً)</option>' +
      App.Store.getAll('halls').map(function (h) {
        return '<option value="' + UI.escapeHtml(h.id) + '">' + UI.escapeHtml(h.name) + '</option>';
      }).join('') + '</select><div class="field-hint" id="as-availability"></div></div>' +
      '<div class="field field-full"><label>ملاحظة</label><input type="text" name="note" placeholder="ملاحظة على الجلسة (اختياري)"></div>' +
      '</div>';
    var modal = UI.openFormModal('إضافة جلسة', fields, function (form, close, submitBtn) {
      var date = form.querySelector('[name="date"]').value;
      var periodId = form.querySelector('[name="periodId"]').value;
      var hallId = form.querySelector('[name="hallId"]').value || null;
      if (!date) { UI.formError(form, 'اختر تاريخ الجلسة'); return; }
      if (!periodId) { UI.formError(form, 'اختر الفترة'); return; }
      var holiday = App.Store.getAll('holidays').find(function (h) { return h.date === date; });
      if (holiday) { UI.formError(form, 'هذا اليوم عطلة: ' + (holiday.name || '')); return; }
      UI.formError(form, '');
      UI.setBtnLoading(submitBtn, true);
      window.TadreebDB.add('sessions', {
        courseId: course.id,
        date: date,
        periodId: periodId,
        hallId: hallId,
        state: 'scheduled',
        note: form.querySelector('[name="note"]').value.trim(),
        trainerPresent: null,
        mergedFrom: null
      }).then(function (id) {
        UI.setBtnLoading(submitBtn, false);
        close();
        detailState.selectedSessionId = id;
        UI.toast('تمت إضافة الجلسة', 'success');
        App.refresh();
      }).catch(function (err) { UI.setBtnLoading(submitBtn, false); UI.formError(form, err.message); });
    }, { submitLabel: 'إضافة الجلسة' });

    // فحص توفر القاعات عند تغيير التاريخ أو الفترة
    var card = modal.element;
    var availEl = card.querySelector('#as-availability');
    var hallSel = card.querySelector('[name="hallId"]');
    function checkAvail() {
      var date = card.querySelector('[name="date"]').value;
      var periodId = card.querySelector('[name="periodId"]').value;
      if (!date || !periodId) { availEl.textContent = ''; return; }
      availEl.textContent = 'جارٍ فحص توفر القاعات…';
      window.TadreebDB.checkHallAvailability(date, periodId).then(function (rows) {
        var free = rows.filter(function (r) { return r.free; }).map(function (r) { return r.hallName; });
        var busy = rows.filter(function (r) { return !r.free; }).map(function (r) { return r.hallName + ' (' + r.sessionCourse + ')'; });
        availEl.textContent = 'متاحة: ' + (free.length ? free.join('، ') : 'لا قاعة حرة') +
          (busy.length ? ' — مشغولة: ' + busy.join('، ') : '');
        // تعطيل القاعات المشغولة في القائمة
        hallSel.querySelectorAll('option[value]').forEach(function (opt) {
          if (!opt.value) return;
          var row = rows.find(function (r) { return r.hallId === opt.value; });
          opt.disabled = !!(row && !row.free);
        });
      }).catch(function () { availEl.textContent = ''; });
    }
    card.querySelector('[name="date"]').addEventListener('change', checkAvail);
    card.querySelector('[name="periodId"]').addEventListener('change', checkAvail);
    checkAvail();
  }

  function openSessionStateModal(sessionId) {
    var s = App.Store.get('sessions', sessionId);
    var fields = '<div class="field"><label>حالة الجلسة</label><select name="state">' +
      Object.keys(UI.SESSION_STATE_LABELS).map(function (k) {
        return '<option value="' + k + '"' + (s.state === k ? ' selected' : '') + '>' + UI.SESSION_STATE_LABELS[k] + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label>ملاحظة (سبب الإيقاف أو الإلغاء)</label><textarea name="note">' + UI.escapeHtml(s.note || '') + '</textarea></div>';
    UI.openFormModal('تغيير حالة الجلسة — ' + UI.fmtDateFull(s.date), fields, function (form, close, submitBtn) {
      var state = form.querySelector('[name="state"]').value;
      var note = form.querySelector('[name="note"]').value.trim();
      UI.setBtnLoading(submitBtn, true);
      window.TadreebDB.setSessionState(sessionId, state, note).then(function () {
        UI.setBtnLoading(submitBtn, false);
        close();
        UI.toast('تم تحديث حالة الجلسة', 'success');
        App.refresh();
      }).catch(function (err) { UI.setBtnLoading(submitBtn, false); UI.toastError(err); });
    }, { submitLabel: 'حفظ', width: 'normal' });
  }

  function openSessionHallModal(sessionId) {
    var s = App.Store.get('sessions', sessionId);
    var fields = '<div class="field"><label>القاعة</label><select name="hallId"><option value="">بدون قاعة</option>' +
      App.Store.getAll('halls').map(function (h) {
        return '<option value="' + UI.escapeHtml(h.id) + '"' + (s.hallId === h.id ? ' selected' : '') + '>' + UI.escapeHtml(h.name) + '</option>';
      }).join('') + '</select><div class="field-hint" id="sh-availability">جارٍ فحص توفر القاعات…</div></div>';
    var modal = UI.openFormModal('تغيير قاعة الجلسة — ' + UI.fmtDateFull(s.date), fields, function (form, close, submitBtn) {
      var hallId = form.querySelector('[name="hallId"]').value || null;
      UI.setBtnLoading(submitBtn, true);
      window.TadreebDB.update('sessions', sessionId, { hallId: hallId }).then(function () {
        UI.setBtnLoading(submitBtn, false);
        close();
        UI.toast('تم تغيير قاعة الجلسة', 'success');
        App.refresh();
      }).catch(function (err) { UI.setBtnLoading(submitBtn, false); UI.toastError(err); });
    }, { submitLabel: 'حفظ', width: 'normal' });
    window.TadreebDB.checkHallAvailability(s.date, s.periodId).then(function (rows) {
      var availEl = modal.element.querySelector('#sh-availability');
      if (!availEl) return;
      var busy = rows.filter(function (r) { return !r.free && r.hallId !== s.hallId; });
      availEl.textContent = busy.length ?
        'مشغولة في هذا الموعد: ' + busy.map(function (r) { return r.hallName + ' (' + r.sessionCourse + ')'; }).join('، ') :
        'كل القاعات متاحة في هذا الموعد.';
      var sel = modal.element.querySelector('[name="hallId"]');
      sel.querySelectorAll('option[value]').forEach(function (opt) {
        if (!opt.value) return;
        var row = rows.find(function (r) { return r.hallId === opt.value; });
        opt.disabled = !!(row && !row.free && row.hallId !== s.hallId);
      });
    }).catch(function () {});
  }

  function openSessionNoteModal(sessionId) {
    var s = App.Store.get('sessions', sessionId);
    UI.openFormModal('ملاحظة الجلسة — ' + UI.fmtDateFull(s.date),
      '<div class="field"><label>ملاحظة</label><textarea name="note">' + UI.escapeHtml(s.note || '') + '</textarea></div>',
      function (form, close, submitBtn) {
        var note = form.querySelector('[name="note"]').value.trim();
        UI.setBtnLoading(submitBtn, true);
        window.TadreebDB.update('sessions', sessionId, { note: note }).then(function () {
          UI.setBtnLoading(submitBtn, false);
          close();
          UI.toast('تم حفظ الملاحظة', 'success');
          App.refresh();
        }).catch(function (err) { UI.setBtnLoading(submitBtn, false); UI.toastError(err); });
      }, { submitLabel: 'حفظ', width: 'normal' });
  }

  function openExpenseModal(course, expense) {
    var isEdit = !!expense;
    var cats = App.Store.getAll('budgetCategories');
    var fields = '<div class="form-grid">' +
      '<div class="field"><label>الفئة *</label><select name="category" required>' +
      cats.map(function (c) {
        return '<option value="' + UI.escapeHtml(c.name) + '"' + (expense && expense.category === c.name ? ' selected' : '') + '>' + UI.escapeHtml(c.name) + '</option>';
      }).join('') + '</select>' +
      '<div class="field-hint">لإضافة فئة جديدة، استخدم قسم الفئات في شاشة الدليل.</div></div>' +
      '<div class="field"><label>المبلغ (ل.س) *</label><input type="number" name="amount" min="0" required value="' +
      UI.escapeHtml(expense ? expense.amount : '') + '"></div>' +
      '<div class="field"><label>التاريخ *</label><input type="date" name="date" required value="' +
      UI.escapeHtml(expense ? expense.date : UI.todayStr()) + '"></div>' +
      '<div class="field field-full"><label>البيان *</label><input type="text" name="description" required value="' +
      UI.escapeHtml(expense ? expense.description : '') + '" placeholder="مثال: شراء أقلام ودفاتر"></div>' +
      '</div>';
    UI.openFormModal(isEdit ? 'تعديل المصروف' : 'إضافة مصروف', fields, function (form, close, submitBtn) {
      var category = form.querySelector('[name="category"]').value;
      var amount = parseInt(form.querySelector('[name="amount"]').value, 10);
      var date = form.querySelector('[name="date"]').value;
      var description = form.querySelector('[name="description"]').value.trim();
      if (!category) { UI.formError(form, 'اختر فئة المصروف'); return; }
      if (!amount || amount <= 0) { UI.formError(form, 'أدخل مبلغاً صحيحاً'); return; }
      if (!date) { UI.formError(form, 'اختر تاريخ المصروف'); return; }
      if (!description) { UI.formError(form, 'اكتب بيان المصروف'); return; }
      UI.formError(form, '');
      UI.setBtnLoading(submitBtn, true);
      var data = { courseId: course.id, category: category, amount: amount, date: date, description: description };
      var p = isEdit ? window.TadreebDB.update('expenses', expense.id, data) : window.TadreebDB.add('expenses', data);
      p.then(function () {
        UI.setBtnLoading(submitBtn, false);
        close();
        UI.toast(isEdit ? 'تم حفظ تعديلات المصروف' : 'تمت إضافة المصروف', 'success');
        App.refresh();
      }).catch(function (err) { UI.setBtnLoading(submitBtn, false); UI.formError(form, err.message); });
    }, { submitLabel: isEdit ? 'حفظ التعديلات' : 'إضافة المصروف' });
  }

  window.Screens.courses = { render: renderCourses };
  window.Screens['course-detail'] = { render: renderCourseDetail };
  window.CourseScreens = { openCourseForm: openCourseForm };
})();
