// تدريب — شاشتا الدورات وتفاصيل الدورة.
// تُسجَّل في window.Screens.courses و window.Screens['course-detail'].
(function () {
  'use strict';

  var currentFilter = 'all';
  var currentLevelFilter = 'all';

  // تسميات حالة الإنجاز المشتقة (مفاتيح App.courseProgress().status).
  var COMPLETION_FILTER_LABELS = { all: 'الكل', completed: 'مكتملة', 'in-progress': 'جارية', cancelled: 'ملغاة', paused: 'متوقفة' };

  function completionPill(status) {
    var cls = status === 'completed' ? 'pill-green' : status === 'cancelled' ? 'pill-red' :
      status === 'paused' ? 'pill-amber' : 'pill-navy';
    return '<span class="pill ' + cls + '">' + UI.escapeHtml(COMPLETION_FILTER_LABELS[status] || status || '') + '</span>';
  }

  // ================= قائمة الدورات =================
  function renderCourses(container) {
    var Store = App.Store;
    var canWrite = App.canWrite();
    var courses = Store.getAll('courses').slice();
    if (currentFilter !== 'all') {
      courses = courses.filter(function (c) { return App.courseProgress(c).status === currentFilter; });
    }
    // فلتر المستوى يطبَّق مع فلتر الإنجاز (AND)؛ الدورات القديمة بلا
    // مستوى تُعامل كمستوى «none» (بدون مستوى).
    if (currentLevelFilter !== 'all') {
      courses = courses.filter(function (c) { return (c.level || 'none') === currentLevelFilter; });
    }
    courses.sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
    });

    var html = '';
    html += '<div class="page-head"><div><h1>الدورات</h1>' +
      '<div class="muted">جميع الدورات التدريبية الحالية والسابقة</div></div>' +
      '<div class="head-actions"><button class="btn btn-outline btn-sm" type="button" id="courses-export-btn">تصدير إكسل ↓</button>';
    if (canWrite) html += '<button class="btn btn-outline btn-sm" type="button" id="courses-stats-btn">تصدير الإحصائيات ↓</button>' +
      '<button class="btn" type="button" id="new-course-btn">دورة جديدة</button>';
    html += '</div></div>';

    var chips = [['all', 'الكل'], ['completed', 'مكتملة'], ['in-progress', 'جارية'], ['cancelled', 'ملغاة'], ['paused', 'متوقفة']];
    html += '<div class="toolbar"><div class="chips">';
    chips.forEach(function (chip) {
      html += '<button class="chip' + (currentFilter === chip[0] ? ' active' : '') + '" type="button" data-filter="' +
        chip[0] + '">' + chip[1] + '</button>';
    });
    html += '</div><select class="input" id="courses-level-filter" aria-label="فلترة حسب المستوى">' +
      '<option value="all"' + (currentLevelFilter === 'all' ? ' selected' : '') + '>كل المستويات</option>' +
      levelFilterOptionsHtml() + '</select>';
    html += '</div>';

    html += '<div class="card">';
    if (!courses.length) {
      html += UI.emptyState('لا دورات هنا', currentFilter === 'all' ?
        'لم تُنشأ أي دورة بعد.' : 'لا دورات بهذه الحالة.',
        canWrite && currentFilter === 'all' ? 'دورة جديدة' : null, 'courses-empty-new');
    } else {
      html += '<div class="table-wrap"><table><thead><tr><th>الدورة</th><th>المدرب</th><th>القاعات</th><th>الأيام</th><th>الجلسات</th><th>الإنجاز</th><th>المتبقية</th><th>الحالة</th><th>المستوى</th><th>المتدربون</th><th>إجراءات</th></tr></thead><tbody>';
      courses.forEach(function (c) {
        var prog = App.courseProgress(c);
        var halls = App.hallsUsedByCourse(c.id);
        html += '<tr class="clickable" data-course-open="' + UI.escapeHtml(c.id) + '">' +
          '<td><strong>' + UI.escapeHtml(c.name) + '</strong> <span class="pill pill-grey">' + UI.escapeHtml(App.displayCode(c, 'courses')) + '</span></td>' +
          '<td>' + UI.escapeHtml(App.trainerName(c.trainerId) || 'بلا مدرب') + '</td>' +
          '<td>' + UI.escapeHtml(halls.length ? halls.join(' · ') : '—') + '</td>' +
          '<td>' + UI.escapeHtml(UI.daysLabel(c.days)) + '</td>' +
          '<td>' + prog.done + '/' + prog.sessionsTotal + '</td>' +
          '<td><div class="prog-row"><div class="progress"><i style="width:' + prog.pct + '%"></i></div><span class="muted">' + prog.pct + '%</span></div></td>' +
          '<td>' + prog.sessionsRemaining + '</td>' +
          '<td>' + completionPill(prog.status) + '</td>' +
          '<td>' + UI.escapeHtml(App.levelName(c.level)) + '</td>' +
          '<td>' + UI.fmtNumber(App.courseTrainees(c).length) + '</td>' +
          '<td><div class="row-actions">' +
          '<button class="link-btn" type="button" data-course-view="' + UI.escapeHtml(c.id) + '">عرض</button>';
        if (canWrite) {
          html += '<button class="link-btn" type="button" data-course-edit="' + UI.escapeHtml(c.id) + '">تعديل</button>' +
            '<button class="link-btn" type="button" data-course-rename="' + UI.escapeHtml(c.id) + '">إعادة تسمية</button>' +
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
    var levelFilterSel = document.getElementById('courses-level-filter');
    if (levelFilterSel) levelFilterSel.addEventListener('change', function () {
      currentLevelFilter = levelFilterSel.value;
      renderCourses(container);
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
    container.querySelectorAll('[data-course-rename]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var course = App.Store.get('courses', btn.getAttribute('data-course-rename'));
        if (course) openCourseRenameModal(course);
      });
    });
    container.querySelectorAll('[data-course-del]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var course = App.Store.get('courses', btn.getAttribute('data-course-del'));
        if (course) requestDeleteCourse(course);
      });
    });

    var statsBtn = document.getElementById('courses-stats-btn');
    if (statsBtn) {
      statsBtn.addEventListener('click', function () {
        UI.setBtnLoading(statsBtn, true, 'جارٍ تجهيز الإحصائيات…');
        App.buildCoursesStatsData().then(function (data) {
          UI.callExport('exportCoursesStats', [data]);
        }).catch(UI.toastError).finally(function () { UI.setBtnLoading(statsBtn, false); });
      });
    }

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
            { id: 'filtered', label: 'العرض الحالي (' + (COMPLETION_FILTER_LABELS[currentFilter] || 'الكل') + ')' },
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

  // إعادة تسمية سريعة: حقل واحد فقط (الاسم)، دون فتح نموذج التعديل الكامل.
  function openCourseRenameModal(course) {
    var fields = '<div class="field"><label>اسم الدورة</label>' +
      '<input type="text" name="name" required value="' + UI.escapeHtml(course.name || '') + '"></div>';
    UI.openFormModal('إعادة تسمية الدورة', fields, function (form, close, submitBtn) {
      var input = form.querySelector('[name="name"]');
      var name = input ? input.value.trim() : '';
      if (!name) { UI.formError(form, 'اسم الدورة مطلوب'); return; }
      if (name === course.name) { close(); return; }
      UI.formError(form, '');
      UI.setBtnLoading(submitBtn, true, 'جارٍ الحفظ…');
      window.TadreebDB.update('courses', course.id, { name: name }).then(function () {
        return window.TadreebDB.logAudit('course_rename', 'courses', course.id,
          'إعادة تسمية الدورة من «' + course.name + '» إلى «' + name + '»');
      }).then(function () {
        close();
        UI.toast('تمت إعادة تسمية الدورة', 'success');
        App.refresh();
      }).catch(function (err) {
        UI.setBtnLoading(submitBtn, false);
        UI.toastError(err);
      });
    });
  }

  // حذف الدورة مع قاعدة الحماية: أي حضور مسجل يمنع الحذف نهائياً.
  // المعاينة أولاً (رسالة منع أو تأكيد بما سيُحذف)، ثم الحذف نفسه
  // يعيد فحص الحماية على مستوى طبقة البيانات قبل أي كتابة.
  function requestDeleteCourse(course) {
    window.TadreebDB.courseDeletePreview(course.id).then(function (preview) {
      if (preview.withAttendance > 0) {
        UI.openModal({
          title: 'لا يمكن حذف هذه الدورة',
          bodyHTML: '<p>' + UI.escapeHtml('لا يمكن حذف هذه الدورة — تحتوي ' + preview.withAttendance +
            ' جلسة على سجلات حضور. يمكنك إيقاف الدورة أو إلغاؤها بدلاً من ذلك.') + '</p>',
          actions: [
            {
              label: 'تعديل الدورة',
              onClick: function (close) { close(); openCourseForm(course); }
            },
            { label: 'إغلاق', className: 'btn-outline', closeOnClick: true }
          ]
        });
        return;
      }
      UI.confirmDialog('حذف الدورة',
        'سيتم حذف الدورة «' + course.name + '» و ' + preview.sessions + ' جلسة و ' + preview.expenses +
        ' مصروف. لا يمكن التراجع.',
        function () {
          // حذف الدورة إجراء مدمّر — يتطلب تأكيد هوية المدير
          // (المعاينة → التأكيد → إعادة المصادقة → الحذف).
          UI.requireReauth(function () {
            window.TadreebDB.deleteCourse(course.id).then(function () {
              UI.toast('تم حذف الدورة', 'success');
              App.refresh();
            }).catch(UI.toastError);
          });
        });
    }).catch(UI.toastError);
  }

  // ================= نموذج الدورة (إنشاء / تعديل) =================
  function trainerOptionsHtml(selectedId) {
    var html = '<option value="">بدون مدرب حالياً</option>';
    App.Store.getAll('trainers').forEach(function (t) {
      html += '<option value="' + UI.escapeHtml(t.id) + '"' +
        (t.id === selectedId ? ' selected' : '') + '>' + UI.escapeHtml(App.displayCode(t, 'trainers') + ' — ' + t.name) + '</option>';
    });
    html += '<option value="__new__">إضافة مدرب جديد…</option>';
    return html;
  }

  function periodOptionsHtml(selectedId) {
    var periods = App.Store.getAll('periods').slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var html = '<option value="">اختر الفترة</option>';
    periods.forEach(function (p) {
      html += '<option value="' + UI.escapeHtml(p.id) + '"' + (p.id === selectedId ? ' selected' : '') + '>' +
        UI.escapeHtml(App.displayCode(p, 'periods') + ' — ' + p.label) + ' (' + UI.escapeHtml(p.start) + ' - ' + UI.escapeHtml(p.end) + ')</option>';
    });
    return html;
  }

  // خيارات المجموعة: «المعرّف — الاسم — المديرية»؛ آمنة مع قائمة مجموعات فارغة.
  function groupOptionsHtml(selectedId) {
    var groups = App.Store.getAll('groups').slice().sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
    });
    var html = '<option value="">بدون مجموعة</option>';
    groups.forEach(function (g) {
      var dn = App.directorateName(g.directorateId);
      html += '<option value="' + UI.escapeHtml(g.id) + '"' + (g.id === selectedId ? ' selected' : '') + '>' +
        UI.escapeHtml(App.displayCode(g, 'groups') + ' — ' + g.name + (dn ? ' — ' + dn : '')) + '</option>';
    });
    return html;
  }

  // خيارات المديرية المعيّنة (حقل منفرد، غير خانات المديريات المتعددة).
  function assignedDirectorateOptionsHtml(selectedId) {
    var dirs = App.Store.getAll('directorates').slice().sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
    });
    var html = '<option value="">بدون مديرية معيّنة</option>';
    dirs.forEach(function (d) {
      html += '<option value="' + UI.escapeHtml(d.id) + '"' + (d.id === selectedId ? ' selected' : '') + '>' +
        UI.escapeHtml(App.displayCode(d, 'directorates') + ' — ' + d.name) + '</option>';
    });
    return html;
  }

  // خيارات المستوى: الافتراضية أولاً (بترتيب ثابت من App.LEVEL_LABELS)،
  // ثم المخصصة من المتجر مرتبة بالاسم. تُقرأ من المتجر الحي عند كل
  // فتح للنموذج، فتبقى محدَّثة دون إعادة تحميل.
  function levelOptionsHtml(selectedLevel) {
    var sel = selectedLevel || 'none';
    var html = '';
    Object.keys(App.LEVEL_LABELS).forEach(function (key) {
      html += '<option value="' + key + '"' + (key === sel ? ' selected' : '') + '>' +
        UI.escapeHtml(App.LEVEL_LABELS[key]) + '</option>';
    });
    App.Store.getAll('levels').slice().sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
    }).forEach(function (l) {
      html += '<option value="' + UI.escapeHtml(l.id) + '"' + (l.id === sel ? ' selected' : '') + '>' +
        UI.escapeHtml(l.name) + '</option>';
    });
    return html;
  }

  // خيارات فلتر المستوى في قائمة الدورات (بلا خيار «كل المستويات» —
  // يُبنى في renderCourses)؛ المحدد هو currentLevelFilter الحالي.
  function levelFilterOptionsHtml() {
    var html = '';
    Object.keys(App.LEVEL_LABELS).forEach(function (key) {
      html += '<option value="' + key + '"' + (currentLevelFilter === key ? ' selected' : '') + '>' +
        UI.escapeHtml(App.LEVEL_LABELS[key]) + '</option>';
    });
    App.Store.getAll('levels').slice().sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
    }).forEach(function (l) {
      html += '<option value="' + UI.escapeHtml(l.id) + '"' + (currentLevelFilter === l.id ? ' selected' : '') + '>' +
        UI.escapeHtml(l.name) + '</option>';
    });
    return html;
  }

  // خيارات قاعة اليوم في الخطة الأسبوعية: «تلقائي» (قيمة فارغة) أولاً.
  function hallOptionsHtml(selectedId) {
    var halls = App.Store.getAll('halls').slice().sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
    });
    var html = '<option value="">تلقائي (أول قاعة حرة)</option>';
    halls.forEach(function (h) {
      html += '<option value="' + UI.escapeHtml(h.id) + '"' + (h.id === selectedId ? ' selected' : '') + '>' +
        UI.escapeHtml(h.name) + '</option>';
    });
    return html;
  }

  // عرض الخطة الأسبوعية في تفاصيل الدورة (مربع وصفي إضافي).
  // الدورات القديمة بلا dayPlan تُرجع '' فلا يظهر شيء إضافي.
  function dayPlanMetaHtml(course) {
    if (!course || !course.dayPlan) return '';
    var days = (course.days || []).slice().sort(function (a, b) { return a - b; });
    var parts = [];
    days.forEach(function (d) {
      var e = course.dayPlan[d];
      if (!e) return;
      var p = e.periodId ? App.Store.get('periods', e.periodId) : null;
      var h = e.hallId ? App.hallName(e.hallId) : '';
      parts.push(UI.escapeHtml(UI.WEEKDAYS[d]) + ': ' +
        UI.escapeHtml(p ? p.label : '—') + ' — ' + UI.escapeHtml(h || 'تلقائي'));
    });
    if (!parts.length) return '';
    return '<div class="meta-box"><div class="k">الخطة الأسبوعية</div><div class="v">' +
      parts.join(' · ') + '</div></div>';
  }

  // تسمية مجموعة الدورة: «الاسم — المديرية»، أو '' عند غياب المجموعة.
  function courseGroupLabel(course) {
    if (!course || !course.groupId) return '';
    var g = App.Store.get('groups', course.groupId);
    if (!g) return '';
    var dn = App.directorateName(g.directorateId);
    return g.name + (dn ? ' — ' + dn : '');
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
        ' <span class="muted">(' + UI.escapeHtml(App.displayCode(t, 'trainees')) + ' · ' + UI.escapeHtml(App.directorateName(t.directorateId) || 'بلا مديرية') + ')</span></label>';
    }).join('');

    var dirRows = directorates.map(function (d) {
      return '<label class="check-row"><input type="checkbox" data-dir-id="' + UI.escapeHtml(d.id) + '"' +
        (selectedDirectorates.has(d.id) ? ' checked' : '') + '> ' + UI.escapeHtml(App.displayCode(d, 'directorates') + ' — ' + d.name) + '</label>';
    }).join('');

    var dayBoxes = UI.WEEKDAYS.map(function (name, i) {
      return '<label class="day-chip' + (selectedDays.has(i) ? ' checked' : '') + '"><input type="checkbox" data-day="' +
        i + '"' + (selectedDays.has(i) ? ' checked' : '') + '> ' + name + '</label>';
    }).join('');

    var fields = '<div class="form-grid">' +
      '<div class="field field-full"><label>اسم الدورة *</label>' +
      '<input type="text" name="name" required value="' + UI.escapeHtml(course ? course.name : '') + '" placeholder="مثال: دورة إكسل"></div>' +
      '<div class="field"><label>المعرّف *</label>' +
      '<input type="text" name="code" required value="' + UI.escapeHtml(course ? (course.code || App.displayCode(course, 'courses')) : App.nextCode('courses')) + '"></div>' +
      '<div class="field"><label>المدرب</label><select name="trainerId">' + trainerOptionsHtml(course ? course.trainerId : null) + '</select>' +
      '<div class="field-hint">يمكن إنشاء الدورة بدون مدرب والتعاقد معه لاحقاً.</div></div>' +
      '<div class="field"><label>المجموعة</label><select name="groupId">' + groupOptionsHtml(course ? course.groupId : null) + '</select></div>' +
      '<div class="field"><label>المديرية المعيّنة</label><select name="directorateId">' + assignedDirectorateOptionsHtml(course ? course.directorateId : null) + '</select>' +
      '<div class="field-hint">تُملأ تلقائياً عند اختيار مجموعة، ويمكن تغييرها يدوياً.</div></div>' +
      '<div class="field"><label>المستوى</label><select name="level">' + levelOptionsHtml(course ? course.level : 'none') + '</select>' +
      '<div class="field-hint">المستويات المخصصة تُدار من إعدادات المنصة.</div></div>' +
      '<div class="field"><label>الفترة التدريبية *</label><select name="periodId" required>' + periodOptionsHtml(course ? course.periodId : null) + '</select></div>' +
      '<div class="field"><label>عدد الجلسات *</label><input type="number" name="sessionCount" min="1" max="200" required value="' +
      UI.escapeHtml(course ? course.sessionCount : 20) + '"></div>' +
      '<div class="field"><label>تاريخ بدء الدورة</label><input type="date" name="startDate" value="' +
      UI.escapeHtml(isEdit ? (course.startDate || '') : UI.todayStr()) + '"></div>' +
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
      '<div class="field field-full"><label>الخطة الأسبوعية</label><div id="cf-dayplan"></div>' +
      '<div class="field-hint">فترة وقاعة مستقلتان لكل يوم؛ «تلقائي» يعني أول قاعة حرة في ذلك اليوم. تغيير الفترة الرئيسية يعيد ضبط خطة كل الأيام.' +
      (isEdit ? ' تُطبَّق الخطة على الجلسات الجديدة عند إعادة توليد الجدول — الجلسات الحالية لا تتغير.' : '') + '</div></div>' +
      '<div class="field field-full"><label>المديريات</label>' +
      (dirRows ? '<div class="check-list">' + dirRows + '</div>' : '<div class="muted">لا مديريات مسجلة — أضف مديرية من الدليل أولاً.</div>') + '</div>' +
      '<div class="field field-full"><label>المتدربون</label>' +
      '<div class="field-hint" id="cf-group-trainee-hint" hidden></div>' +
      '<input type="text" class="check-list-search" id="cf-trainee-search" placeholder="ابحث بالاسم…">' +
      (traineeRows ? '<div class="check-list" id="cf-trainee-list">' + traineeRows + '</div>' :
        '<div class="muted">لا متدربين مسجلين — أضف متدرباً جديداً أدناه.</div>') +
      '<div class="inline-add"><h3>إضافة متدرب جديد</h3><div class="form-grid">' +
      '<div class="field"><label>الاسم</label><input type="text" name="newTraineeName" placeholder="اسم المتدرب"></div>' +
      '<div class="field"><label>المديرية</label><select name="newTraineeDirectorate"><option value="">اختر المديرية</option>' +
      directorates.map(function (d) { return '<option value="' + UI.escapeHtml(d.id) + '">' + UI.escapeHtml(App.displayCode(d, 'directorates') + ' — ' + d.name) + '</option>'; }).join('') + '</select></div>' +
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
    // اختيار مجموعة يملأ المديرية المعيّنة تلقائياً (دون قفل الحقل)،
    // ويعطّل قائمة متدربي الدورة — فأعضاء المجموعة هم من يُستخدمون
    // في التفقد والتصدير. قائمة الدورة المخزنة لا تُمسح أبداً (تبقى
    // احتياطاً إن فُرغت المجموعة أو حُذفت).
    var groupSelect = card.querySelector('select[name="groupId"]');
    var assignedDirSelect = card.querySelector('select[name="directorateId"]');
    if (groupSelect && assignedDirSelect) {
      var cfTraineeList = card.querySelector('#cf-trainee-list');
      var cfTraineeSearch = card.querySelector('#cf-trainee-search');
      var cfGroupHint = card.querySelector('#cf-group-trainee-hint');
      var syncGroupTrainees = function () {
        var g = groupSelect.value ? App.Store.get('groups', groupSelect.value) : null;
        var grouped = !!g;
        if (cfTraineeList) {
          cfTraineeList.querySelectorAll('input[type="checkbox"]').forEach(function (cb) { cb.disabled = grouped; });
          cfTraineeList.style.opacity = grouped ? '0.5' : '';
        }
        if (cfTraineeSearch) cfTraineeSearch.disabled = grouped;
        if (cfGroupHint) {
          if (grouped) {
            var n = (g.traineeIds || []).length;
            cfGroupHint.textContent = 'هذه الدورة معيّنة لمجموعة — سيُستخدم أعضاء المجموعة في التفقد والتصدير' +
              (n ? ' (' + n + ' عضواً)' : '');
            cfGroupHint.hidden = false;
          } else {
            cfGroupHint.hidden = true;
          }
        }
      };
      groupSelect.addEventListener('change', function () {
        var g = groupSelect.value ? App.Store.get('groups', groupSelect.value) : null;
        if (g && g.directorateId) assignedDirSelect.value = g.directorateId;
        syncGroupTrainees();
      });
      syncGroupTrainees();
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

    // الخطة الأسبوعية: فترة وقاعة لكل يوم مختار (v1.1).
    // dayPlanState يحفظ تعديلات المستخدم أثناء إعادة الرسم؛ تغيير
    // الفترة الرئيسية يعيد ضبط فترة كل الأيام إلى قيمتها الجديدة.
    var dayPlanState = {};
    if (course && course.dayPlan) {
      Object.keys(course.dayPlan).forEach(function (k) {
        var e = course.dayPlan[k];
        if (e) dayPlanState[k] = { periodId: e.periodId || '', hallId: e.hallId || null };
      });
    }
    var dayPlanEl = card.querySelector('#cf-dayplan');
    var mainPeriodSel = card.querySelector('select[name="periodId"]');
    function dayPlanDays() {
      var out = [];
      card.querySelectorAll('[data-day]:checked').forEach(function (cb) {
        out.push(parseInt(cb.getAttribute('data-day'), 10));
      });
      return out.sort(function (a, b) { return a - b; });
    }
    function renderDayPlan() {
      if (!dayPlanEl) return;
      var days = dayPlanDays();
      if (!days.length) {
        dayPlanEl.innerHTML = '<div class="muted">اختر يوماً واحداً على الأقل لتعيين خطته.</div>';
        return;
      }
      var html = '';
      days.forEach(function (d) {
        var cur = dayPlanState[d] || { periodId: mainPeriodSel ? mainPeriodSel.value : '', hallId: null };
        html += '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">' +
          '<span style="min-width:64px;font-weight:600">' + UI.escapeHtml(UI.WEEKDAYS[d]) + '</span>' +
          '<select class="input" data-dayplan-period="' + d + '" style="flex:1;width:auto;min-width:0">' +
          periodOptionsHtml(cur.periodId || (mainPeriodSel ? mainPeriodSel.value : null)) + '</select>' +
          '<select class="input" data-dayplan-hall="' + d + '" style="flex:1;width:auto;min-width:0">' +
          hallOptionsHtml(cur.hallId) + '</select></div>';
      });
      dayPlanEl.innerHTML = html;
    }
    if (dayPlanEl) {
      dayPlanEl.addEventListener('change', function (e) {
        var t = e.target;
        var d = t.getAttribute('data-dayplan-period');
        var isPeriod = d != null;
        if (!isPeriod) d = t.getAttribute('data-dayplan-hall');
        if (d == null) return;
        if (!dayPlanState[d]) {
          dayPlanState[d] = { periodId: mainPeriodSel ? mainPeriodSel.value : '', hallId: null };
        }
        if (isPeriod) dayPlanState[d].periodId = t.value;
        else dayPlanState[d].hallId = t.value || null;
      });
    }
    card.querySelectorAll('.day-chip input').forEach(function (cb) {
      cb.addEventListener('change', renderDayPlan);
    });
    if (mainPeriodSel) {
      mainPeriodSel.addEventListener('change', function () {
        Object.keys(dayPlanState).forEach(function (k) { dayPlanState[k].periodId = mainPeriodSel.value; });
        renderDayPlan();
      });
    }
    renderDayPlan();
  }

  function submitCourseForm(form, close, submitBtn, course, isEdit) {
    var name = form.querySelector('[name="name"]').value.trim();
    var code = form.querySelector('[name="code"]').value.trim();
    var periodId = form.querySelector('[name="periodId"]').value;
    var sessionCount = parseInt(form.querySelector('[name="sessionCount"]').value, 10);
    var budget = parseInt(form.querySelector('[name="budget"]').value, 10) || 0;
    var startDateRaw = form.querySelector('[name="startDate"]').value;
    // عند الإنشاء: اليوم افتراضياً. عند التعديل: حقل فارغ يعني «أبقِ التاريخ
    // الحالي» — الدورات القديمة بلا startDate لا تُعاد جدولتها لمجرد فتح التعديل.
    var startDate = startDateRaw || (isEdit ? (course.startDate || '') : UI.todayStr());
    var trainerSel = form.querySelector('[name="trainerId"]').value;
    var groupId = form.querySelector('[name="groupId"]').value || null;
    var directorateId = form.querySelector('[name="directorateId"]').value || null;
    var level = form.querySelector('[name="level"]').value || 'none';

    var days = [];
    form.querySelectorAll('[data-day]:checked').forEach(function (cb) { days.push(parseInt(cb.getAttribute('data-day'), 10)); });
    var traineeIds = [];
    form.querySelectorAll('[data-trainee-id]:checked').forEach(function (cb) { traineeIds.push(cb.getAttribute('data-trainee-id')); });
    var directorateIds = [];
    form.querySelectorAll('[data-dir-id]:checked').forEach(function (cb) { directorateIds.push(cb.getAttribute('data-dir-id')); });

    // الخطة الأسبوعية (v1.1): فترة وقاعة لكل يوم؛ القاعة الفارغة تعني
    // «تلقائي» (أول قاعة حرة)، والفترة الفارغة تعني الفترة الرئيسية.
    // تُسجَّل دائماً (حتى الافتراضيات) ليكون التوليد صريحاً.
    var dayPlan = {};
    form.querySelectorAll('[data-dayplan-period]').forEach(function (sel) {
      var d = sel.getAttribute('data-dayplan-period');
      var hallSel = form.querySelector('[data-dayplan-hall="' + d + '"]');
      dayPlan[d] = {
        periodId: sel.value || periodId,
        hallId: hallSel && hallSel.value ? hallSel.value : null
      };
    });

    if (!name) { UI.formError(form, 'اسم الدورة مطلوب'); return; }
    if (!code) { UI.formError(form, 'المعرّف مطلوب'); return; }
    if (!App.isCodeUnique('courses', code, isEdit ? course.id : null)) {
      UI.formError(form, 'هذا المعرّف مستخدم من قبل — اختر معرّفاً آخر');
      return;
    }
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
          code: App.nextCode('trainers'),
          specialty: form.querySelector('[name="newTrainerSpecialty"]').value.trim(),
          phone: form.querySelector('[name="newTrainerPhone"]').value.trim()
        }).then(function (id) { ctx.trainerId = id; return ctx; });
      });
    }
    if (newTraineeName) {
      chain = chain.then(function (ctx) {
        return window.TadreebDB.add('trainees', {
          name: newTraineeName,
          code: App.nextCode('trainees'),
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
        code: code,
        level: level,
        trainerId: ctx.trainerId,
        groupId: groupId,
        directorateId: directorateId,
        traineeIds: traineeIds,
        directorateIds: directorateIds,
        days: days,
        dayPlan: dayPlan,
        periodId: periodId,
        sessionCount: sessionCount,
        budget: budget,
        startDate: startDate || null
      };
      if (isEdit) {
        data.status = form.querySelector('[name="status"]').value;
        var oldStartDate = course.startDate || '';
        if (startDate !== oldStartDate) {
          // تاريخ بدء جديد: تُحفظ كل التعديلات (ومنها التاريخ الجديد)
          // أولاً، ثم تُعرض نافذة تأكيد إعادة التوليد — والإلغاء يعيد
          // تاريخ البدء القديم فقط، وتبقى باقي التعديلات محفوظة.
          return window.TadreebDB.update('courses', course.id, data).then(function () {
            return window.TadreebDB.rescheduleCoursePreview(course.id, startDate);
          }).then(function (preview) {
            UI.setBtnLoading(submitBtn, false);
            openRescheduleConfirm(course, startDate, oldStartDate, preview, close);
            return { courseId: course.id, reschedulePending: true };
          }).catch(function (err) {
            // فشل الحفظ أو المعاينة: إعادة تاريخ البدء القديم ثم إظهار الخطأ.
            return window.TadreebDB.update('courses', course.id, { startDate: oldStartDate || null }).then(function () {
              throw err;
            }, function () { throw err; });
          });
        }
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
      if (res.reschedulePending) return; // نافذة التأكيد تتولى الباقي
      if (res.edited) {
        UI.setBtnLoading(submitBtn, false);
        close();
        UI.toast('تم حفظ تعديلات الدورة', 'success');
        return App.refresh();
      }
      // توليد الجدول للدورة الجديدة
      var weeks = parseInt(form.querySelector('[name="weeks"]').value, 10) || 2;
      return window.TadreebDB.generateSchedule(res.courseId, weeks, startDate).then(function (result) {
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

  // نافذة تأكيد تغيير تاريخ بدء الدورة. تُبنى عبر UI.openModal (وليس
  // UI.confirmDialog) لأن زر الإلغاء يحتاج إجراءً — إعادة تاريخ البدء
  // القديم — وconfirmDialog لا يقبل ردّاً عند الإلغاء. الشكل والزرّان
  // مطابقان لنافذة التأكيد المعتادة. الإغلاق بلا اختيار (✕ أو Escape أو
  // النقر خارج النافذة) يُعامل كإلغاء عبر onClose، فلا يبقى التاريخ الجديد
  // محفوظاً بلا إعادة توليد.
  function openRescheduleConfirm(course, newStartDate, oldStartDate, preview, closeForm) {
    var settled = false;
    UI.openModal({
      title: 'تغيير تاريخ بدء الدورة',
      bodyHTML: '<p>سيتم تغيير تاريخ بدء الدورة إلى ' + UI.escapeHtml(UI.fmtDate(newStartDate)) +
        '. سيتم الاحتفاظ بـ ' + preview.kept + ' جلسة (لها حضور أو ملاحظات أو مكتملة) في مواعيدها، وحذف ' +
        preview.removed + ' جلسة مجدولة وإعادة توليدها من التاريخ الجديد. هل أنت متأكد؟</p>',
      actions: [
        {
          label: 'تأكيد',
          className: 'btn-danger-solid',
          onClick: function (close) {
            settled = true;
            close();
            closeForm();
            UI.toast('جارٍ إعادة توليد الجدول…');
            window.TadreebDB.rescheduleCourse(course.id, newStartDate).then(function (result) {
              UI.toast('تم تغيير تاريخ بدء الدورة وإعادة توليد ' + result.created + ' جلسة', 'success');
              App.refresh();
            }).catch(UI.toastError);
          }
        },
        {
          label: 'إلغاء',
          className: 'btn-outline',
          onClick: function (close) {
            settled = true;
            close();
            closeForm();
            window.TadreebDB.update('courses', course.id, { startDate: oldStartDate || null }).then(function () {
              UI.toast('تم إلغاء تغيير تاريخ البدء', 'success');
              App.refresh();
            }).catch(UI.toastError);
          }
        }
      ],
      onClose: function () {
        if (settled) return;
        closeForm();
        window.TadreebDB.update('courses', course.id, { startDate: oldStartDate || null }).then(function () {
          UI.toast('تم إلغاء تغيير تاريخ البدء', 'success');
          App.refresh();
        }).catch(UI.toastError);
      }
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
    // المديرية المعيّنة أولاً (بخط عريض)، ثم المديريات الإضافية؛ الدورات القديمة بلا مديرية معيّنة تُعرض كما قبل.
    var assignedDirName = course.directorateId ? App.directorateName(course.directorateId) : '';
    var extraDirNames = (course.directorateIds || []).filter(function (id) { return id !== course.directorateId; })
      .map(App.directorateName).filter(Boolean);
    var dirsHtml = '';
    if (assignedDirName) dirsHtml += '<strong>' + UI.escapeHtml(assignedDirName) + '</strong>';
    if (extraDirNames.length) {
      if (dirsHtml) dirsHtml += ' · ';
      dirsHtml += UI.escapeHtml(extraDirNames.join(' · '));
    }
    if (!dirsHtml) dirsHtml = '—';
    // تاريخ البدء: الحقل الجديد، وإلا تاريخ أول جلسة (الجلسات مرتبة
    // حسب التاريخ)، وإلا «—» — الدورات القديمة بلا حقل startDate.
    var startLabel = course.startDate ? UI.fmtDate(course.startDate) : '';
    if (!startLabel && sessions.length) startLabel = UI.fmtDate(sessions[0].date);
    if (!startLabel) startLabel = '—';
    html += '<div class="meta-grid">' +
      '<div class="meta-box"><div class="k">المعرّف</div><div class="v">' +
      UI.escapeHtml(App.displayCode(course, 'courses')) + '</div></div>' +
      '<div class="meta-box"><div class="k">المستوى</div><div class="v">' +
      UI.escapeHtml(App.levelName(course.level)) + '</div></div>' +
      '<div class="meta-box"><div class="k">المدرب</div><div class="v">' +
      UI.escapeHtml(trainer ? trainer.name : 'بدون مدرب حالياً') + '</div>' +
      (contractHtml ? '<div class="muted" style="font-size:12px;line-height:1.6">' + contractHtml + '</div>' : '') +
      (canWrite ? '<div style="margin-top:8px"><button class="link-btn" type="button" id="cd-contract-btn">' +
        (trainer ? 'تغيير المدرب / العقد' : 'تعاقد مع مدرب') + '</button></div>' : '') + '</div>' +
      '<div class="meta-box"><div class="k">المجموعة</div><div class="v">' +
      UI.escapeHtml(courseGroupLabel(course) || 'بلا مجموعة') + '</div></div>' +
      '<div class="meta-box"><div class="k">تاريخ البدء</div><div class="v">' +
      UI.escapeHtml(startLabel) + '</div></div>' +
      '<div class="meta-box"><div class="k">الفترة</div><div class="v">' + UI.escapeHtml(period ? period.label : '—') + '</div></div>' +
      '<div class="meta-box"><div class="k">الأيام</div><div class="v">' + UI.escapeHtml(UI.daysLabel(course.days)) + '</div></div>' +
      '<div class="meta-box"><div class="k">الوقت</div><div class="v">' + (period ? UI.fmtTimeRange(period.start, period.end) : '—') + '</div></div>' +
      '<div class="meta-box"><div class="k">المديريات</div><div class="v">' + dirsHtml + '</div></div>' +
      dayPlanMetaHtml(course) +
      '</div>';

    // التقدم
    html += '<div class="card"><div class="section-title-row"><strong>التقدم في الدورة</strong>' +
      '<span class="muted">' + prog.done + ' جلسات مكتملة من ' + prog.total + ' · المتبقي ' + prog.remaining + ' جلسة</span></div>' +
      '<div class="progress"><i style="width:' + prog.percent + '%"></i></div></div>';

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
          '" data-session-row="' + UI.escapeHtml(s.id) + '"><td><strong>' + UI.escapeHtml(App.sessionLabel(s, course)) + '</strong></td>' +
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

    // المتدربون — مصدر القائمة: أعضاء المجموعة إن كانت الدورة معيّنة
    // لمجموعة لها أعضاء، وإلا قائمة الدورة نفسها (انظر App.courseTrainees).
    var detailGroup = course.groupId ? Store.get('groups', course.groupId) : null;
    var detailGrouped = detailGroup && (detailGroup.traineeIds || []).length > 0;
    var traineesSource = detailGrouped
      ? 'المتدربون: أعضاء المجموعة «' + detailGroup.name + '» (' + trainees.length + ')'
      : 'المتدربون: قائمة الدورة (' + trainees.length + ')';
    html += '<div class="card"><h2>المتدربون (' + trainees.length + ')</h2>' +
      '<div class="muted" style="margin-bottom:10px">' + UI.escapeHtml(traineesSource) + '</div>';
    if (!trainees.length) {
      html += '<div class="muted">' + (course.groupId ?
        'لا متدربين في هذه الدورة بعد — أضف أعضاء إلى المجموعة من الدليل.' :
        'لا متدربين في هذه الدورة بعد — أضفهم من تعديل الدورة.') + '</div>';
    } else {
      html += '<div class="table-wrap"><table><thead><tr><th>المتدرب</th><th>المديرية</th><th>رقم الهاتف</th><th>الحالة</th><th>ملاحظات</th>' +
        (canWrite ? '<th>إجراءات</th>' : '') + '</tr></thead><tbody>';
      trainees.forEach(function (t) {
        html += '<tr><td>' + UI.escapeHtml(t.name) + '</td>' +
          '<td>' + UI.escapeHtml(App.directorateName(t.directorateId) || '—') + '</td>' +
          '<td><span class="ltr">' + UI.escapeHtml(t.phone || '—') + '</span></td>' +
          '<td>' + (canWrite ?
            '<select class="input" data-trainee-status="' + UI.escapeHtml(t.id) + '">' +
            '<option value="">بلا حالة</option>' +
            Object.keys(UI.TRAINEE_STATUS_LABELS).map(function (k) {
              return '<option value="' + k + '"' + (t.status === k ? ' selected' : '') + '>' + UI.TRAINEE_STATUS_LABELS[k] + '</option>';
            }).join('') + '</select>' : UI.pillForTraineeStatus(t.status)) + '</td>' +
          '<td>' + UI.escapeHtml(t.notes || '') + '</td>';
        if (canWrite) {
          // الدورة المجمّعة: أعضاؤها يُدارون من المجموعة، لا من هنا.
          html += '<td><div class="row-actions">' +
            '<button class="link-btn" type="button" data-trainee-notes="' + UI.escapeHtml(t.id) + '">ملاحظات</button>' +
            (detailGrouped ? '' :
              '<button class="link-btn danger" type="button" data-trainee-remove="' + UI.escapeHtml(t.id) + '">إزالة من الدورة</button>') +
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
      '<div class="meta-grid">' +
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
      '<div style="margin-top:14px"><div class="section-title-row"><span>تم صرف ' + spentPct + '% من الميزانية</span>' +
      '<span class="muted">المتبقي: ' + UI.fmtMoney(budget.remaining) + '</span></div>' +
      '<div class="progress"><i style="width:' + spentPct + '%"></i></div></div>';

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
        if (window.SessionScreen && typeof window.SessionScreen.openActionSheet === 'function') {
          window.SessionScreen.openActionSheet(id, {
            onCheck: function (sid) {
              detailState.selectedSessionId = sid;
              App.renderScreen('course-detail', { courseId: courseId });
              setTimeout(function () {
                var card = document.getElementById('cd-attendance-card');
                if (card) card.scrollIntoView();
              }, 100);
            }
          });
        } else {
          detailState.selectedSessionId = id;
          App.renderScreen('course-detail', { courseId: courseId });
        }
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
      UI.openPicker({
        title: 'تصدير الحضور والغياب',
        scopeOptions: [
          { id: 'one', label: 'جلسة واحدة (الجلسة المحددة)' },
          { id: 'selected', label: 'جلسات محددة' },
          { id: 'all', label: 'كل جلسات الدورة' }
        ],
        onConfirm: function (result) {
          var scope = result && result.scope;
          if (scope === 'one') {
            if (!selectedSession) {
              UI.toast('لا توجد جلسة محددة للتصدير', 'error');
              return;
            }
            runAttendanceReport([selectedSession.id]);
          } else if (scope === 'all') {
            runAttendanceReport(App.sessionsForCourse(courseId).map(function (s) { return s.id; }));
          } else if (scope === 'selected') {
            openSessionPicker();
          }
        }
      });

      function runAttendanceReport(sessionIds) {
        UI.toast('جارٍ تجهيز التقرير…');
        App.buildAttendanceReportData(courseId, sessionIds).then(function (data) {
          UI.callExport('exportAttendanceReport', [data]);
        }).catch(UI.toastError);
      }

      function openSessionPicker() {
        var allSessions = App.sessionsForCourse(courseId);
        var fields = allSessions.map(function (s) {
          var checked = selectedSession && s.id === selectedSession.id ? ' checked' : '';
          var label = UI.escapeHtml(UI.fmtDateFull(s.date)) + ' · ' +
            UI.escapeHtml(App.periodLabel(s.periodId)) + ' · ' +
            UI.escapeHtml(UI.SESSION_STATE_LABELS[s.state] || s.state || '');
          return '<label class="tadreeb-export-check"><input type="checkbox" name="session" value="' +
            UI.escapeHtml(s.id) + '"' + checked + '> ' + label + '</label>';
        }).join('');
        if (!allSessions.length) fields = '<div class="muted">لا توجد جلسات في هذه الدورة بعد.</div>';
        UI.openFormModal('اختر الجلسات', fields, function (form, close) {
          var picked = Array.prototype.slice.call(form.querySelectorAll('input[name="session"]:checked'))
            .map(function (el) { return el.value; });
          if (!picked.length) {
            UI.formError(form, 'اختر جلسة واحدة على الأقل');
            return;
          }
          close();
          runAttendanceReport(picked);
        }, { submitLabel: 'تصدير' });
      }
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
          code: App.nextCode('trainers'),
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
          UI.escapeHtml(App.displayCode(p, 'periods') + ' — ' + p.label) + ' (' + UI.escapeHtml(p.start) + ' - ' + UI.escapeHtml(p.end) + ')</option>';
      }).join('') + '</select></div>' +
      '<div class="field field-full"><label>القاعة</label><select name="hallId"><option value="">بدون قاعة (تُعيَّن لاحقاً)</option>' +
      App.Store.getAll('halls').map(function (h) {
        return '<option value="' + UI.escapeHtml(h.id) + '">' + UI.escapeHtml(App.displayCode(h, 'halls') + ' — ' + h.name) + '</option>';
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
        return '<option value="' + UI.escapeHtml(h.id) + '"' + (s.hallId === h.id ? ' selected' : '') + '>' + UI.escapeHtml(App.displayCode(h, 'halls') + ' — ' + h.name) + '</option>';
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
        return '<option value="' + UI.escapeHtml(c.name) + '"' + (expense && expense.category === c.name ? ' selected' : '') + '>' + UI.escapeHtml(App.displayCode(c, 'budgetCategories') + ' — ' + c.name) + '</option>';
      }).join('') + '</select>' +
      '<div class="field-hint">لإضافة فئة جديدة، استخدم قسم فئات الميزانية في إعدادات المنصة.</div></div>' +
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
