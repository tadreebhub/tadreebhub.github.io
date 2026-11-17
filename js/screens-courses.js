// تدريب — شاشتا الدورات وتفاصيل الدورة.
// تُسجَّل في window.Screens.courses و window.Screens['course-detail'].
(function () {
  'use strict';

  var currentFilter = 'all';
  var currentLevelFilter = 'all';
  var currentSearch = '';

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
      '<button class="btn btn-outline btn-sm" type="button" id="courses-attendance-stats-btn">إحصاءات الحضور ↓</button>' +
      '<button class="btn" type="button" id="new-course-btn">دورة جديدة</button>';
    html += '</div></div>';

    html += '<div id="courses-stats-panel"></div>';

    var chips = [['all', 'الكل'], ['completed', 'مكتملة'], ['in-progress', 'جارية'], ['cancelled', 'ملغاة'], ['paused', 'متوقفة']];
    html += '<div class="toolbar"><div class="chips">';
    chips.forEach(function (chip) {
      html += '<button class="chip' + (currentFilter === chip[0] ? ' active' : '') + '" type="button" data-filter="' +
        chip[0] + '">' + chip[1] + '</button>';
    });
    html += '</div><select class="input" id="courses-level-filter" aria-label="فلترة حسب المستوى">' +
      '<option value="all"' + (currentLevelFilter === 'all' ? ' selected' : '') + '>كل المستويات</option>' +
      levelFilterOptionsHtml() + '</select>' +
      '<input type="text" class="input" id="courses-search" placeholder="ابحث بالاسم أو المدرب…" style="flex:1;min-width:200px" value="' +
      UI.escapeHtml(currentSearch) + '" aria-label="البحث في الدورات">';
    html += '</div>';

    html += '<div class="card">';
    if (!courses.length) {
      html += UI.emptyState('لا دورات هنا', currentFilter === 'all' ?
        'لم تُنشأ أي دورة بعد.' : 'لا دورات بهذه الحالة.',
        canWrite && currentFilter === 'all' ? 'دورة جديدة' : null, 'courses-empty-new');
    } else {
      courses.forEach(function (c) {
        var prog = App.courseProgress(c);
        var halls = App.hallsUsedByCourse(c.id);
        var searchHay = (c.name + ' ' + (App.trainerName(c.trainerId) || '') + ' ' +
          App.displayCode(c, 'courses')).toLowerCase();
        html += '<div class="list-row clickable" data-course-open="' + UI.escapeHtml(c.id) + '"' +
          ' data-course-search="' + UI.escapeHtml(searchHay) + '">' +
          '<div class="list-row-main">' +
          '<div class="list-row-title"><strong>' + UI.escapeHtml(c.name) + '</strong> <span class="pill pill-grey">' + UI.escapeHtml(App.displayCode(c, 'courses')) + '</span> ' + completionPill(prog.status) + '</div>' +
          '<div class="list-row-meta muted">' + UI.escapeHtml(App.trainerName(c.trainerId) || 'بلا مدرب') + ' · ' + UI.escapeHtml(App.levelName(c.level)) + ' · ' + UI.escapeHtml(UI.daysLabel(c.days)) + '</div>' +
          '<div class="list-row-meta muted">' + UI.escapeHtml(halls.length ? halls.join(' · ') : 'بلا قاعات') + ' · الجلسات: ' + prog.done + '/' + prog.sessionsTotal + ' · المتبقية: ' + prog.sessionsRemaining + ' · المتدربون: ' + UI.fmtNumber(App.courseTrainees(c).length) + '</div>' +
          '<div class="prog-row"><div class="progress"><i style="width:' + prog.pct + '%"></i></div><span class="muted">' + prog.pct + '%</span></div>' +
          '</div>' +
          '<div class="list-row-actions row-actions">' +
          '<button class="btn btn-outline btn-sm" type="button" data-course-view="' + UI.escapeHtml(c.id) + '">عرض</button>';
        if (canWrite) {
          html += '<button class="btn btn-outline btn-sm" type="button" data-course-edit="' + UI.escapeHtml(c.id) + '">تعديل</button>' +
            '<button class="btn btn-outline btn-sm" type="button" data-course-options="' + UI.escapeHtml(c.id) + '">خيارات</button>';
        }
        html += '</div></div>';
      });
    }
    html += '<div class="muted" id="courses-no-results" hidden style="padding:12px 0">لا دورات مطابقة للبحث.</div>';
    html += '</div>';

    container.innerHTML = html;

    // تصدير إحصاءات الدورات — مشترك بين زر الترويسة وزر لوحة الإحصاءات.
    function exportCoursesStats(btn) {
      if (btn) UI.setBtnLoading(btn, true, 'جارٍ تجهيز الإحصائيات…');
      App.buildCoursesStatsData().then(function (data) {
        UI.callExport('exportCoursesStats', [data]);
      }).catch(UI.toastError).finally(function () { if (btn) UI.setBtnLoading(btn, false); });
    }

    // لوحة إحصاءات الدورات (v2.1، بند 10).
    if (window.TadreebStats) {
      var coursesPanelEl = container.querySelector('#courses-stats-panel');
      var coursesRes = window.TadreebStats.computeCourses();
      window.TadreebStats.renderPanel(coursesPanelEl, {
        section: 'courses', title: 'إحصاءات الدورات', metrics: coursesRes.metrics,
        // التصدير كان مقتصراً على الكتابة في الترويسة — نحافظ على ذلك هنا.
        export: canWrite ? {
          label: 'تصدير الإحصاءات ↓',
          onClick: function () {
            var b = coursesPanelEl ? coursesPanelEl.querySelector('[data-stats-export]') : null;
            exportCoursesStats(b);
          }
        } : null
      });
      App.buildCoursesStatsData().then(function (d) {
        window.TadreebStats.updateMetrics(coursesPanelEl, window.TadreebStats.coursesMetricsFromData(d));
      }).catch(function () { /* تبقى المقاييس المتزامنة فقط */ });
    }

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
    // البحث في القائمة (بالاسم أو المدرب أو المعرّف): إخفاء/إظهار
    // صفوف DOM مباشرةً دون إعادة رسم حتى لا يفقد الحقل التركيز
    // أثناء الكتابة؛ النص يبقى عند تبديل الفلاتر.
    var searchInput = document.getElementById('courses-search');
    function applyCourseSearch() {
      var q = currentSearch.trim().toLowerCase();
      var rows = container.querySelectorAll('[data-course-open]');
      var visible = 0;
      rows.forEach(function (row) {
        var hay = row.getAttribute('data-course-search') || '';
        var show = !q || hay.indexOf(q) !== -1;
        row.style.display = show ? '' : 'none';
        if (show) visible++;
      });
      var noRes = document.getElementById('courses-no-results');
      if (noRes) noRes.hidden = !(q && visible === 0 && rows.length > 0);
    }
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        currentSearch = searchInput.value;
        applyCourseSearch();
      });
      applyCourseSearch();
    }
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
    container.querySelectorAll('[data-course-options]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var course = App.Store.get('courses', btn.getAttribute('data-course-options'));
        if (course) openCourseActionSheet(course);
      });
    });

    var statsBtn = document.getElementById('courses-stats-btn');
    if (statsBtn) {
      statsBtn.addEventListener('click', function () { exportCoursesStats(statsBtn); });
    }

    var attStatsBtn = document.getElementById('courses-attendance-stats-btn');
    if (attStatsBtn) {
      attStatsBtn.addEventListener('click', function () {
        if (!window.TadreebStats) {
          UI.toast('إحصاءات الحضور غير متاحة حالياً', 'error');
          return;
        }
        UI.openPicker({
          title: 'إحصاءات الحضور',
          columns: [
            { id: 'name', label: 'الاسم', checked: true },
            { id: 'present', label: 'موجود', checked: true },
            { id: 'absent', label: 'غائب', checked: true },
            { id: 'excused', label: 'معتذر', checked: true },
            { id: 'unrecorded', label: 'بلا تسجيل', checked: true },
            { id: 'total', label: 'إجمالي المسجل', checked: true },
            { id: 'rate', label: 'نسبة الحضور %', checked: true }
          ],
          scopeOptions: [
            { id: 'courses', label: 'حسب الدورة' },
            { id: 'groups', label: 'حسب المجموعة' },
            { id: 'trainees', label: 'حسب المتدرب' }
          ],
          onConfirm: function (result) {
            UI.toast('جارٍ تجهيز إحصاءات الحضور…');
            window.TadreebStats.exportData('attendance-stats', { scope: result.scope }).then(function (data) {
              UI.callExport('exportAttendanceStats', [data, { columns: result.columns }]);
            }).catch(UI.toastError);
          }
        });
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
  // v2.1 (بأمر بدر): حذف الدورة بتأكيد واضح فقط — بلا كلمة مرور.
  // هذا الاستثناء لحذف الدورة فقط؛ إعادة المصادقة باقية لكل
  // الإجراءات المدمّرة الأخرى (حذف المستخدمين وإعادة تعيين كلمات
  // المرور في شاشة الإدارة).
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
      UI.openModal({
        title: 'حذف الدورة',
        bodyHTML: '<p>سيتم حذف الدورة «' + UI.escapeHtml(course.name) + '» نهائياً، مع:</p>' +
          '<ul><li>' + preview.sessions + ' جلسة</li>' +
          '<li>' + preview.expenses + ' مصروف</li></ul>' +
          '<p>لا تحتوي أي جلسة من جلسات هذه الدورة على سجلات حضور. ' +
          'سجلات الحضور محمية: لا يمكن حذف دورة فيها جلسات بسجلات حضور. ' +
          'لا يمكن التراجع عن الحذف.</p>',
        actions: [
          {
            label: 'تأكيد',
            className: 'btn-danger-solid',
            onClick: function (close) {
              close();
              window.TadreebDB.deleteCourse(course.id).then(function () {
                UI.toast('تم حذف الدورة', 'success');
                App.refresh();
              }).catch(UI.toastError);
            }
          },
          { label: 'إلغاء', className: 'btn-outline', closeOnClick: true }
        ]
      });
    }).catch(UI.toastError);
  }

  // ================= نموذج الدورة (إنشاء / تعديل) =================
  // ورقة خيارات الدورة: القائمة الكاملة للإجراءات (عرض/تعديل/إعادة تسمية/
  // حذف)، تُفتح من زر «خيارات» في صف الدورة. نفس نمط ورقة خيارات الجلسة
  // (SessionScreen.openActionSheet): نفس واجهة UI.openModal ونفس أصناف
  // .sheet / .sheet-summary / .sheet-actions / .sheet-action.
  function openCourseActionSheet(course) {
    var prog = App.courseProgress(course);
    var summary = '<div class="sheet-summary">' +
      '<div class="sheet-summary-title">' + UI.escapeHtml(course.name) + '</div>' +
      '<div><span class="k">المعرّف</span> ' + UI.escapeHtml(App.displayCode(course, 'courses')) + '</div>' +
      '<div><span class="k">المدرب</span> ' + UI.escapeHtml(App.trainerName(course.trainerId) || 'بلا مدرب') + '</div>' +
      '<div><span class="k">الجلسات</span> ' + prog.done + '/' + prog.sessionsTotal + '</div>' +
      '<div><span class="k">الحالة</span> ' + completionPill(prog.status) + '</div>' +
      '</div>';
    var actions = [
      { key: 'view', label: 'عرض', attr: 'data-course-view' },
      { key: 'edit', label: 'تعديل', attr: 'data-course-edit' },
      { key: 'status', label: 'تغيير الحالة', attr: 'data-course-status' },
      { key: 'rename', label: 'إعادة تسمية', attr: 'data-course-rename' },
      { key: 'delete', label: 'حذف الدورة', attr: 'data-course-del', danger: true }
    ];
    var listHtml = actions.map(function (a) {
      return '<button class="sheet-action' + (a.danger ? ' danger' : '') + '" type="button" ' + a.attr +
        '="' + UI.escapeHtml(course.id) + '" data-sheet-action="' + a.key + '">' + a.label + '</button>';
    }).join('');
    var modal = UI.openModal({
      title: 'خيارات الدورة',
      width: 'normal',
      bodyHTML: summary + '<div class="sheet-actions">' + listHtml + '</div>',
      actions: [{ label: 'إغلاق', className: 'btn-outline', closeOnClick: true }]
    });
    if (modal.element) modal.element.classList.add('sheet');
    if (!modal.element) return;
    modal.element.querySelectorAll('[data-sheet-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-sheet-action');
        modal.close();
        if (key === 'view') App.showScreen('course-detail', { courseId: course.id });
        else if (key === 'edit') openCourseForm(course);
        else if (key === 'status') openCourseStatusModal(course);
        else if (key === 'rename') openCourseRenameModal(course);
        else if (key === 'delete') requestDeleteCourse(course);
      });
    });
  }

  // تغيير سريع لحالة الدورة دون فتح نموذج التعديل الكامل.
  function openCourseStatusModal(course) {
    var current = course.status || 'planned';
    var opts = Object.keys(UI.COURSE_STATUS_LABELS).map(function (k) {
      return '<option value="' + k + '"' + (k === current ? ' selected' : '') + '>' +
        UI.escapeHtml(UI.COURSE_STATUS_LABELS[k]) + '</option>';
    }).join('');
    UI.openFormModal('تغيير حالة الدورة — ' + course.name,
      '<div class="field"><label>الحالة</label><select name="status">' + opts + '</select></div>',
      function (form, close, submitBtn) {
        var status = form.querySelector('[name="status"]').value;
        if (status === current) { close(); return; }
        UI.setBtnLoading(submitBtn, true);
        window.TadreebDB.update('courses', course.id, { status: status }).then(function () {
          UI.setBtnLoading(submitBtn, false);
          close();
          UI.toast('تم تغيير حالة الدورة إلى «' + UI.COURSE_STATUS_LABELS[status] + '»', 'success');
          App.refresh();
        }).catch(function (err) { UI.setBtnLoading(submitBtn, false); UI.toastError(err); });
      }, { submitLabel: 'حفظ', width: 'normal' });
  }

  function trainerOptionsHtml(selectedId) {
    var html = '<option value="">بدون مدرب حالياً</option>';
    App.Store.getAll('trainers').forEach(function (t) {
      html += '<option value="' + UI.escapeHtml(t.id) + '"' +
        (t.id === selectedId ? ' selected' : '') + '>' + UI.escapeHtml(App.displayCode(t, 'trainers') + ' — ' + t.name) + '</option>';
    });
    html += '<option value="__new__">إضافة مدرب جديد +</option>';
    return html;
  }

  // خيارات المجموعة: «المعرّف — الاسم — المديرية»؛ آمنة مع قائمة مجموعات فارغة.
  // خيار «إضافة مجموعة جديدة +» يفتح نافذة الإضافة السريعة (v2.1).
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
    html += '<option value="__new__">إضافة مجموعة جديدة +</option>';
    return html;
  }

  // خيارات المديرية المعيّنة (حقل منفرد، غير خانات المديريات المتعددة).
  // خيار «إضافة مديرية جديدة +» يفتح نافذة الإضافة السريعة (v2.1).
  function assignedDirectorateOptionsHtml(selectedId) {
    var dirs = App.Store.getAll('directorates').slice().sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
    });
    var html = '<option value="">بدون مديرية معيّنة</option>';
    dirs.forEach(function (d) {
      html += '<option value="' + UI.escapeHtml(d.id) + '"' + (d.id === selectedId ? ' selected' : '') + '>' +
        UI.escapeHtml(App.displayCode(d, 'directorates') + ' — ' + d.name) + '</option>';
    });
    html += '<option value="__new__">إضافة مديرية جديدة +</option>';
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
  // إن كانت قائمة القاعات فارغة يُضاف خيار «إضافة قاعة جديدة +»
  // (الإضافة السريعة v2.1) — وإلا فإدارة القاعات من الدليل.
  function hallOptionsHtml(selectedId) {
    var halls = App.Store.getAll('halls').slice().sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
    });
    var html = '<option value="">تلقائي (أول قاعة حرة)</option>';
    halls.forEach(function (h) {
      html += '<option value="' + UI.escapeHtml(h.id) + '"' + (h.id === selectedId ? ' selected' : '') + '>' +
        UI.escapeHtml(h.name) + '</option>';
    });
    if (!halls.length) html += '<option value="__new__">إضافة قاعة جديدة +</option>';
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

  // ---------- تنسيق الوقت بنظام 12 ساعة (v2.1، بند 8) ----------
  // العرض فقط بنظام 12 ساعة مع ص/م؛ التخزين يبقى 24 ساعة (HH:MM).
  // تستخدم TadreebTime.formatTimeRange12 عند توفرها (يضيفها عامل
  // موازٍ إلى datetime.js)، وإلا تعود إلى النص الخام 24 ساعة.
  function fmtRange12(start, end) {
    try {
      if (window.TadreebTime && typeof window.TadreebTime.formatTimeRange12 === 'function') {
        return window.TadreebTime.formatTimeRange12(start, end);
      }
    } catch (e) { /* احتياطي أدناه */ }
    return (start || '') + ' - ' + (end || '');
  }

  function byNameAsc(a, b) {
    return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
  }

  function sortedPeriods() {
    return App.Store.getAll('periods').slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }

  // ================= الإضافة السريعة داخل نموذج الدورة (v2.1) =================
  // نافذة صغيرة فوق نموذج الدورة لإنشاء سجل دليل على الفور (المجموعة
  // والمديرية والقاعة)، بالحقول نفسها التي تستخدمها شاشة الدليل
  // (الاسم + المعرّف التلقائي + حقلا النوع)، ثم يُختار الجديد فوراً
  // في القائمة المنسدلة. المدرب له نموذج مضمّن داخل نموذج الدورة
  // أصلاً (cf-new-trainer) فيبقى كما هو. الدليل يبقى مكان الإدارة
  // الكاملة؛ هذه اختصار فقط.
  var QUICK_ADD_META = {
    group: { col: 'groups', title: 'مجموعة تدريبية', label: 'المجموعة' },
    directorate: { col: 'directorates', title: 'مديرية', label: 'المديرية' },
    hall: { col: 'halls', title: 'قاعة', label: 'القاعة' }
  };

  function quickAddDirectorateOptionsHtml(selectedId) {
    var html = '<option value="">اختر المديرية</option>';
    App.Store.getAll('directorates').slice().sort(byNameAsc).forEach(function (d) {
      html += '<option value="' + UI.escapeHtml(d.id) + '"' + (d.id === selectedId ? ' selected' : '') + '>' +
        UI.escapeHtml(App.displayCode(d, 'directorates') + ' — ' + d.name) + '</option>';
    });
    html += '<option value="__new__">إضافة مديرية جديدة +</option>';
    return html;
  }

  function quickAddFieldsHtml(kind) {
    var meta = QUICK_ADD_META[kind];
    var codeField = '<div class="field"><label>المعرّف *</label><input type="text" name="code" required value="' +
      UI.escapeHtml(App.nextCode(meta.col)) + '"></div>';
    if (kind === 'directorate') {
      return '<div class="field"><label>اسم المديرية *</label><input type="text" name="name" required></div>' + codeField;
    }
    if (kind === 'hall') {
      return '<div class="field"><label>اسم القاعة *</label><input type="text" name="name" required></div>' + codeField +
        '<div class="field"><label>السعة (عدد المتدربين)</label><input type="number" name="capacity" min="0"></div>';
    }
    if (kind === 'group') {
      return '<div class="field"><label>اسم المجموعة *</label><input type="text" name="name" required placeholder="مثال: مجموعة الإدارة العامة"></div>' +
        codeField +
        '<div class="field"><label>المديرية *</label><select name="directorateId" required>' +
        quickAddDirectorateOptionsHtml(null) + '</select>' +
        '<div class="field-hint">إن لم تكن المديرية مسجلة، اختر «إضافة مديرية جديدة +».</div></div>';
    }
    return '';
  }

  // قراءة بيانات الإضافة السريعة وتحققها (مطابقة لتحقق الدليل:
  // الاسم مطلوب، والمعرّف مطلوب وفريد، والمجموعة تنتمي إلى مديرية).
  // تُرجع كائن البيانات أو null بعد إظهار الخطأ في النموذج.
  function quickAddReadData(kind, form) {
    var meta = QUICK_ADD_META[kind];
    var v = function (name) {
      var el = form.querySelector('[name="' + name + '"]');
      return el ? el.value.trim() : '';
    };
    var name = v('name');
    var code = v('code');
    if (!name) { UI.formError(form, 'الاسم مطلوب'); return null; }
    if (!code) { UI.formError(form, 'المعرّف مطلوب'); return null; }
    if (!App.isCodeUnique(meta.col, code, null)) {
      UI.formError(form, 'هذا المعرّف مستخدم من قبل — اختر معرّفاً آخر');
      return null;
    }
    if (kind === 'directorate') return { name: name, code: code };
    if (kind === 'hall') {
      var cap = form.querySelector('[name="capacity"]').value;
      return { name: name, code: code, capacity: cap === '' ? null : parseInt(cap, 10) };
    }
    if (kind === 'group') {
      var dirId = form.querySelector('[name="directorateId"]').value;
      if (!dirId || dirId === '__new__') { UI.formError(form, 'المديرية مطلوبة — المجموعة تنتمي إلى مديرية'); return null; }
      return { name: name, code: code, directorateId: dirId, traineeIds: [] };
    }
    return null;
  }

  // openQuickAddModal(kind, onSaved(newId), onCancelled)
  // onSaved تُستدعى بعد الحفظ وتحديث المتجر؛ onCancelled عند إغلاق
  // النافذة دون حفظ (إلغاء/✕/Escape) ليعيد المستدعي قائمته إلى
  // قيمتها السابقة بدل بقاء «__new__» محدداً.
  function openQuickAddModal(kind, onSaved, onCancelled) {
    var meta = QUICK_ADD_META[kind];
    if (!meta) return;
    var saved = false;
    var modal = UI.openFormModal('إضافة ' + meta.title, quickAddFieldsHtml(kind), function (form, close, submitBtn) {
      var data = quickAddReadData(kind, form);
      if (!data) return;
      UI.formError(form, '');
      UI.setBtnLoading(submitBtn, true);
      window.TadreebDB.add(meta.col, data).then(function (newId) {
        saved = true;
        UI.setBtnLoading(submitBtn, false);
        close();
        UI.toast('تمت إضافة ' + meta.label, 'success');
        var done = function () { if (typeof onSaved === 'function') onSaved(newId); };
        var rp = App.refresh();
        if (rp && typeof rp.then === 'function') rp.then(done, done);
        else done();
      }).catch(function (err) { UI.setBtnLoading(submitBtn, false); UI.formError(form, err.message); });
    }, {
      submitLabel: 'إضافة',
      width: 'normal',
      onClose: function () {
        if (!saved && typeof onCancelled === 'function') onCancelled();
      }
    });
    // في نموذج المجموعة: خيار «إضافة مديرية جديدة +» يفتح نافذة
    // مديرية فوقها، ثم يُحدَّث حقل المديرية ويُختار الجديد فوراً —
    // فينشأ مسار كامل من قوائم فارغة (مديرية ← مجموعة ← دورة).
    if (kind === 'group' && modal && modal.element) {
      var dirSel = modal.element.querySelector('[name="directorateId"]');
      if (dirSel) dirSel.addEventListener('change', function () {
        if (dirSel.value !== '__new__') return;
        dirSel.value = '';
        openQuickAddModal('directorate', function (newDirId) {
          dirSel.innerHTML = quickAddDirectorateOptionsHtml(newDirId);
          dirSel.value = newDirId;
        });
      });
    }
  }

  // صفوف خانات المديريات المتعددة في نموذج الدورة (تُبنى عند فتح
  // النموذج وتُعاد عند إضافة مديرية سريعاً مع الحفاظ على المحدد).
  function directorateCheckRowsHtml(checkedSet) {
    return App.Store.getAll('directorates').slice().sort(byNameAsc).map(function (d) {
      return '<label class="check-row"><input type="checkbox" data-dir-id="' + UI.escapeHtml(d.id) + '"' +
        (checkedSet && checkedSet.has(d.id) ? ' checked' : '') + '> ' + UI.escapeHtml(App.displayCode(d, 'directorates') + ' — ' + d.name) + '</label>';
    }).join('');
  }

  // ================= رزنامة جلسات الدورة (v2.1، بند 5) =================
  // نص تحذير تعارض القاعة — صياغة بدر حرفياً.
  var HALL_CONFLICT_WARNING = 'تحذير: القاعة محجوزة — غير متاحة في الفترات المحددة';

  // خريطة إشغال القاعات من المتجر الحي: «date|periodId» ← {hallId: true}.
  // القواعد نفسها التي يستخدمها checkHallAvailability وتوليد الجدول:
  // الجلسة المجدولة (غير الملغاة ولا العطلة) والاجتماع العارض المجدول
  // (غير الملغى) يشغلان القاعة. excludeCourseId يستثني جلسات دورة
  // واحدة (الدورة الجاري تعديلها — جلستها لا تعارض نفسها).
  function buildHallOccupancy(excludeCourseId) {
    var occupied = {};
    function mark(date, periodId, hallId) {
      if (!date || !periodId || !hallId) return;
      var key = date + '|' + periodId;
      if (!occupied[key]) occupied[key] = {};
      occupied[key][hallId] = true;
    }
    App.Store.getAll('sessions').forEach(function (s) {
      if (excludeCourseId && s.courseId === excludeCourseId) return;
      if (s.state === 'cancelled' || s.state === 'holiday') return;
      mark(s.date, s.periodId, s.hallId);
    });
    App.Store.getAll('meetings').forEach(function (m) {
      if (m.status === 'cancelled') return;
      mark(m.date, m.periodId, m.hallId);
    });
    return occupied;
  }

  function isHallOccupied(occupied, date, periodId, hallId) {
    var set = occupied[date + '|' + periodId];
    return !!(set && set[hallId]);
  }

  function freeHallsFor(occupied, date, periodId) {
    return App.Store.getAll('halls').slice().sort(byNameAsc).filter(function (h) {
      return !isHallOccupied(occupied, date, periodId, h.id);
    });
  }

  function calAddDays(dateStr, n) {
    var d = UI.parseDateStr(dateStr);
    if (!d) return null;
    d.setDate(d.getDate() + n);
    return UI.dateToStr(d);
  }

  function calWeekday(dateStr) {
    var d = UI.parseDateStr(dateStr);
    return d ? d.getDay() : -1;
  }

  // ترتيب الجلسات المختارة زمنياً، ثم بترتيب الفترة داخل اليوم.
  function sortPicks(picks) {
    var order = {};
    sortedPeriods().forEach(function (p) { order[p.id] = p.order || 0; });
    return picks.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (order[a.periodId] || 0) - (order[b.periodId] || 0);
    });
  }

  // اشتقاق نمط الدورة (الأيام/الفترة/الخطة الأسبوعية) من الجلسات
  // المختارة في الرزنامة + الأيام المفضلة — ليبقى سجل الدورة متوافقاً
  // مع توليد الجدول وإعادة التوليد وعرض التفاصيل:
  // الأيام = اتحاد الأيام المفضلة وأيام الجلسات المختارة؛ الفترة
  // الرئيسية = فترة أول جلسة مختارة (بفترة موجودة)؛ الخطة الأسبوعية
  // = فترة وقاعة أول جلسة مختارة في كل يوم، والفترة الرئيسية وقاعة
  // تلقائية للأيام المفضلة بلا جلسات مختارة.
  // fallback (للتعديل): {periodId, dayPlan} من الدورة الحالية،
  // تُستخدم عند غياب الاختيارات.
  function deriveCoursePattern(picks, checkedDays, fallback) {
    var daySet = {};
    (checkedDays || []).forEach(function (d) { daySet[d] = true; });
    var byDay = {};
    (picks || []).forEach(function (p) {
      var wd = calWeekday(p.date);
      if (wd < 0) return;
      daySet[wd] = true;
      if (!byDay[wd]) byDay[wd] = p;
    });
    var days = Object.keys(daySet).map(function (k) { return parseInt(k, 10); })
      .sort(function (a, b) { return a - b; });
    var mainPeriodId = null;
    var ordered = sortPicks(picks || []);
    for (var i = 0; i < ordered.length; i++) {
      if (App.Store.get('periods', ordered[i].periodId)) { mainPeriodId = ordered[i].periodId; break; }
    }
    if (!mainPeriodId && ordered.length) mainPeriodId = ordered[0].periodId;
    if (!mainPeriodId && fallback) mainPeriodId = fallback.periodId || null;
    var dayPlan = {};
    days.forEach(function (d) {
      var p = byDay[d];
      if (p) dayPlan[d] = { periodId: p.periodId, hallId: p.hallId || null };
      else if (fallback && fallback.dayPlan && fallback.dayPlan[d]) {
        dayPlan[d] = {
          periodId: fallback.dayPlan[d].periodId || mainPeriodId,
          hallId: fallback.dayPlan[d].hallId || null
        };
      } else dayPlan[d] = { periodId: mainPeriodId, hallId: null };
    });
    return { days: days, periodId: mainPeriodId, dayPlan: dayPlan };
  }

  // تعارضات القاعات في الاختيارات الحالية: كل اختيار قاعته المختارة
  // صراحةً محجوزة في موعده (جلسة أو اجتماع عارض).
  function calPickConflicts(picks, excludeCourseId) {
    var occupied = buildHallOccupancy(excludeCourseId);
    return (picks || []).filter(function (p) {
      return p.hallId && isHallOccupied(occupied, p.date, p.periodId, p.hallId);
    });
  }

  // إنشاء جلسات الدورة الجديدة من اختيارات الرزنامة مباشرة — سجلات
  // الجلسات مطابقة لما ينتجه توليد الجدول (الحقول نفسها). القاعة
  // «تلقائي» تُحل إلى أول قاعة حرة (بالترتيب الأبجدي كما في المولّد)؛
  // إن لم توجد قاعة حرة تُنشأ الجلسة بلا قاعة وتُذكر في
  // unassignedHalls. العطل تُتخطى (لا يمكن اختيارها من الرزنامة
  // أصلاً؛ هذا فحص أخير). تُرجع Promise بنفس شكل نتيجة
  // generateSchedule لتُعرض في نافذة النتيجة نفسها.
  function createPickedSessions(courseId, picks) {
    var holidays = {};
    App.Store.getAll('holidays').forEach(function (h) { holidays[h.date] = true; });
    var occupied = buildHallOccupancy(null);
    var halls = App.Store.getAll('halls').slice().sort(byNameAsc);
    var result = { created: 0, skippedHolidays: 0, unassignedHalls: [] };
    var docs = [];
    sortPicks(picks || []).forEach(function (pick) {
      if (holidays[pick.date]) { result.skippedHolidays++; return; }
      var hallId = null;
      if (pick.hallId) {
        // فحص أخير: القاعة المختارة قد تُحجز في هذه الأثناء.
        if (!isHallOccupied(occupied, pick.date, pick.periodId, pick.hallId)) {
          hallId = pick.hallId;
        } else {
          result.unassignedHalls.push(pick.date);
        }
      } else {
        var free = halls.filter(function (h) { return !isHallOccupied(occupied, pick.date, pick.periodId, h.id); });
        if (free.length) hallId = free[0].id;
        else result.unassignedHalls.push(pick.date);
      }
      if (hallId) {
        var key = pick.date + '|' + pick.periodId;
        if (!occupied[key]) occupied[key] = {};
        occupied[key][hallId] = true;
      }
      docs.push({
        courseId: courseId,
        date: pick.date,
        periodId: pick.periodId,
        hallId: hallId,
        state: 'scheduled',
        note: '',
        trainerPresent: null,
        mergedFrom: null
      });
    });
    // الاختيارات مواعيد مميزة (شريحة واحدة لكل يوم+فترة) فلا تعارض
    // داخل الدفعة نفسها — تُنشأ على دفعات متوازية من 10.
    var chain = Promise.resolve();
    for (var i = 0; i < docs.length; i += 10) {
      (function (chunk) {
        chain = chain.then(function () {
          return Promise.all(chunk.map(function (doc) {
            return window.TadreebDB.add('sessions', doc);
          })).then(function () { result.created += chunk.length; });
        });
      })(docs.slice(i, i + 10));
    }
    return chain.then(function () { return result; });
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

    var dirRows = directorateCheckRowsHtml(selectedDirectorates);

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
      '<div class="field field-full"><label>الأيام الأسبوعية المفضلة</label><div class="day-picker">' + dayBoxes + '</div>' +
      '<div class="field-hint">تُستخدم لحساب مدة الرزنامة أدناه — ويمكنك اختيار جلسات في أي يوم من الرزنامة.</div></div>' +
      '<div class="field field-full"><label>رزنامة جلسات الدورة *</label>' +
      '<div id="cf-cal-summary" style="font-weight:600;margin-bottom:8px"></div>' +
      '<div id="cf-cal-warnings" hidden></div>' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px">' +
      '<label for="cf-cal-defaulthall" style="font-weight:600">القاعة الافتراضية للجلسات:</label>' +
      '<select id="cf-cal-defaulthall" class="input" style="flex:1;min-width:160px">' + hallOptionsHtml(null) + '</select></div>' +
      '<div id="cf-calendar" style="max-height:50vh;overflow-y:auto"></div>' +
      '<div style="margin-top:10px"><button type="button" class="btn btn-outline btn-sm" id="cf-cal-more">إظهار أسابيع إضافية</button></div>' +
      '<div class="field-hint">' + (isEdit ?
        'الجلسات الحالية محددة مسبقاً. تغيير التحديد هنا يحدّث أيام الدورة وفترتها فقط — لإضافة جلسة أو حذفها استخدم جدول الجلسات في تفاصيل الدورة.' :
        'انقر على فترة في أي يوم لاختيارها جلسةً في الدورة — ويمكنك اختيار أكثر من فترة في اليوم الواحد. أيام العطل بلا جلسات.') + '</div></div>' +
      '<div class="field field-full"><label>المديريات</label><div id="cf-directorate-list">' +
      (dirRows ? '<div class="check-list">' + dirRows + '</div>' : '<div class="muted">لا مديريات مسجلة — أضف مديرية من قائمة «المديرية المعيّنة» أعلاه.</div>') + '</div></div>' +
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
      submitCourseForm(form, close, submitBtn, course, isEdit, calPicksList());
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
      var prevGroupValue = course ? (course.groupId || '') : '';
      var prevAssignedDirValue = course ? (course.directorateId || '') : '';
      groupSelect.addEventListener('change', function () {
        if (groupSelect.value === '__new__') {
          openQuickAddModal('group', function (newId) {
            refreshDirectorySelects();
            groupSelect.value = newId;
            prevGroupValue = newId;
            var ng = App.Store.get('groups', newId);
            if (ng && ng.directorateId) {
              assignedDirSelect.value = ng.directorateId;
              prevAssignedDirValue = ng.directorateId;
            }
            syncGroupTrainees();
          }, function () {
            groupSelect.value = prevGroupValue;
          });
          return;
        }
        prevGroupValue = groupSelect.value;
        var g = groupSelect.value ? App.Store.get('groups', groupSelect.value) : null;
        if (g && g.directorateId) {
          assignedDirSelect.value = g.directorateId;
          prevAssignedDirValue = g.directorateId;
        }
        syncGroupTrainees();
      });
      // الإضافة السريعة للمديرية المعيّنة: بعد الحفظ تُحدَّث كل
      // قوائم المديريات في النموذج (المنفردة والمتعددة ومديرية
      // المتدرب الجديد) ويُختار الجديد في الحقل المنفرد.
      assignedDirSelect.addEventListener('change', function () {
        if (assignedDirSelect.value !== '__new__') {
          prevAssignedDirValue = assignedDirSelect.value;
          return;
        }
        openQuickAddModal('directorate', function (newId) {
          refreshDirectorySelects();
          assignedDirSelect.value = newId;
          prevAssignedDirValue = newId;
        }, function () {
          assignedDirSelect.value = prevAssignedDirValue;
        });
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

    // ---------- إعادة بناء قوائم الدليل بعد إضافة سريعة ----------
    // تُعاد كل قوائم الدليل داخل النموذج من المتجر الحي مع الحفاظ
    // على المحدد حالياً (القيمة '__new__' تعود فارغة — المستدعي
    // يختار الجديد صراحةً بعدها).
    function refreshDirectorateLists() {
      var listEl = card.querySelector('#cf-directorate-list');
      if (listEl) {
        var checked = new Set();
        listEl.querySelectorAll('[data-dir-id]:checked').forEach(function (cb) {
          checked.add(cb.getAttribute('data-dir-id'));
        });
        var rows = directorateCheckRowsHtml(checked);
        listEl.innerHTML = rows ?
          '<div class="check-list">' + rows + '</div>' :
          '<div class="muted">لا مديريات مسجلة — أضف مديرية من قائمة «المديرية المعيّنة» أعلاه.</div>';
      }
      var ntSel = card.querySelector('[name="newTraineeDirectorate"]');
      if (ntSel) {
        var cur = ntSel.value;
        var html = '<option value="">اختر المديرية</option>';
        App.Store.getAll('directorates').slice().sort(byNameAsc).forEach(function (d) {
          html += '<option value="' + UI.escapeHtml(d.id) + '"' + (d.id === cur ? ' selected' : '') + '>' +
            UI.escapeHtml(App.displayCode(d, 'directorates') + ' — ' + d.name) + '</option>';
        });
        ntSel.innerHTML = html;
        ntSel.value = cur;
      }
    }

    function refreshDirectorySelects() {
      var gs = card.querySelector('select[name="groupId"]');
      if (gs) {
        var gv = gs.value === '__new__' ? '' : gs.value;
        gs.innerHTML = groupOptionsHtml(gv || null);
        gs.value = gv;
      }
      var ds = card.querySelector('select[name="directorateId"]');
      if (ds) {
        var dv = ds.value === '__new__' ? '' : ds.value;
        ds.innerHTML = assignedDirectorateOptionsHtml(dv || null);
        ds.value = dv;
      }
      var dh = card.querySelector('#cf-cal-defaulthall');
      if (dh) {
        var hv = dh.value === '__new__' ? '' : dh.value;
        dh.innerHTML = hallOptionsHtml(hv || null);
        dh.value = hv;
      }
      refreshDirectorateLists();
      renderCalendar(false);
    }

    // ---------- رزنامة جلسات الدورة (v2.1، بند 5) ----------
    // calPicks: «date|periodId» ← {date, periodId, hallId}؛ hallId
    // فارغ يعني «تلقائي» (أول قاعة حرة عند الإنشاء). عند التعديل
    // تُملأ من جلسات الدورة الحالية (عدا الملغاة والعطلة).
    var calPicks = {};
    var calWeeksShown = 4;
    var calOccupied = {};
    if (isEdit) {
      App.sessionsForCourse(course.id).forEach(function (s) {
        if (s.state === 'cancelled' || s.state === 'holiday') return;
        calPicks[s.date + '|' + s.periodId] = { date: s.date, periodId: s.periodId, hallId: s.hallId || null };
      });
    }

    function calPicksList() {
      return sortPicks(Object.keys(calPicks).map(function (k) { return calPicks[k]; }));
    }

    function calCheckedDays() {
      var out = [];
      card.querySelectorAll('[data-day]:checked').forEach(function (cb) {
        out.push(parseInt(cb.getAttribute('data-day'), 10));
      });
      return out.sort(function (a, b) { return a - b; });
    }

    function calSessionCountVal() {
      var el = card.querySelector('[name="sessionCount"]');
      return el ? (parseInt(el.value, 10) || 0) : 0;
    }

    function calStartDateVal() {
      var el = card.querySelector('[name="startDate"]');
      return (el && el.value) || UI.todayStr();
    }

    // مدة الرزنامة الأولية: عند اختيار أيام مفضلة تُحسب من عدد
    // الجلسات والأيام (أسابيع كافية للعدد المطلوب، 4 على الأقل، و12
    // كحد أقصى للعرض الأولي)؛ بلا أيام مختارة تبقى 4 أسابيع فقط —
    // وإلا قفزت الرزنامة إلى 12 أسبوعاً افتراضياً من قسمة العدد على
    // 1. قابلة للتمديد بزر «أسابيع إضافية» حتى 52 أسبوعاً.
    function calComputeWeeks() {
      var days = calCheckedDays().length;
      if (!days) return 4;
      var sc = calSessionCountVal();
      var w = Math.ceil(sc / days);
      if (!isFinite(w) || w < 4) w = 4;
      if (w > 12) w = 12;
      return w;
    }

    function calHallSelectOptions(pick) {
      var html = '<option value="">تلقائي (أول قاعة حرة)</option>';
      var halls = App.Store.getAll('halls').slice().sort(byNameAsc);
      halls.forEach(function (h) {
        var busy = isHallOccupied(calOccupied, pick.date, pick.periodId, h.id);
        html += '<option value="' + UI.escapeHtml(h.id) + '"' + (h.id === pick.hallId ? ' selected' : '') + '>' +
          UI.escapeHtml(h.name + (busy ? ' (محجوزة)' : '')) + '</option>';
      });
      if (!halls.length) html += '<option value="__new__">إضافة قاعة جديدة +</option>';
      return html;
    }

    // ملاحظة صف القاعة: تحذير التعارض (بصياغة بدر حرفياً مع سياق
    // الموعد) أو تنبيه غياب قاعة حرة للخيار التلقائي — أو ''.
    // ملاحظة: لا نستخدم صنف .form-error هنا أبداً، لأن
    // UI.formError تكتب في أول .form-error داخل النموذج.
    function calHallNoteHtml(pick) {
      if (pick.hallId && isHallOccupied(calOccupied, pick.date, pick.periodId, pick.hallId)) {
        return '<div class="cf-hall-warning" style="color:#B91C1C;font-size:13px;margin-top:6px;font-weight:600">' +
          UI.escapeHtml(HALL_CONFLICT_WARNING + ' (' + (App.hallName(pick.hallId) || '') + '، ' +
            UI.fmtDateFull(pick.date) + '، ' + App.periodLabel(pick.periodId) + ')') + '</div>';
      }
      if (!pick.hallId && !freeHallsFor(calOccupied, pick.date, pick.periodId).length) {
        return '<div class="cf-nohall-note muted" style="margin-top:6px">لا توجد قاعة حرة في هذا الموعد — ستُنشأ الجلسة بلا قاعة.</div>';
      }
      return '';
    }

    function calHallRowHtml(pick) {
      var key = pick.date + '|' + pick.periodId;
      return '<div class="cf-session-hall" data-cf-hallrow="' + key + '" style="margin-top:8px;padding:8px 10px;background:#F8FAFC;border-radius:8px">' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
        '<span style="font-weight:600">' + UI.escapeHtml(App.periodLabel(pick.periodId)) + ' — القاعة:</span>' +
        '<select class="input cf-hall-select" data-cf-hall-date="' + pick.date + '" data-cf-hall-period="' + UI.escapeHtml(pick.periodId) + '" style="flex:1;min-width:140px">' +
        calHallSelectOptions(pick) + '</select></div>' +
        calHallNoteHtml(pick) +
        '</div>';
    }

    function calDayRowHtml(date, periods, holidays, today) {
      var d = UI.parseDateStr(date);
      var label = UI.WEEKDAYS[d.getDay()] + ' ' + UI.fmtDateShort(date);
      var isHoliday = !!holidays[date];
      var html = '<div class="cf-day" data-cf-date="' + date + '" style="border:1px solid #E2E8F0;border-radius:10px;padding:10px 12px;margin-bottom:8px;background:#fff' +
        (isHoliday ? ';opacity:0.75' : '') + '">' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">' +
        '<strong>' + UI.escapeHtml(label) + '</strong>';
      if (date === today) html += '<span class="pill pill-navy">اليوم</span>';
      if (isHoliday) html += '<span class="pill pill-amber">عطلة: ' + UI.escapeHtml(holidays[date]) + '</span>';
      html += '</div>';
      if (isHoliday) {
        // جلسات حالية في يوم عطلة (وُجدت قبل تسجيل العطلة): تُعرض
        // قاعاتها فقط — بلا شرائح لإضافة جلسات جديدة.
        var holidayPicks = periods.filter(function (p) { return calPicks[date + '|' + p.id]; });
        html += '<div class="muted">' + (holidayPicks.length ?
          'يوم عطلة — لا يمكن إضافة جلسات جديدة؛ الجلسات الحالية معروضة أدناه.' :
          'لا جلسات في أيام العطل.') + '</div>';
        if (holidayPicks.length) {
          html += '<div class="cf-day-halls">';
          holidayPicks.forEach(function (p) { html += calHallRowHtml(calPicks[date + '|' + p.id]); });
          html += '</div>';
        }
      } else if (!periods.length) {
        html += '<div class="muted">لا فترات تدريبية معرّفة — أضف فترة من إعدادات المنصة أولاً.</div>';
      } else {
        html += '<div style="display:flex;flex-wrap:wrap;gap:6px">';
        periods.forEach(function (p) {
          var key = date + '|' + p.id;
          html += '<button type="button" class="chip cf-period-chip' + (calPicks[key] ? ' active' : '') +
            '" data-cf-chip-date="' + date + '" data-cf-chip-period="' + UI.escapeHtml(p.id) + '">' +
            UI.escapeHtml(p.label) + ' <span class="ltr">' + UI.escapeHtml(fmtRange12(p.start, p.end)) + '</span></button>';
        });
        html += '</div><div class="cf-day-halls">';
        periods.forEach(function (p) {
          var key = date + '|' + p.id;
          if (calPicks[key]) html += calHallRowHtml(calPicks[key]);
        });
        html += '</div>';
      }
      html += '</div>';
      return html;
    }

    function renderCalendar(resetSpan) {
      var calEl = card.querySelector('#cf-calendar');
      if (!calEl) return;
      calOccupied = buildHallOccupancy(isEdit ? course.id : null);
      var periods = sortedPeriods();
      if (resetSpan) calWeeksShown = calComputeWeeks();
      var startDate = calStartDateVal();
      var picks = calPicksList();
      // النطاق يغطي الاختيارات دائماً (حتى بعد تغيير تاريخ البدء).
      var rangeStart = startDate;
      var rangeEnd = calAddDays(startDate, calWeeksShown * 7 - 1);
      picks.forEach(function (p) {
        if (p.date < rangeStart) rangeStart = p.date;
        if (p.date > rangeEnd) rangeEnd = p.date;
      });
      var holidays = {};
      App.Store.getAll('holidays').forEach(function (h) { holidays[h.date] = h.name; });
      var today = UI.todayStr();
      var totalDays = Math.round((UI.parseDateStr(rangeEnd).getTime() - UI.parseDateStr(rangeStart).getTime()) / 86400000) + 1;
      var weeksCount = Math.ceil(totalDays / 7);
      var html = '';
      for (var w = 0; w < weeksCount; w++) {
        var weekStart = calAddDays(rangeStart, w * 7);
        var weekEnd = calAddDays(rangeStart, Math.min(w * 7 + 6, totalDays - 1));
        html += '<div class="cf-week" data-cf-week="' + w + '" style="margin-bottom:16px">' +
          '<div class="cf-week-title" style="font-weight:700;margin-bottom:8px">الأسبوع ' + (w + 1) + ' · ' +
          UI.escapeHtml(UI.fmtDateShort(weekStart) + ' – ' + UI.fmtDate(weekEnd)) + '</div>';
        for (var i = 0; i < 7; i++) {
          var dayIndex = w * 7 + i;
          if (dayIndex >= totalDays) break;
          html += calDayRowHtml(calAddDays(rangeStart, dayIndex), periods, holidays, today);
        }
        html += '</div>';
      }
      calEl.innerHTML = html;
      var moreBtn = card.querySelector('#cf-cal-more');
      if (moreBtn) moreBtn.hidden = calWeeksShown >= 52;
      calRefreshSummary();
    }

    // العداد + تحذيرات التعارض + حظر زر الحفظ أثناء التعارض أو
    // تجاوز العدد المطلوب عند الإنشاء فقط (عند التعديل لا يُحظر
    // الحفظ بتجاوز العدد — الجلسات الحالية قد تتجاوزه أصلاً؛ ولا
    // يُحظر عند صفر اختيارات — فحص الإرسال يتولاه برسالة خطأ واضحة).
    function calRefreshSummary() {
      var summaryEl = card.querySelector('#cf-cal-summary');
      var warnEl = card.querySelector('#cf-cal-warnings');
      var picks = calPicksList();
      var sc = calSessionCountVal();
      // سقف العدد يُحظر عند الإنشاء فقط؛ عند التعديل قد تتجاوز
      // الجلسات الحالية العدد (تقسيم/إضافة يدوية) فلا يُحظر الحفظ
      // (كما في submitCourseForm) — العداد يبقى معلومة فقط.
      var over = !isEdit && sc > 0 && picks.length > sc;
      // اختيارات بلا شريحة ولا صف قاعة في الرزنامة (فترات حُذفت
      // بعد إنشاء الجلسة): تُذكر في العداد حتى لا تكون صامتة.
      var invisible = 0;
      var calElForCount = card.querySelector('#cf-calendar');
      if (calElForCount) {
        picks.forEach(function (p) {
          var chip = calElForCount.querySelector('[data-cf-chip-date="' + p.date + '"][data-cf-chip-period="' + p.periodId + '"]');
          var hallRow = calElForCount.querySelector('[data-cf-hallrow="' + p.date + '|' + p.periodId + '"]');
          if (!chip && !hallRow) invisible++;
        });
      }
      if (summaryEl) {
        summaryEl.textContent = 'تم اختيار ' + picks.length + ' جلسة' + (sc > 0 ? ' من ' + sc + ' مطلوبة' : '') +
          (invisible ? ' (منها ' + invisible + ' جلسة بفترات محذوفة غير معروضة)' : '');
        summaryEl.style.color = over ? '#B91C1C' : '';
      }
      var conflicts = calPickConflicts(picks, isEdit ? course.id : null);
      var blocked = conflicts.length > 0 || over;
      if (warnEl) {
        var warnHtml = '';
        if (conflicts.length) {
          warnHtml += '<div style="background:#FEF2F2;color:#B91C1C;border-radius:8px;padding:10px 14px;font-size:14px;margin-bottom:10px;font-weight:600">' +
            UI.escapeHtml(HALL_CONFLICT_WARNING + ' — غيّر القاعة أو ألغِ اختيار الجلسة قبل الحفظ.') + '</div>';
        }
        if (over) {
          warnHtml += '<div style="background:#FEF2F2;color:#B91C1C;border-radius:8px;padding:10px 14px;font-size:14px;margin-bottom:10px;font-weight:600">' +
            UI.escapeHtml('اخترت ' + picks.length + ' جلسة بينما عدد الجلسات المطلوب ' + sc + ' — قلّل الاختيار أو زد عدد الجلسات.') + '</div>';
        }
        warnEl.innerHTML = warnHtml;
        warnEl.hidden = !warnHtml;
      }
      var submitBtn = card.querySelector('.modal-actions .btn');
      // لا يُمس زر الإرسال أثناء التحميل (فيه مؤشر دوّار) — وإلا
      // أعادت نقرة شريحة أثناء الإرسال تفعيله قبل انتهاء الحفظ.
      if (submitBtn && !submitBtn.querySelector('.spinner')) submitBtn.disabled = blocked;
    }

    // إعادة رسم مؤجلة قليلاً بعد تغيير عدد الجلسات أو تاريخ البدء
    // أو الأيام المفضلة: حدث 'change' قد ينطلق من فقدان التركيز
    // أثناء نقرة على شريحة في الرزنامة — وإعادة الرسم الفورية
    // تستبدل الشريحة تحت المؤشر قبل اكتمال النقرة فتضيع النقرة.
    var calRerenderTimer = null;
    function scheduleCalRerender() {
      if (calRerenderTimer) clearTimeout(calRerenderTimer);
      calRerenderTimer = setTimeout(function () {
        calRerenderTimer = null;
        renderCalendar(true);
      }, 250);
    }

    var calEl = card.querySelector('#cf-calendar');
    if (calEl) {
      // النقر على شريحة فترة يبدّل اختيارها جلسةً.
      calEl.addEventListener('click', function (e) {
        var chip = e.target && e.target.closest ? e.target.closest('[data-cf-chip-date]') : null;
        if (!chip || !calEl.contains(chip)) return;
        var date = chip.getAttribute('data-cf-chip-date');
        var periodId = chip.getAttribute('data-cf-chip-period');
        var key = date + '|' + periodId;
        if (calPicks[key]) {
          delete calPicks[key];
          chip.classList.remove('active');
          var row = calEl.querySelector('[data-cf-hallrow="' + key + '"]');
          if (row && row.parentNode) row.parentNode.removeChild(row);
        } else {
          var defHallSel = card.querySelector('#cf-cal-defaulthall');
          var defHall = (defHallSel && defHallSel.value && defHallSel.value !== '__new__') ? defHallSel.value : null;
          calPicks[key] = { date: date, periodId: periodId, hallId: defHall };
          chip.classList.add('active');
          var dayHalls = calEl.querySelector('[data-cf-date="' + date + '"] .cf-day-halls');
          if (dayHalls) dayHalls.insertAdjacentHTML('beforeend', calHallRowHtml(calPicks[key]));
        }
        calRefreshSummary();
      });
      // تغيير قاعة جلسة مختارة (مع الإضافة السريعة للقاعة عند فراغ القائمة).
      calEl.addEventListener('change', function (e) {
        var sel = e.target && e.target.closest ? e.target.closest('[data-cf-hall-date]') : null;
        if (!sel || !calEl.contains(sel)) return;
        var date = sel.getAttribute('data-cf-hall-date');
        var periodId = sel.getAttribute('data-cf-hall-period');
        var key = date + '|' + periodId;
        if (!calPicks[key]) return;
        if (sel.value === '__new__') {
          sel.value = calPicks[key].hallId || '';
          openQuickAddModal('hall', function (newId) {
            if (calPicks[key]) calPicks[key].hallId = newId;
            refreshDirectorySelects();
          });
          return;
        }
        calPicks[key].hallId = sel.value || null;
        // تحديث ملاحظة الصف وحدها (دون إعادة بنائه — للحفاظ على التركيز).
        var hallRow = calEl.querySelector('[data-cf-hallrow="' + key + '"]');
        if (hallRow) {
          hallRow.querySelectorAll('.cf-hall-warning, .cf-nohall-note').forEach(function (n) {
            if (n.parentNode) n.parentNode.removeChild(n);
          });
          var note = calHallNoteHtml(calPicks[key]);
          if (note) hallRow.insertAdjacentHTML('beforeend', note);
        }
        calRefreshSummary();
      });
    }
    var defaultHallSel = card.querySelector('#cf-cal-defaulthall');
    if (defaultHallSel) {
      defaultHallSel.addEventListener('change', function () {
        if (defaultHallSel.value !== '__new__') return; // تنطبق على الاختيارات الجديدة فقط
        defaultHallSel.value = '';
        openQuickAddModal('hall', function (newId) {
          refreshDirectorySelects();
          var dh = card.querySelector('#cf-cal-defaulthall');
          if (dh) dh.value = newId;
        });
      });
    }
    var calMoreBtn = card.querySelector('#cf-cal-more');
    if (calMoreBtn) calMoreBtn.addEventListener('click', function () {
      calWeeksShown = Math.min(52, calWeeksShown + 4);
      renderCalendar(false);
    });
    var sessionCountInput = card.querySelector('[name="sessionCount"]');
    if (sessionCountInput) {
      sessionCountInput.addEventListener('input', calRefreshSummary);
      sessionCountInput.addEventListener('change', scheduleCalRerender);
    }
    var startDateInput = card.querySelector('[name="startDate"]');
    if (startDateInput) startDateInput.addEventListener('change', scheduleCalRerender);
    card.querySelectorAll('.day-chip input').forEach(function (cb) {
      cb.addEventListener('change', scheduleCalRerender);
    });
    renderCalendar(true);
  }

  // calPicks: الجلسات المختارة في الرزنامة [{date, periodId, hallId}]
  // مرتبة زمنياً (تُمرَّر من openCourseForm). عند الإنشاء تُنشأ
  // جلسات الدورة منها مباشرة؛ عند التعديل تُشتق منها أيام الدورة
  // وفترتها وخطتها الأسبوعية فقط — الجلسات الحالية لا تتغير.
  function submitCourseForm(form, close, submitBtn, course, isEdit, calPicks) {
    var name = form.querySelector('[name="name"]').value.trim();
    var code = form.querySelector('[name="code"]').value.trim();
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

    // نمط الدورة (v2.1): يُشتق من جلسات الرزنامة المختارة + الأيام
    // المفضلة، فيبقى سجل الدورة متوافقاً مع توليد الجدول وإعادة
    // التوليد وعرض التفاصيل دون أي حقل جديد.
    var picks = sortPicks(calPicks || []);
    var pattern = deriveCoursePattern(picks, days, isEdit ? { periodId: course.periodId, dayPlan: course.dayPlan } : null);

    if (!name) { UI.formError(form, 'اسم الدورة مطلوب'); return; }
    if (!code) { UI.formError(form, 'المعرّف مطلوب'); return; }
    if (!App.isCodeUnique('courses', code, isEdit ? course.id : null)) {
      UI.formError(form, 'هذا المعرّف مستخدم من قبل — اختر معرّفاً آخر');
      return;
    }
    if (!sessionCount || sessionCount < 1) { UI.formError(form, 'عدد الجلسات غير صالح'); return; }
    if (!isEdit && !picks.length) { UI.formError(form, 'اختر جلسة واحدة على الأقل من الرزنامة'); return; }
    // سقف العدد المطلوب عند الإنشاء فقط (كما في المولّد)؛ عند التعديل
    // قد تتجاوز الجلسات الحالية العدد (تقسيم/إضافة) فلا يُحظر الحفظ.
    if (!isEdit && picks.length > sessionCount) {
      UI.formError(form, 'اخترت ' + picks.length + ' جلسة بينما عدد الجلسات المطلوب ' + sessionCount + ' — قلّل الاختيار أو زد عدد الجلسات');
      return;
    }
    if (!pattern.days.length) { UI.formError(form, 'اختر يوماً واحداً على الأقل من أيام الأسبوع أو جلسة من الرزنامة'); return; }
    if (!pattern.periodId) { UI.formError(form, 'اختر جلسة واحدة على الأقل من الرزنامة'); return; }
    // فحص أخير لتعارض القاعات (قد تُحجز قاعة أثناء فتح النموذج):
    // يمنع الحفظ برسالة التحذير نفسها المعروضة في الرزنامة.
    var conflicts = calPickConflicts(picks, isEdit ? course.id : null);
    if (conflicts.length) {
      var c0 = conflicts[0];
      UI.formError(form, HALL_CONFLICT_WARNING + ' (' + (App.hallName(c0.hallId) || '') + '، ' +
        UI.fmtDateFull(c0.date) + '، ' + App.periodLabel(c0.periodId) + ')');
      return;
    }

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
          notes: form.querySelector('[name="newTraineeNotes"]').value.trim()
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
        days: pattern.days,
        dayPlan: pattern.dayPlan,
        periodId: pattern.periodId,
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
      // إنشاء جلسات الدورة الجديدة من اختيارات الرزنامة (v2.1) —
      // سجلات مطابقة لما ينتجه توليد الجدول، وتُعرض نافذة النتيجة نفسها.
      return createPickedSessions(res.courseId, picks).then(function (result) {
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

    html += '<div id="course-stats-panel"></div>';

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
      sessions.forEach(function (s, i) {
        var sp = Store.get('periods', s.periodId);
        var isSel = selectedSession && selectedSession.id === s.id;
        var sessMeta2 = 'القاعة: ' + UI.escapeHtml(App.hallName(s.hallId) || 'بلا قاعة');
        if (s.note) sessMeta2 += ' · ملاحظة: ' + UI.escapeHtml(s.note);
        html += '<div class="list-row clickable' + (isSel ? ' selected-row' : '') + (detailState.mergeFromId === s.id ? ' merge-pick' : '') +
          '" data-session-row="' + UI.escapeHtml(s.id) + '">' +
          '<div class="list-row-main">' +
          '<div class="list-row-title"><strong>' + UI.escapeHtml(App.sessionLabel(s, course)) + '</strong> ' + UI.pillForSessionState(s.state) + '</div>' +
          '<div class="list-row-meta muted">' + UI.escapeHtml(UI.fmtDateShort(s.date)) + ' · ' + UI.escapeHtml(UI.fmtWeekday(s.date)) +
          (sp ? ' · <span class="ltr">' + UI.fmtTimeRange(sp.start, sp.end) + '</span>' : '') + '</div>' +
          '<div class="list-row-meta muted">' + sessMeta2 + '</div>' +
          '</div>';
        if (canWrite) {
          html += '<div class="list-row-actions row-actions">' +
            '<button class="btn btn-outline btn-sm" type="button" data-sess-state="' + UI.escapeHtml(s.id) + '">الحالة</button>' +
            '<button class="btn btn-danger btn-sm" type="button" data-sess-del="' + UI.escapeHtml(s.id) + '">حذف</button>' +
            '<button class="btn btn-outline btn-sm" type="button" data-sess-options="' + UI.escapeHtml(s.id) + '">خيارات</button>' +
            '</div>';
        }
        html += '</div>';
      });
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
      trainees.forEach(function (t) {
        html += '<div class="list-row">' +
          '<div class="list-row-main">' +
          '<div class="list-row-title"><strong>' + UI.escapeHtml(t.name) + '</strong> <span class="pill pill-grey">' + UI.escapeHtml(App.displayCode(t, 'trainees')) + '</span></div>' +
          '<div class="list-row-meta muted">' + UI.escapeHtml(App.directorateName(t.directorateId) || 'بلا مديرية') + ' · <span class="ltr">' + UI.escapeHtml(t.phone || '—') + '</span></div>';
        if (t.notes) html += '<div class="list-row-meta muted">ملاحظات: ' + UI.escapeHtml(t.notes) + '</div>';
        html += '</div>';
        if (canWrite) {
          // الدورة المجمّعة: أعضاؤها يُدارون من المجموعة، لا من هنا.
          html += '<div class="list-row-actions row-actions">' +
            '<button class="btn btn-outline btn-sm" type="button" data-trainee-notes="' + UI.escapeHtml(t.id) + '">ملاحظات</button>' +
            (detailGrouped ? '' :
              '<button class="btn btn-danger btn-sm" type="button" data-trainee-remove="' + UI.escapeHtml(t.id) + '">إزالة من الدورة</button>') +
            '</div>';
        }
        html += '</div>';
      });
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
      '</div>';
    var cats = Object.keys(budget.byCategory);
    if (!cats.length && !budget.trainerFeeDue) {
      html += '<div class="muted">لا مصاريف مسجلة بعد.</div>';
    } else {
      cats.forEach(function (cat) {
        html += '<div class="list-row"><div class="list-row-main">' +
          '<div class="list-row-title"><strong>' + UI.escapeHtml(cat) + '</strong></div>' +
          '<div class="list-row-meta muted">' + UI.fmtMoney(budget.byCategory[cat]) + '</div></div></div>';
      });
      if (budget.trainerFeeDue > 0) {
        html += '<div class="list-row"><div class="list-row-main">' +
          '<div class="list-row-title"><strong>أجور المدربين</strong></div>' +
          '<div class="list-row-meta muted">مستحقة — غير مسجلة كمصروف بعد · ' + UI.fmtMoney(budget.trainerFeeDue) + '</div></div></div>';
      }
      html += '<div class="list-row"><div class="list-row-main">' +
        '<div class="list-row-title"><strong>إجمالي المصاريف</strong></div>' +
        '<div class="list-row-meta muted">' + UI.fmtMoney(budget.totalSpent) + '</div></div></div>';
      if (budget.trainerFeeDue > 0) {
        html += '<div class="list-row"><div class="list-row-main">' +
          '<div class="list-row-title"><strong>الإجمالي مع أجور المدربين المستحقة</strong></div>' +
          '<div class="list-row-meta muted">' + UI.fmtMoney(budget.totalWithFees) + '</div></div></div>' +
          '<div class="list-row"><div class="list-row-main">' +
          '<div class="list-row-title"><strong>المتبقي مع الأجور المستحقة</strong></div>' +
          '<div class="list-row-meta muted">' + UI.fmtMoney(budget.remainingWithFees) + '</div></div></div>';
      }
    }
    html += '<div style="margin-top:14px"><div class="section-title-row"><span>تم صرف ' + spentPct + '% من الميزانية</span>' +
      '<span class="muted">المتبقي: ' + UI.fmtMoney(budget.remaining) + '</span></div>' +
      '<div class="progress"><i style="width:' + spentPct + '%"></i></div></div>';

    // تفاصيل المصاريف
    html += '<h3 style="margin-top:22px">تفاصيل المصاريف</h3>';
    if (!budget.expenses.length) {
      html += '<div class="muted">لا بنود مصاريف بعد.</div>';
    } else {
      budget.expenses.forEach(function (e) {
        var expTitle = e.description || e.category;
        var expMeta = UI.escapeHtml(UI.fmtDate(e.date)) + (e.description ? ' · ' + UI.escapeHtml(e.category) : '') +
          ' · ' + UI.fmtMoney(e.amount);
        html += '<div class="list-row"><div class="list-row-main">' +
          '<div class="list-row-title"><strong>' + UI.escapeHtml(expTitle) + '</strong></div>' +
          '<div class="list-row-meta muted">' + expMeta + '</div></div>';
        if (canWrite) {
          html += '<div class="list-row-actions row-actions">' +
            '<button class="btn btn-outline btn-sm" type="button" data-exp-edit="' + UI.escapeHtml(e.id) + '">تعديل</button>' +
            '<button class="btn btn-outline btn-sm" type="button" data-exp-notes="' + UI.escapeHtml(e.id) + '">ملاحظات</button>' +
            '<button class="btn btn-danger btn-sm" type="button" data-exp-del="' + UI.escapeHtml(e.id) + '">حذف</button>' +
            '</div>';
        }
        html += '</div>';
      });
    }
    if (canWrite) {
      html += '<div style="margin-top:18px"><button class="btn btn-outline btn-sm" type="button" id="cd-add-expense-btn">إضافة مصروف</button></div>';
    }
    html += '</div>';

    html += '<div id="budget-stats-panel"></div>';

    container.innerHTML = html;

    // لوحتا إحصاءات الدورة والميزانية (v2.1، بند 10).
    if (window.TadreebStats) {
      var coursePanelEl = container.querySelector('#course-stats-panel');
      var courseRes = window.TadreebStats.computeCourse(courseId);
      window.TadreebStats.renderPanel(coursePanelEl, {
        section: 'course', title: 'إحصاءات الدورة', metrics: courseRes.metrics,
        export: { label: 'تصدير ملف الدورة ↓', onClick: function () { openCourseFileExport(); } }
      });
      window.TadreebStats.courseAttendance(courseId).then(function (r) {
        window.TadreebStats.updateMetrics(coursePanelEl, { attendanceRate: r.rate });
      }).catch(function () { /* تبقى نسبة الحضور فارغة */ });

      var budgetPanelEl = container.querySelector('#budget-stats-panel');
      var budgetRes = window.TadreebStats.computeBudget(courseId);
      window.TadreebStats.renderPanel(budgetPanelEl, {
        section: 'budget', title: 'إحصاءات الميزانية', metrics: budgetRes.metrics,
        export: { label: 'تصدير الميزانية ↓', onClick: function () { exportBudgetNow(); } }
      });
    }

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

    // تفقد جلسة من ورقة الخيارات: تُحدَّد الجلسة ويُعاد رسم التفاصيل مع
    // التمرير إلى بطاقة الحضور — مشتركة بين نقرة الصف وزر «خيارات».
    function onSessionCheck(sid) {
      detailState.selectedSessionId = sid;
      App.renderScreen('course-detail', { courseId: courseId });
      setTimeout(function () {
        var card = document.getElementById('cd-attendance-card');
        if (card) card.scrollIntoView();
      }, 100);
    }

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
          window.SessionScreen.openActionSheet(id, { onCheck: onSessionCheck });
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
    container.querySelectorAll('[data-sess-options]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = btn.getAttribute('data-sess-options');
        if (window.SessionScreen && typeof window.SessionScreen.openActionSheet === 'function') {
          window.SessionScreen.openActionSheet(id, { onCheck: onSessionCheck });
        }
      });
    });

    // المتدربون
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

    // التصدير — مشترك بين أزرار الترويسة وأزرار لوحتي الإحصاءات.
    function openCourseFileExport() {
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
    }
    function exportBudgetNow() {
      UI.callExport('exportBudget', [App.buildBudgetData(courseId)]);
    }
    document.getElementById('cd-export-btn').addEventListener('click', openCourseFileExport);
    document.getElementById('cd-budget-export-btn').addEventListener('click', exportBudgetNow);
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
          UI.escapeHtml(App.displayCode(p, 'periods') + ' — ' + p.label) + ' (' + UI.escapeHtml(fmtRange12(p.start, p.end)) + ')</option>';
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
      // عبر updateSession (لا update العام) ليفحص التعارض قبل الحفظ.
      window.TadreebDB.updateSession(sessionId, { hallId: hallId }).then(function () {
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
