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
    html += '<div class="page-head"><div><h1>مجموعات التدريب</h1>' +
      '<div class="muted">جميع مجموعات التدريب الحالية والسابقة</div></div>' +
      '<div class="head-actions"><button class="btn btn-outline btn-sm" type="button" id="courses-export-btn">تصدير إكسل ↓</button>';
    if (canWrite) html += '<button class="btn btn-outline btn-sm" type="button" id="courses-stats-btn">تصدير الإحصائيات ↓</button>' +
      '<button class="btn btn-outline btn-sm" type="button" id="courses-attendance-stats-btn">إحصاءات الحضور ↓</button>' +
      '<button class="btn" type="button" id="new-course-btn">مجموعة تدريب جديدة</button>';
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
      UI.escapeHtml(currentSearch) + '" aria-label="البحث في مجموعات التدريب">';
    html += '</div>';

    html += '<div class="card">';
    if (!courses.length) {
      html += UI.emptyState('لا مجموعات تدريب هنا', currentFilter === 'all' ?
        'لم تُنشأ أي مجموعة تدريب بعد.' : 'لا مجموعات تدريب بهذه الحالة.',
        canWrite && currentFilter === 'all' ? 'مجموعة تدريب جديدة' : null, 'courses-empty-new');
    } else {
      courses.forEach(function (c) {
        var prog = App.courseProgress(c);
        var halls = App.hallsUsedByCourse(c.id);
        var displayName = App.groupDisplayName(c);
        var autoName = App.groupAutoName(c);
        var searchHay = (c.name + ' ' + displayName + ' ' + (App.trainerName(c.trainerId) || '') + ' ' +
          App.displayCode(c, 'courses')).toLowerCase();
        html += '<div class="list-row clickable" data-course-open="' + UI.escapeHtml(c.id) + '"' +
          ' data-course-search="' + UI.escapeHtml(searchHay) + '">' +
          '<div class="list-row-main">' +
          '<div class="list-row-title"><strong>' + UI.escapeHtml(displayName) + '</strong> <span class="pill pill-grey">' + UI.escapeHtml(App.displayCode(c, 'courses')) + '</span> ' + completionPill(prog.status) + ' ' + courseTypeBadge(c) + '</div>' +
          (App.customGroupName(c) ? '<div class="group-auto-subtitle">' + UI.escapeHtml(autoName) + '</div>' : '') +
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
    html += '<div class="muted" id="courses-no-results" hidden style="padding:12px 0">لا مجموعات تدريب مطابقة للبحث.</div>';
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
        section: 'courses', title: 'إحصاءات مجموعات التدريب', metrics: coursesRes.metrics,
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
            { id: 'courses', label: 'حسب مجموعة التدريب' },
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
          title: 'تصدير قائمة مجموعات التدريب',
          columns: [
            { id: 'trainer', label: 'المدرب', checked: true },
            { id: 'days', label: 'الأيام', checked: true },
            { id: 'period', label: 'الفترة', checked: true },
            { id: 'progress', label: 'التقدم', checked: true },
            { id: 'trainees', label: 'عدد المتدربين', checked: true }
          ],
          scopeOptions: [
            { id: 'filtered', label: 'العرض الحالي (' + (COMPLETION_FILTER_LABELS[currentFilter] || 'الكل') + ')' },
            { id: 'all', label: 'كل مجموعات التدريب' }
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
          title: 'لا يمكن حذف مجموعة التدريب هذه',
          bodyHTML: '<p>' + UI.escapeHtml('لا يمكن حذف مجموعة التدريب هذه — تحتوي ' + preview.withAttendance +
            ' جلسة على سجلات حضور. يمكنك إيقاف مجموعة التدريب أو إلغاؤها بدلاً من ذلك.') + '</p>',
          actions: [
            {
              label: 'تعديل مجموعة التدريب',
              onClick: function (close) { close(); openCourseForm(course); }
            },
            { label: 'إغلاق', className: 'btn-outline', closeOnClick: true }
          ]
        });
        return;
      }
      UI.openModal({
        title: 'حذف مجموعة التدريب',
        bodyHTML: '<p>سيتم حذف مجموعة التدريب «' + UI.escapeHtml(App.groupDisplayName(course)) + '» نهائياً، مع:</p>' +
          '<ul><li>' + preview.sessions + ' جلسة</li>' +
          '<li>' + preview.expenses + ' مصروف</li></ul>' +
          '<p>لا تحتوي أي جلسة من جلسات مجموعة التدريب هذه على سجلات حضور. ' +
          'سجلات الحضور محمية: لا يمكن حذف مجموعة تدريب فيها جلسات بسجلات حضور. ' +
          'لا يمكن التراجع عن الحذف.</p>',
        actions: [
          {
            label: 'تأكيد',
            className: 'btn-danger-solid',
            onClick: function (close) {
              close();
              window.TadreebDB.deleteCourse(course.id).then(function () {
                UI.toast('تم حذف مجموعة التدريب', 'success');
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
      '<div class="sheet-summary-title">' + UI.escapeHtml(App.groupDisplayName(course)) + '</div>' +
      (App.customGroupName(course) ? '<div><span class="k">الدورة</span> ' + UI.escapeHtml(course.name) + '</div>' : '') +
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
      { key: 'delete', label: 'حذف مجموعة التدريب', attr: 'data-course-del', danger: true }
    ];
    var listHtml = actions.map(function (a) {
      return '<button class="sheet-action' + (a.danger ? ' danger' : '') + '" type="button" ' + a.attr +
        '="' + UI.escapeHtml(course.id) + '" data-sheet-action="' + a.key + '">' + a.label + '</button>';
    }).join('');
    var modal = UI.openModal({
      title: 'خيارات مجموعة التدريب',
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
    UI.openFormModal('تغيير حالة مجموعة التدريب — ' + App.groupDisplayName(course),
      '<div class="field"><label>الحالة</label><select name="status">' + opts + '</select></div>',
      function (form, close, submitBtn) {
        var status = form.querySelector('[name="status"]').value;
        if (status === current) { close(); return; }
        UI.setBtnLoading(submitBtn, true);
        window.TadreebDB.update('courses', course.id, { status: status }).then(function () {
          UI.setBtnLoading(submitBtn, false);
          close();
          UI.toast('تم تغيير حالة مجموعة التدريب إلى «' + UI.COURSE_STATUS_LABELS[status] + '»', 'success');
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

  // ---------- أنواع القاعات والدورات (v2.3 — W3) ----------
  // المصدر الوحيد للحقيقة هو TadreebDB (db.js)؛ هذه الأغلفة
  // احتياطية إن لم تُحمَّل طبقة البيانات بعد. القاعة: 'admin'
  // (إدارية) أو 'computer' (حاسوب)؛ الدورة: 'admin' (إداري) أو
  // 'technical' (تقني)؛ سجل بلا نوع = إداري (توافق رجعي).
  function typeOfHall(h) {
    if (window.TadreebDB && typeof window.TadreebDB.hallTypeOf === 'function') {
      return window.TadreebDB.hallTypeOf(h);
    }
    return (h && h.hallType === 'computer') ? 'computer' : 'admin';
  }

  function typeOfCourse(c) {
    if (window.TadreebDB && typeof window.TadreebDB.courseTypeOf === 'function') {
      return window.TadreebDB.courseTypeOf(c);
    }
    return (c && c.courseType === 'technical') ? 'technical' : 'admin';
  }

  function courseTypeLabel(ct) {
    return ct === 'technical' ? 'تقني' : 'إداري';
  }

  // القاعات المطابقة لنوع دورة (مع قاعدة الرجوع الآمن: إن لم توجد
  // قاعة من النوع المطابق أصلاً تُرجع كل القاعات — لا طريق مسدود).
  // بلا نوع محدد (null) تُرجع كل القاعات دون تصفية.
  function matchingHallsFor(halls, courseType) {
    if (window.TadreebDB && typeof window.TadreebDB.matchingHalls === 'function') {
      return window.TadreebDB.matchingHalls(halls, courseType);
    }
    var list = (halls || []).slice();
    if (courseType == null || courseType === '') return list;
    var want = courseType === 'technical' ? 'computer' : 'admin';
    var typed = list.filter(function (x) { return typeOfHall(x) === want; });
    return typed.length ? typed : list;
  }

  function courseTypeBadge(c) {
    return typeOfCourse(c) === 'technical' ?
      '<span class="pill pill-gold">تقني</span>' :
      '<span class="pill pill-navy">إداري</span>';
  }

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

  // القاعات الحرة في موعد — مع نوع دورة محدد (v2.3 — W3) تُحسب
  // قاعات النوع المطابق فقط (مع الرجوع إلى كل القاعات إن لم توجد
  // قاعة من النوع المطابق أصلاً)؛ بلا نوع تُرجع كل القاعات الحرة
  // كما قبل.
  function freeHallsFor(occupied, date, periodId, courseType) {
    var halls = matchingHallsFor(App.Store.getAll('halls').slice().sort(byNameAsc), courseType);
    return halls.filter(function (h) {
      return !isHallOccupied(occupied, date, periodId, h.id);
    });
  }

  // خريطة إشغال مفصّلة (v2.2): «date|periodId» ← {hallId: {kind, label}}.
  // القواعد نفسها التي يستخدمها buildHallOccupancy؛ الفرق أن كل قاعة
  // مشغولة تحمل اسم شاغلها: اسم الدورة للجلسة، أو «اجتماع: <العنوان>»
  // للاجتماع العارض — لتُعرض في تفاصيل الشريحة المحجوزة.
  // (v2.3 — W3): مع نوع دورة محدد يُقتصر التفصيل على قاعات النوع
  // المطابق (مع الرجوع إلى كل القاعات إن لم توجد قاعة مطابقة أصلاً)؛
  // بلا نوع يبقى التفصيل كاملاً كما قبل.
  function buildHallOccupancyDetail(excludeCourseId, courseType) {
    var detail = {};
    function mark(date, periodId, hallId, kind, label) {
      if (!date || !periodId || !hallId) return;
      var key = date + '|' + periodId;
      if (!detail[key]) detail[key] = {};
      // الجلسة والاجتماع لا يجتمعان في قاعة واحدة أصلاً؛ إن حدث
      // ذلك تظهر الجلسة أولاً (كما في checkHallAvailability).
      if (detail[key][hallId] && detail[key][hallId].kind === 'session') return;
      detail[key][hallId] = { kind: kind, label: label };
    }
    App.Store.getAll('sessions').forEach(function (s) {
      if (excludeCourseId && s.courseId === excludeCourseId) return;
      if (s.state === 'cancelled' || s.state === 'holiday') return;
      var c = s.courseId ? App.Store.get('courses', s.courseId) : null;
      mark(s.date, s.periodId, s.hallId, 'session', c ? c.name : 'جلسة تدريبية');
    });
    App.Store.getAll('meetings').forEach(function (m) {
      if (m.status === 'cancelled') return;
      mark(m.date, m.periodId, m.hallId, 'meeting', 'اجتماع: ' + (m.title || ''));
    });
    if (courseType != null && courseType !== '') {
      var allowed = {};
      matchingHallsFor(App.Store.getAll('halls'), courseType).forEach(function (h) { allowed[h.id] = true; });
      Object.keys(detail).forEach(function (key) {
        Object.keys(detail[key]).forEach(function (hallId) {
          if (!allowed[hallId]) delete detail[key][hallId];
        });
      });
    }
    return detail;
  }

  // عرض توفر القاعات لكل قاعة على حدة (v2.2): اسم القاعة + حالة
  // (متاحة / مشغولة — باسم الدورة أو الاجتماع). صفوف
  // checkHallAvailability. isSelfHall اختياري (قاعة الاجتماع/الجلسة
  // نفسها عند التعديل تُعامل كمتاحة).
  function hallAvailabilityListHtml(rows, isSelfHall) {
    if (!rows.length) return 'لا قاعات مسجلة.';
    return rows.map(function (r) {
      var self = isSelfHall ? isSelfHall(r) : false;
      // (v2.3) علامة المطابقة لنوع الدورة — تظهر فقط عندما يمرّر
      // المستدعي نوع الدورة (preferred غير null).
      var match = r.preferred ? ' <span class="pill pill-gold">مطابقة</span>' : '';
      if (r.free || self) {
        return '<div>' + UI.escapeHtml(r.hallName) + match + ' <span class="pill pill-green">متاحة</span></div>';
      }
      return '<div>' + UI.escapeHtml(r.hallName) + match + ' <span class="pill pill-red">مشغولة' +
        (r.sessionCourse ? ' — ' + UI.escapeHtml(r.sessionCourse) : '') + '</span></div>';
    }).join('');
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

  // أيام العطلة الأسبوعية (v2.3): الجمعة + السبت افتراضياً،
  // وتُقرأ من الإعدادات عبر TadreebDB.getWeekendDays() إن وُجدت
  // (عامل آخر يملك الإعداد) — وإلا يبقى الافتراضي [5، 6].
  function calWeekendDays() {
    try {
      if (window.TadreebDB && typeof window.TadreebDB.getWeekendDays === 'function') {
        var wd = window.TadreebDB.getWeekendDays();
        if (Array.isArray(wd) && wd.length) return wd;
      }
    } catch (e) { /* الافتراضي أدناه */ }
    return [5, 6];
  }

  function calIsWeekend(dateStr) {
    return calWeekendDays().indexOf(calWeekday(dateStr)) !== -1;
  }

  // مفتاح الشهر «YYYY-MM» من تاريخ، وإزاحة شهر بمقدار معين.
  function calMonthKey(dateStr) {
    return dateStr ? String(dateStr).slice(0, 7) : null;
  }

  function calShiftMonth(monthKey, delta) {
    var parts = String(monthKey || '').split('-');
    if (parts.length !== 2) return calMonthKey(UI.todayStr());
    var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1 + delta, 1);
    var m = d.getMonth() + 1;
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m;
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
  // (v2.3 — W3): مع نوع دورة محدد تُحل إلى أول قاعة حرة من النوع
  // المطابق (تقنية ← حاسوب، إدارية ← إدارية)، مع الرجوع إلى أي
  // قاعة حرة إن لم توجد قاعة من النوع المطابق أصلاً. القاعة
  // المختارة صراحةً لكل جلسة تُحترم كما هي (اختيار المستخدم يفوز).
  // إن لم توجد قاعة حرة تُنشأ الجلسة بلا قاعة وتُذكر في
  // unassignedHalls. العطل تُتخطى (لا يمكن اختيارها من الرزنامة
  // أصلاً؛ هذا فحص أخير). تُرجع Promise بنفس شكل نتيجة
  // generateSchedule لتُعرض في نافذة النتيجة نفسها.
  function createPickedSessions(courseId, picks, courseType) {
    var holidays = {};
    App.Store.getAll('holidays').forEach(function (h) { holidays[h.date] = true; });
    var occupied = buildHallOccupancy(null);
    var halls = matchingHallsFor(App.Store.getAll('halls').slice().sort(byNameAsc), courseType);
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
    // نوع الدورة (v2.3 — W3): دورة قديمة بلا نوع تُعامل كإدارية.
    var courseTypeVal = course ? typeOfCourse(course) : 'admin';

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
      '<div class="field field-full"><label>اسم المجموعة المخصص (اختياري)</label>' +
      '<input type="text" name="customName" value="' + UI.escapeHtml(course ? (course.customName || '') : '') + '" placeholder="مثال: مجموعة النخبة">' +
      '<div class="field-hint">إن كتبت اسماً مخصصاً يظهر كاسم رئيسي للمجموعة، ويظهر الاسم التلقائي كسطر فرعي تحته. اتركه فارغاً لاستخدام الاسم التلقائي.</div>' +
      '<div class="group-auto-preview" id="cf-auto-name-preview"></div></div>' +
      '<div class="field"><label>المعرّف *</label>' +
      '<input type="text" name="code" required value="' + UI.escapeHtml(course ? (course.code || App.displayCode(course, 'courses')) : App.nextCode('courses')) + '"></div>' +
      '<div class="field"><label>المدرب</label><select name="trainerId">' + trainerOptionsHtml(course ? course.trainerId : null) + '</select>' +
      '<div class="field-hint">يمكن إنشاء مجموعة التدريب بدون مدرب والتعاقد معه لاحقاً.</div></div>' +
      '<div class="field"><label>المجموعة</label><select name="groupId">' + groupOptionsHtml(course ? course.groupId : null) + '</select></div>' +
      '<div class="field"><label>المديرية المعيّنة</label><select name="directorateId">' + assignedDirectorateOptionsHtml(course ? course.directorateId : null) + '</select>' +
      '<div class="field-hint">تُملأ تلقائياً عند اختيار مجموعة، ويمكن تغييرها يدوياً.</div></div>' +
      '<div class="field"><label>المستوى</label><select name="level">' + levelOptionsHtml(course ? course.level : 'none') + '</select>' +
      '<div class="field-hint">المستويات المخصصة تُدار من إعدادات المنصة.</div></div>' +
      '<div class="field"><label>نوع مجموعة التدريب</label><select name="courseType">' +
      '<option value="admin"' + (courseTypeVal !== 'technical' ? ' selected' : '') + '>إداري</option>' +
      '<option value="technical"' + (courseTypeVal === 'technical' ? ' selected' : '') + '>تقني</option></select>' +
      '<div class="field-hint">مجموعات التدريب التقنية تُسند تلقائياً إلى قاعات الحاسوب، والإدارية إلى القاعات الإدارية.</div></div>' +
      '<div class="field"><label>عدد الجلسات *</label><input type="number" name="sessionCount" min="1" max="200" required value="' +
      UI.escapeHtml(course ? course.sessionCount : 20) + '"></div>' +
      '<div class="field"><label>عدد الجلسات أسبوعياً</label><input type="number" id="cf-per-week" name="sessionsPerWeek" min="1" max="7" value="">' +
      '<div class="field-hint">للتعبئة الذكية الموجَّهة: تُوزَّع الجلسات على الأسابيع بهذا العدد (مثال: 20 جلسة بمعدل 3 أسبوعياً ≈ 7 أسابيع)، جلسة واحدة في اليوم كحد أقصى. اتركه فارغاً للتعبئة بأقرب موعد متاح.</div></div>' +
      '<div class="field"><label>تاريخ بدء مجموعة التدريب</label><input type="date" name="startDate" value="' +
      UI.escapeHtml(isEdit ? (course.startDate || '') : UI.todayStr()) + '"></div>' +
      '<div class="field"><label>ميزانية مجموعة التدريب (ل.س)</label><input type="number" name="budget" min="0" step="1" value="' +
      UI.escapeHtml(course ? (course.budget || 0) : 0) + '"></div>' +
      (isEdit ? '<div class="field"><label>حالة مجموعة التدريب</label><select name="status">' +
        Object.keys(UI.COURSE_STATUS_LABELS).map(function (k) {
          return '<option value="' + k + '"' + (course.status === k ? ' selected' : '') + '>' + UI.COURSE_STATUS_LABELS[k] + '</option>';
        }).join('') + '</select></div>' : '') +
      '<div class="field field-full"><label>الأيام الأسبوعية المفضلة</label><div class="day-picker">' + dayBoxes + '</div>' +
      '<div class="field-hint">تُستخدم لحساب مدة الرزنامة أدناه — ويمكنك اختيار جلسات في أي يوم من الرزنامة.</div></div>' +
      '<div class="field field-full"><label>رزنامة جلسات مجموعة التدريب *</label>' +
      '<div id="cf-cal-summary" style="font-weight:600;margin-bottom:8px"></div>' +
      '<div id="cf-cal-warnings" hidden></div>' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px">' +
      '<label for="cf-cal-defaulthall" style="font-weight:600">القاعة الافتراضية للجلسات:</label>' +
      '<select id="cf-cal-defaulthall" class="input" style="flex:1;min-width:160px">' + hallOptionsHtml(null) + '</select></div>' +
      '<div class="cf-cal-tools">' +
      '<div class="legend" style="margin-bottom:8px">' +
      '<span><span class="dot" style="background:#2E7D32"></span>متاح</span>' +
      '<span><span class="dot" style="background:#B45309"></span>متاح جزئياً</span>' +
      '<span><span class="dot" style="background:#C62828"></span>محجوز</span>' +
      '<span><span class="dot" style="background:#081F31"></span>مختار</span>' +
      '</div>' +
      '<div class="cf-cal-actions">' +
      '<button type="button" class="btn btn-outline btn-sm" id="cf-cal-freeonly" aria-pressed="false">المتاحة فقط</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="cf-cal-smartfill">تعبئة ذكية</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="cf-cal-pattern" hidden>إكمال النمط</button>' +
      '</div>' +
      '<div id="cf-cal-smart-note" class="muted" hidden style="margin-bottom:8px"></div>' +
      '</div>' +
      '<div id="cf-calendar" style="max-height:50vh;overflow-y:auto"></div>' +
      '<div style="margin-top:10px"><button type="button" class="btn btn-outline btn-sm" id="cf-cal-more">إظهار أسابيع إضافية</button></div>' +
      '<div class="field-hint">' + (isEdit ?
        'الجلسات الحالية محددة مسبقاً — انقر على يوم في الرزنامة لعرض فتراته. تغيير التحديد هنا يحدّث أيام مجموعة التدريب وفترتها فقط — لإضافة جلسة أو حذفها استخدم جدول الجلسات في تفاصيل مجموعة التدريب.' :
        'انقر على يوم في الرزنامة لعرض فتراته، ثم انقر على فترة لاختيارها جلسةً في مجموعة التدريب — ويمكنك اختيار أكثر من فترة في اليوم الواحد. أيام العطل والعطلة الأسبوعية بلا جلسات.') + '</div></div>' +
      '<div class="field field-full"><label>المديريات</label><div id="cf-directorate-list">' +
      (dirRows ? '<div class="check-list">' + dirRows + '</div>' : '<div class="muted">لا مديريات مسجلة — أضف مديرية من قائمة «المديرية المعيّنة» أعلاه.</div>') + '</div></div>' +
      '<div class="field field-full"><label>المتدربون</label>' +
      '<div class="field-hint" id="cf-group-trainee-hint" hidden></div>' +
      '<input type="text" class="check-list-search" id="cf-trainee-search" placeholder="ابحث بالاسم…">' +
      (traineeRows ? '<div class="check-list" id="cf-trainee-list">' + traineeRows + '</div>' :
        '<div class="muted">لا متدربين مسجلين — أضف متدرباً جديداً أدناه.</div>') +
      '<div class="excel-import" id="cf-excel-import">' +
      '<input type="file" id="cf-excel-file" accept=".xlsx" hidden>' +
      '<button type="button" class="btn btn-outline btn-sm" id="cf-excel-btn">إضافة من Excel</button>' +
      '<div class="field-hint">ملف ‎.xlsx: العمود الأول اسم المتدرب والثاني رقم هاتفه. تُترك المديرية فارغة ويمكن تعديلها لاحقاً من بطاقة المتدرب.</div>' +
      '<div id="cf-excel-summary" class="excel-import-summary" hidden></div></div>' +
      '<div class="inline-add"><h3>إضافة متدرب جديد</h3><div class="form-grid">' +
      '<div class="field"><label>الاسم</label><input type="text" name="newTraineeName" placeholder="اسم المتدرب"></div>' +
      '<div class="field"><label>المديرية</label><select name="newTraineeDirectorate"><option value="">اختر المديرية</option>' +
      directorates.map(function (d) { return '<option value="' + UI.escapeHtml(d.id) + '">' + UI.escapeHtml(App.displayCode(d, 'directorates') + ' — ' + d.name) + '</option>'; }).join('') + '<option value="__new__">إضافة مديرية جديدة +</option></select></div>' +
      '<div class="field"><label>رقم الهاتف</label><input type="text" name="newTraineePhone" placeholder="رقم الهاتف"></div>' +
      '<div class="field"><label>ملاحظات</label><input type="text" name="newTraineeNotes" placeholder="ملاحظات أخرى (اختياري)"></div>' +
      '</div><div class="field-hint">إن كتبت اسماً هنا، سيُضاف المتدرب الجديد إلى مجموعة التدريب تلقائياً.</div></div>' +
      '</div>' +
      '<div class="field field-full" id="cf-new-trainer" hidden><div class="inline-add"><h3>مدرب جديد</h3><div class="form-grid">' +
      '<div class="field"><label>اسم المدرب</label><input type="text" name="newTrainerName" placeholder="اسم المدرب"></div>' +
      '<div class="field"><label>التخصص</label><input type="text" name="newTrainerSpecialty" placeholder="التخصص"></div>' +
      '<div class="field"><label>رقم الهاتف</label><input type="text" name="newTrainerPhone" placeholder="رقم الهاتف"></div>' +
      '</div></div></div>' +
      '</div>';

    var modal = UI.openFormModal(isEdit ? 'تعديل مجموعة التدريب' : 'مجموعة تدريب جديدة', fields, function (form, close, submitBtn) {
      submitCourseForm(form, close, submitBtn, course, isEdit, calPicksList());
    }, { submitLabel: isEdit ? 'حفظ التعديلات' : 'إنشاء مجموعة التدريب وتوليد الجدول', width: 'xwide' });

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
        // الاستيراد من إكسل يضيف إلى قائمة الدورة — يُعطَّل معها
        // عند تعيين مجموعة (أعضاء المجموعة هم المستخدمون).
        var cfExcelBtn = card.querySelector('#cf-excel-btn');
        if (cfExcelBtn) cfExcelBtn.disabled = grouped;
        var cfExcelBlock = card.querySelector('#cf-excel-import');
        if (cfExcelBlock) cfExcelBlock.style.opacity = grouped ? '0.5' : '';
        if (cfGroupHint) {
          if (grouped) {
            var n = (g.traineeIds || []).length;
            cfGroupHint.textContent = 'مجموعة التدريب هذه معيّنة لمجموعة — سيُستخدم أعضاء المجموعة في التفقد والتصدير' +
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
            refreshAutoNamePreview();
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
          refreshAutoNamePreview();
        }, function () {
          assignedDirSelect.value = prevAssignedDirValue;
        });
      });
      syncGroupTrainees();
    }
    // معاينة الاسم التلقائي لمجموعة التدريب (v2.3 — N): تُحدَّث عند
    // تغيير اسم الدورة أو المديرية المعيّنة؛ الرقم هو رقم المجموعة
    // الحالية عند التعديل، والرقم التالي عند الإنشاء.
    var cfNameInput = card.querySelector('[name="name"]');
    var cfAutoPreview = card.querySelector('#cf-auto-name-preview');
    function refreshAutoNamePreview() {
      if (!cfAutoPreview) return;
      var nm = cfNameInput ? cfNameInput.value.trim() : '';
      var dirSel = card.querySelector('select[name="directorateId"]');
      var dirId = dirSel ? dirSel.value : '';
      var dirName = (dirId && dirId !== '__new__') ? (App.directorateName(dirId) || '') : '';
      var num = isEdit ? App.groupNumber(course) : App.nextGroupNumber();
      cfAutoPreview.innerHTML = 'الاسم التلقائي: <strong>' + UI.escapeHtml('مجموعة تدريب ' + num + ' — ' + (dirName || 'بلا مديرية') + ' — ' + (nm || '…')) + '</strong>';
    }
    if (cfNameInput) cfNameInput.addEventListener('input', refreshAutoNamePreview);
    if (assignedDirSelect) assignedDirSelect.addEventListener('change', refreshAutoNamePreview);
    if (groupSelect) groupSelect.addEventListener('change', function () { setTimeout(refreshAutoNamePreview, 0); });
    refreshAutoNamePreview();
    // إضافة مديرية جديدة من حقل مديرية المتدرب الجديد (v2.3 — N):
    // خيار «إضافة مديرية جديدة +» يفتح الإضافة السريعة، ثم تُحدَّث
    // قوائم المديريات ويُختار الجديد في حقل المتدرب.
    var ntDirSel = card.querySelector('[name="newTraineeDirectorate"]');
    if (ntDirSel) {
      var prevNtDirValue = '';
      ntDirSel.addEventListener('change', function () {
        if (ntDirSel.value !== '__new__') { prevNtDirValue = ntDirSel.value; return; }
        openQuickAddModal('directorate', function (newId) {
          refreshDirectorySelects();
          var sel = card.querySelector('[name="newTraineeDirectorate"]');
          if (sel) { sel.value = newId; prevNtDirValue = newId; }
          refreshAutoNamePreview();
        }, function () {
          ntDirSel.value = prevNtDirValue;
        });
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

    // ---------- استيراد المتدربين من إكسل (v2.3 — M) ----------
    // يعيد رسم قائمة المتدربين من المتجر الحي مع الحفاظ على المحدد
    // وتحديد المستوردين الجدد؛ ينشئ القائمة إن لم تكن موجودة
    // (لا متدربين عند فتح النموذج).
    function refreshCfTraineeList(extraCheckedIds) {
      var traineeList = card.querySelector('#cf-trainee-list');
      var checked = new Set();
      if (traineeList) {
        traineeList.querySelectorAll('[data-trainee-id]:checked').forEach(function (cb) {
          checked.add(cb.getAttribute('data-trainee-id'));
        });
      }
      (extraCheckedIds || []).forEach(function (id) { checked.add(id); });
      var all = App.Store.getAll('trainees').slice().sort(function (a, b) {
        return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
      });
      var rowsHtml = all.map(function (t) {
        return '<label class="check-row" data-trainee-row="' + UI.escapeHtml(t.name) + '">' +
          '<input type="checkbox" data-trainee-id="' + UI.escapeHtml(t.id) + '"' +
          (checked.has(t.id) ? ' checked' : '') + '> ' + UI.escapeHtml(t.name) +
          ' <span class="muted">(' + UI.escapeHtml(App.displayCode(t, 'trainees')) + ' · ' + UI.escapeHtml(App.directorateName(t.directorateId) || 'بلا مديرية') + ')</span></label>';
      }).join('');
      if (!traineeList) {
        var importBlock = card.querySelector('#cf-excel-import');
        var emptyNote = importBlock ? importBlock.previousElementSibling : null;
        if (emptyNote && emptyNote.classList.contains('muted')) emptyNote.remove();
        traineeList = document.createElement('div');
        traineeList.className = 'check-list';
        traineeList.id = 'cf-trainee-list';
        if (importBlock && importBlock.parentNode) importBlock.parentNode.insertBefore(traineeList, importBlock);
        else return;
      }
      traineeList.innerHTML = rowsHtml;
      // إعادة تطبيق حالة المجموعة (التعطيل) والبحث الحالي.
      if (typeof syncGroupTrainees === 'function') syncGroupTrainees();
      var q = search ? search.value.trim() : '';
      if (q) {
        traineeList.querySelectorAll('[data-trainee-row]').forEach(function (rowEl) {
          rowEl.style.display = rowEl.getAttribute('data-trainee-row').indexOf(q) !== -1 ? '' : 'none';
        });
      }
    }
    var cfExcelBtn = card.querySelector('#cf-excel-btn');
    var cfExcelFile = card.querySelector('#cf-excel-file');
    var cfExcelSummary = card.querySelector('#cf-excel-summary');
    if (cfExcelBtn && cfExcelFile && UI.runTraineeExcelImport) {
      cfExcelBtn.addEventListener('click', function () { cfExcelFile.click(); });
      cfExcelFile.addEventListener('change', function () {
        var file = cfExcelFile.files && cfExcelFile.files[0];
        cfExcelFile.value = '';
        if (!file) return;
        UI.runTraineeExcelImport(file, {
          summaryEl: cfExcelSummary,
          buttonEl: cfExcelBtn,
          existingPhones: function () {
            var phones = [];
            card.querySelectorAll('[data-trainee-id]:checked').forEach(function (cb) {
              var t = App.Store.get('trainees', cb.getAttribute('data-trainee-id'));
              if (t && t.phone) phones.push(t.phone);
            });
            return phones;
          },
          onAdded: function (newIds) { refreshCfTraineeList(newIds); }
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
        html += '<option value="__new__">إضافة مديرية جديدة +</option>';
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
    var calOccupiedDetail = {};
    var calFreeOnly = false;
    var calDetailKey = null;
    // شبكة الرزنامة (v2.3): الشهر المعروض «YYYY-MM» + اليوم المفتوح
    // (لوحة الفترات أسفل الشبكة) — null تعني لا لوحة مفتوحة.
    var calGridMonth = null;
    var calExpandedDate = null;
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

    // الجلسات المطلوبة أسبوعياً للتعبئة الموجَّهة (v2.3): 0 تعني
    // «فارغ/غير صالح» فيُستخدم سلوك v2.2 (التعبئة بأقرب موعد).
    function calPerWeekVal() {
      var el = card.querySelector('#cf-per-week');
      if (!el) return 0;
      var v = parseInt(el.value, 10);
      return (isFinite(v) && v >= 1) ? v : 0;
    }

    // نوع الدورة (v2.3): يُقرأ من حقل النوع في النموذج إن وُجد
    // (عامل آخر يضيف الحقل) — وإلا تُعامل الدورة كإدارية.
    // مطابقة القاعات حسب النوع داخل calSlotState (عامل آخر يملكها).
    function calCourseTypeVal() {
      var el = card.querySelector('[name="courseType"]') || card.querySelector('select[name="type"]');
      return (el && el.value) || 'admin';
    }

    function calStartDateVal() {
      var el = card.querySelector('[name="startDate"]');
      return (el && el.value) || UI.todayStr();
    }

    // ---------- الرزنامة الذكية (v2.2) ----------
    // القاعة الافتراضية المختارة حالياً (null = تلقائي). '__new__'
    // تُعامل كتلقائي (الإضافة السريعة تعيدها إلى '' بعد الإنشاء).
    function calDefaultHallVal() {
      var sel = card.querySelector('#cf-cal-defaulthall');
      var v = sel ? sel.value : '';
      return (v && v !== '__new__') ? v : null;
    }

    // حالة توفر موعد (يوم + فترة) — تحترم القاعة الافتراضية:
    // تلقائي: متاح إن كانت كل القاعات حرة، محجوز إن لم توجد حرة،
    // جزئي بينهما. قاعة محددة: متاح/محجوز حسب تلك القاعة وحدها.
    // بلا قاعات مسجلة أصلاً: كل موعد متاح (الجلسات تُنشأ بلا قاعة).
    // (v2.3 — W3): مع القاعة التلقائية تُحسب قاعات نوع الدورة
    // المطابق فقط (تقنية ← حاسوب، إدارية ← إدارية)، مع الرجوع إلى
    // كل القاعات إن لم توجد قاعة من النوع المطابق أصلاً. القاعة
    // المحددة صراحةً تفوز على النوع (اختيار المستخدم).
    function calSlotState(date, periodId) {
      var halls = App.Store.getAll('halls').slice().sort(byNameAsc);
      if (!halls.length) return { state: 'free', freeCount: 0, total: 0, freeHalls: [], busyHalls: [] };
      var defHall = calDefaultHallVal();
      if (defHall) {
        var busy = isHallOccupied(calOccupied, date, periodId, defHall);
        return {
          state: busy ? 'busy' : 'free', freeCount: busy ? 0 : 1, total: 1,
          freeHalls: busy ? [] : [defHall], busyHalls: busy ? [defHall] : []
        };
      }
      var courseType = calCourseTypeVal();
      var typedHalls = matchingHallsFor(halls, courseType);
      var freeHalls = freeHallsFor(calOccupied, date, periodId, courseType);
      var freeIds = freeHalls.map(function (h) { return h.id; });
      var busyHalls = typedHalls.filter(function (h) { return freeIds.indexOf(h.id) === -1; }).map(function (h) { return h.id; });
      var state = freeIds.length === typedHalls.length ? 'free' : (freeIds.length === 0 ? 'busy' : 'partial');
      return { state: state, freeCount: freeIds.length, total: typedHalls.length, freeHalls: freeIds, busyHalls: busyHalls };
    }

    // نص حالة الشريحة: «✓ متاح» / «✕ محجوز» / «2 من 3 حرة».
    function calSlotStatusText(st) {
      if (st.state === 'free') return '✓ متاح';
      if (st.state === 'busy') return '✕ محجوز';
      return st.freeCount + ' من ' + st.total + ' حرة';
    }

    // تسمية عدد الفترات الحرة في اليوم: «اليوم مكتمل» / «فترة واحدة
    // حرة» / «فترتان حرتان» / «N فترات حرة».
    function calFreePeriodsLabel(n) {
      if (n === 0) return 'اليوم مكتمل';
      if (n === 1) return 'فترة واحدة حرة';
      if (n === 2) return 'فترتان حرتان';
      return n + ' فترات حرة';
    }

    // تفاصيل إشغال موعد: حالة كل قاعة (حرة/مشغولة وبمن) + زر اختيار
    // صريح للموعد المحجوز (يُنشئ الجلسة بلا قاعة إن لم توجد حرة —
    // السلوك اليدوي السابق نفسه، لكن بقرار صريح بعد رؤية السبب).
    // (v2.3 — W3): تُعرض قاعات نوع الدورة المطابق فقط (مع الرجوع
    // إلى كل القاعات إن لم توجد قاعة مطابقة أصلاً).
    function calSlotDetailHtml(date, periodId) {
      var halls = matchingHallsFor(App.Store.getAll('halls').slice().sort(byNameAsc), calCourseTypeVal());
      var det = calOccupiedDetail[date + '|' + periodId] || {};
      var rows = halls.map(function (h) {
        var occ = det[h.id];
        return '<div class="cf-detail-row"><span>' + UI.escapeHtml(h.name) + '</span><span>' +
          (occ ? '✕ ' + UI.escapeHtml(occ.label) : '✓ متاحة') + '</span></div>';
      }).join('');
      if (!halls.length) rows = '<div class="muted">لا قاعات مسجلة — تُنشأ الجلسة بلا قاعة.</div>';
      return '<div class="cf-chip-detail" data-cf-detail="' + date + '|' + UI.escapeHtml(periodId) + '">' +
        '<div style="font-weight:600;margin-bottom:4px">توفر القاعات في هذا الموعد:</div>' + rows +
        '<div style="margin-top:8px"><button type="button" class="btn btn-outline btn-sm" data-cf-detail-pick="' + date + '|' + UI.escapeHtml(periodId) + '">اختيار هذه الفترة</button></div>' +
        '</div>';
    }

    function calCloseDetail() {
      calDetailKey = null;
      var d = card.querySelector('.cf-chip-detail');
      if (d && d.parentNode) d.parentNode.removeChild(d);
    }

    // كشف نمط الاختيارات: زوج (يوم أسبوع + فترة) يتكرر في أسبوعين
    // مختلفين على الأقل = نمط أسبوعي واضح. تُقبل أزواج متعددة إن
    // اتفقت على فترة واحدة (الأحد والثلاثاء — الفترة الأولى)؛ إن
    // اختلفت الفترات فلا نمط واضح (لا يُعرض الزر).
    function calDetectPattern() {
      var picks = calPicksList();
      if (picks.length < 2) return null;
      var groups = {};
      picks.forEach(function (p) {
        var wd = calWeekday(p.date);
        if (wd < 0) return;
        var weekStart = calAddDays(p.date, -wd);
        var key = wd + '|' + p.periodId;
        if (!groups[key]) groups[key] = { weekday: wd, periodId: p.periodId, weeks: {} };
        groups[key].weeks[weekStart] = true;
      });
      var pairs = Object.keys(groups).map(function (k) { return groups[k]; })
        .filter(function (g) { return Object.keys(g.weeks).length >= 2; });
      if (!pairs.length) return null;
      var periodId = pairs[0].periodId;
      for (var i = 1; i < pairs.length; i++) {
        if (pairs[i].periodId !== periodId) return null;
      }
      var weekdays = pairs.map(function (g) { return g.weekday; }).sort(function (a, b) { return a - b; });
      var period = App.Store.get('periods', periodId);
      return {
        weekdays: weekdays,
        periodId: periodId,
        label: weekdays.map(function (d) { return UI.WEEKDAYS[d]; }).join(' و') + ' — ' + (period ? period.label : '')
      };
    }

    // عدد الأسابيع من تاريخ البدء حتى تاريخ معين (لتمديد الرزنامة).
    function calWeeksForDate(date) {
      var start = UI.parseDateStr(calStartDateVal());
      var d = UI.parseDateStr(date);
      if (!start || !d) return calWeeksShown;
      var diff = Math.round((d.getTime() - start.getTime()) / 86400000);
      if (diff < 0) return calWeeksShown;
      return Math.min(52, Math.floor(diff / 7) + 1);
    }

    // مواعيد مرشحة للتعبئة في أسبوع واحد يبدأ من weekStart
    // (7 أيام). daysFilter اختياري (أيام أسبوع مسموحة). تُستثنى
    // العطل وأيام العطلة الأسبوعية والاختيارات الحالية والمواعيد
    // المحجوزة كلياً (حسب القاعة الافتراضية — ونوع الدورة داخل
    // calSlotState). داخل اليوم تُفضَّل فترة النمط (أكثر فترة
    // مختارة) ثم ترتيب الفترات. onePerDay: موعد واحد في اليوم فقط
    // (ويتخطى اليوم الذي فيه اختيار حالي). تُرجع قائمة مرتبة زمنياً.
    function calWeekCandidates(weekStart, daysFilter, patternPeriodId, onePerDay) {
      var holidays = {};
      App.Store.getAll('holidays').forEach(function (h) { holidays[h.date] = true; });
      var periods = sortedPeriods();
      var out = [];
      for (var i = 0; i < 7; i++) {
        var date = calAddDays(weekStart, i);
        if (!date || holidays[date]) continue;
        if (calIsWeekend(date)) continue;
        if (daysFilter && daysFilter.indexOf(calWeekday(date)) === -1) continue;
        if (onePerDay && periods.some(function (p) { return !!calPicks[date + '|' + p.id]; })) continue;
        var dayPeriods = periods.slice().sort(function (a, b) {
          var ap = patternPeriodId && a.id === patternPeriodId ? 0 : 1;
          var bp = patternPeriodId && b.id === patternPeriodId ? 0 : 1;
          if (ap !== bp) return ap - bp;
          return (a.order || 0) - (b.order || 0);
        });
        var taken = false;
        dayPeriods.forEach(function (p) {
          if (onePerDay && taken) return;
          if (calPicks[date + '|' + p.id]) return;
          if (calSlotState(date, p.id).state === 'busy') return;
          out.push({ date: date, periodId: p.id });
          taken = true;
        });
      }
      return out;
    }

    // مواعيد مرشحة للتعبئة: من تاريخ البدء، أسبوعاً أسبوعاً حتى
    // capWeeks — تجميع calWeekCandidates أسبوعاً بعد أسبوع.
    function calFillCandidates(daysFilter, capWeeks, patternPeriodId, onePerDay) {
      var startDate = calStartDateVal();
      var out = [];
      for (var w = 0; w < capWeeks; w++) {
        var weekStart = calAddDays(startDate, w * 7);
        if (!weekStart) break;
        out = out.concat(calWeekCandidates(weekStart, daysFilter, patternPeriodId, onePerDay));
      }
      return out;
    }

    // رسالة تأكيد قصيرة أسفل أزرار الرزنامة (تُمسح عند إعادة الرسم).
    function calShowSmartNote(text) {
      var noteEl = card.querySelector('#cf-cal-smart-note');
      if (noteEl) { noteEl.textContent = text; noteEl.hidden = false; }
    }

    // التعبئة الذكية الموجَّهة (v2.3): مدخلاتها عدد الجلسات الكلي
    // + الجلسات أسبوعياً + الأيام المفضلة (مربعات النموذج نفسها)
    // + نوع الدورة (التوفر حسب النوع داخل calSlotState).
    // مع عدد أسبوعي صالح: تُوزَّع الجلسات على الأسابيع بمعدل
    // perWeek كحد أقصى في كل أسبوع، على الأيام المختارة فقط،
    // أسبوعاً أسبوعاً من تاريخ البدء — جلسة واحدة في اليوم كحد
    // أقصى (أمر بدر 01:41: التوزيع التلقائي لا يضع جلستين في
    // اليوم نفسه أبداً؛ الحصة غير المغطاة تُرحَّل لأسابيع لاحقة)
    // — وتُخصم الجلسات الموجودة أصلاً في كل أسبوع من حصته. بلا
    // عدد أسبوعي: أقرب المواعيد المتاحة (جلسة واحدة في اليوم
    // أيضاً). تُتخطى العطل والعطلة الأسبوعية والمواعيد المحجوزة
    // كلياً دائماً. بعد التعبئة يُعرض شهر أول جلسة مختارة ويُفتح
    // يومها.
    function calSmartFill() {
      var sc = calSessionCountVal();
      if (sc <= 0) { calShowSmartNote('حدّد عدد الجلسات المطلوب أولاً.'); return; }
      var remaining = sc - calPicksList().length;
      if (remaining <= 0) { calShowSmartNote('اكتمل العدد المطلوب — لا جلسات متبقية.'); return; }
      if (!sortedPeriods().length) { calShowSmartNote('لا فترات تدريبية معرّفة — أضف فترة من إعدادات المنصة أولاً.'); return; }
      var picks = calPicksList();
      var courseType = calCourseTypeVal();
      void courseType; // يُقرأ هنا توثيقاً للتدفق الموجَّه؛ المطابقة داخل calSlotState.
      var patternPeriodId = null;
      if (picks.length) {
        var counts = {};
        picks.forEach(function (p) { counts[p.periodId] = (counts[p.periodId] || 0) + 1; });
        var best = 0;
        Object.keys(counts).forEach(function (k) { if (counts[k] > best) { best = counts[k]; patternPeriodId = k; } });
      }
      var dayFilter = calCheckedDays();
      if (!dayFilter.length && picks.length) {
        var wdSet = {};
        picks.forEach(function (p) { var wd = calWeekday(p.date); if (wd >= 0) wdSet[wd] = true; });
        dayFilter = Object.keys(wdSet).map(function (k) { return parseInt(k, 10); });
      }
      if (!dayFilter.length) dayFilter = null;
      var perWeek = calPerWeekVal();
      var chosen = [];
      var seen = {};
      function take(cands) {
        for (var i = 0; i < cands.length && chosen.length < remaining; i++) {
          var k = cands[i].date + '|' + cands[i].periodId;
          if (!seen[k]) { seen[k] = true; chosen.push(cands[i]); }
        }
      }
      function takeUpTo(cands, n) {
        var added = 0;
        for (var i = 0; i < cands.length && added < n && chosen.length < remaining; i++) {
          var k = cands[i].date + '|' + cands[i].periodId;
          if (!seen[k]) { seen[k] = true; chosen.push(cands[i]); added++; }
        }
        return added;
      }
      if (perWeek > 0) {
        var startDate = calStartDateVal();
        for (var w = 0; w < 52 && chosen.length < remaining; w++) {
          var weekStart = calAddDays(startDate, w * 7);
          if (!weekStart) break;
          var weekEnd = calAddDays(weekStart, 6);
          var existing = 0;
          picks.forEach(function (p) { if (p.date >= weekStart && p.date <= weekEnd) existing++; });
          chosen.forEach(function (c) { if (c.date >= weekStart && c.date <= weekEnd) existing++; });
          var quota = perWeek - existing;
          if (quota <= 0) continue;
          // جلسة واحدة في اليوم كحد أقصى (v2.3 — أمر بدر 01:41):
          // لا تمريرة ثانية بفترات إضافية في اليوم نفسه؛ الحصة
          // غير المغطاة تُرحَّل إلى أسابيع لاحقة تلقائياً.
          takeUpTo(calWeekCandidates(weekStart, dayFilter, patternPeriodId, true), quota);
        }
      } else {
        // جلسة واحدة في اليوم كحد أقصى (v2.3) في كل التمريرات —
        // بما فيها تمريرة «أي يوم» الأخيرة.
        if (dayFilter) take(calFillCandidates(dayFilter, 52, patternPeriodId, true));
        if (chosen.length < remaining) take(calFillCandidates(null, 52, patternPeriodId, true));
      }
      var defHall = calDefaultHallVal();
      chosen.forEach(function (c) {
        calPicks[c.date + '|' + c.periodId] = { date: c.date, periodId: c.periodId, hallId: defHall };
      });
      var weeksNeeded = 0;
      if (chosen.length) weeksNeeded = calWeeksForDate(chosen[chosen.length - 1].date);
      var extended = false;
      if (weeksNeeded > calWeeksShown) { calWeeksShown = Math.min(52, weeksNeeded); extended = true; }
      if (chosen.length) { calGridMonth = chosen[0].date.slice(0, 7); calExpandedDate = chosen[0].date; }
      renderCalendar(false);
      var left = sc - calPicksList().length;
      var msg = 'تم اختيار ' + chosen.length + ' جلسة' + (left > 0 ? ' — متبقّي ' + left : ' — اكتمل العدد');
      if (perWeek > 0 && dayFilter && perWeek > dayFilter.length) {
        msg += ' — جلسة واحدة في اليوم كحد أقصى (' + dayFilter.length + ' أيام مفضلة)';
      }
      if (extended) msg += ' (تم تمديد الرزنامة إلى ' + calWeeksShown + ' أسبوعاً)';
      if (left > 0) msg += ' — لا توجد فترات حرة كافية ضمن 52 أسبوعاً.';
      calShowSmartNote(msg);
    }

    // إكمال النمط: يملأ الجلسات المتبقية بمواعيد النمط المكتشف فقط
    // (أيام + فترة النمط)، المتاحة منها فقط، بدءاً من أسبوع أول
    // اختيار (لا يعود إلى أسابيع قبل ما اختاره المستخدم) — مع تخطي
    // الأيام التي لها اختيار على أي فترة (جلسة واحدة في اليوم كحد
    // أقصى في التوزيع التلقائي).
    function calCompletePattern() {
      var pattern = calDetectPattern();
      if (!pattern) return;
      var sc = calSessionCountVal();
      var remaining = sc - calPicksList().length;
      if (remaining <= 0) { calShowSmartNote('اكتمل العدد المطلوب — لا جلسات متبقية.'); return; }
      var holidays = {};
      App.Store.getAll('holidays').forEach(function (h) { holidays[h.date] = true; });
      var picks = calPicksList();
      var firstPick = picks.length ? sortPicks(picks)[0] : null;
      var baseDate = firstPick ? firstPick.date : calStartDateVal();
      var baseWeekStart = calAddDays(baseDate, -calWeekday(baseDate)) || baseDate;
      var chosen = [];
      for (var w = 0; w < 52 && chosen.length < remaining; w++) {
        for (var i = 0; i < 7 && chosen.length < remaining; i++) {
          var date = calAddDays(baseWeekStart, w * 7 + i);
          if (!date || holidays[date]) continue;
          if (calIsWeekend(date)) continue;
          if (pattern.weekdays.indexOf(calWeekday(date)) === -1) continue;
          var key = date + '|' + pattern.periodId;
          if (calPicks[key]) continue;
          // جلسة واحدة في اليوم كحد أقصى (v2.3): إن كان لليوم اختيار
          // على فترة أخرى يُتخطى كله — التوزيع التلقائي لا يضيف جلسة
          // ثانية في اليوم نفسه أبداً (الاختيار اليدوي غير مقيّد).
          if (sortedPeriods().some(function (p) { return !!calPicks[date + '|' + p.id]; })) continue;
          if (calSlotState(date, pattern.periodId).state === 'busy') continue;
          chosen.push({ date: date, periodId: pattern.periodId });
        }
      }
      var defHall = calDefaultHallVal();
      chosen.forEach(function (c) {
        calPicks[c.date + '|' + c.periodId] = { date: c.date, periodId: c.periodId, hallId: defHall };
      });
      var weeksNeeded = 0;
      if (chosen.length) weeksNeeded = calWeeksForDate(chosen[chosen.length - 1].date);
      var extended = false;
      if (weeksNeeded > calWeeksShown) { calWeeksShown = Math.min(52, weeksNeeded); extended = true; }
      if (chosen.length) { calGridMonth = chosen[0].date.slice(0, 7); calExpandedDate = chosen[0].date; }
      renderCalendar(false);
      var left = sc - calPicksList().length;
      var msg = 'تم إكمال النمط: أُضيفت ' + chosen.length + ' جلسة' + (left > 0 ? ' — متبقّي ' + left : ' — اكتمل العدد');
      if (extended) msg += ' (تم تمديد الرزنامة إلى ' + calWeeksShown + ' أسبوعاً)';
      if (left > 0) msg += ' — لا توجد مواعيد حرة كافية ضمن النمط.';
      calShowSmartNote(msg);
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
      if (!pick.hallId && !freeHallsFor(calOccupied, pick.date, pick.periodId, calCourseTypeVal()).length) {
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

    // ---------- شبكة الرزنامة الشهرية (v2.3) ----------
    // توفر يوم كامل من حالات فتراته (v2.2): free (كل الفترات
    // متاحة) / partial / busy (كلها محجوزة) / holiday / weekend /
    // none (بلا فترات معرّفة). dots: حالة كل فترة للنقاط في الخلية.
    function calDayAvail(date, periods, holidays) {
      if (holidays[date]) return { state: 'holiday', dots: [], freeCount: 0, pickCount: 0 };
      if (calIsWeekend(date)) return { state: 'weekend', dots: [], freeCount: 0, pickCount: 0 };
      if (!periods.length) return { state: 'none', dots: [], freeCount: 0, pickCount: 0 };
      var dots = [];
      var freeCount = 0;
      var pickCount = 0;
      var allFree = true;
      var allBusy = true;
      periods.forEach(function (p) {
        var st = calSlotState(date, p.id).state;
        dots.push(st);
        if (st !== 'busy') freeCount++;
        if (st !== 'free') allFree = false;
        if (st !== 'busy') allBusy = false;
        if (calPicks[date + '|' + p.id]) pickCount++;
      });
      // حالة الخلية صارمة: «متاح» فقط إن كانت كل الفترات متاحة
      // بالكامل (الجزئي يجعل اليوم جزئياً)؛ أما freeCount فيبقي
      // على قاعدة v2.2 (الجزئي يُحسب متاحاً) لنص ملخص اليوم.
      var state = allFree ? 'free' : (allBusy ? 'busy' : 'partial');
      return { state: state, dots: dots, freeCount: freeCount, pickCount: pickCount };
    }

    // محتوى خلية اليوم: رقم اليوم + نقاط الفترات + شارة الاختيارات.
    function calDayCellInner(dayNum, info) {
      var html = '<span class="cf-day-num">' + dayNum + '</span>';
      if (info.state === 'holiday') {
        html += '<span class="cf-day-tag">عطلة</span>';
      } else if (info.state === 'weekend') {
        html += '<span class="cf-day-tag">عطلة</span>';
      } else if (info.dots.length) {
        html += '<span class="cf-day-dots">' + info.dots.map(function (s) {
          return '<span class="cf-dot cf-dot-' + s + '"></span>';
        }).join('') + '</span>';
      }
      if (info.pickCount) {
        html += '<span class="cf-day-pickcount">' + info.pickCount + ' ✓</span>';
      }
      return html;
    }

    function calDayCellClass(date, info, today) {
      var cls = 'cf-grid-day cf-day-' + info.state;
      if (date === today) cls += ' cf-day-today';
      if (date === calExpandedDate) cls += ' cf-day-expanded';
      if (info.pickCount) cls += ' cf-day-selected';
      if (calFreeOnly && info.state === 'busy' && !info.pickCount) cls += ' cf-day-filtered';
      return cls;
    }

    // شبكة الشهر: تسميات أيام الأسبوع + أسابيع صفوفاً وأيام أعمدةً
    // (الأسبوع يبدأ الأحد) + شريط تنقل (السابق/التالي/اليوم).
    // أسماء أيام الأسبوع المختصرة في الترويسة (الكاملة في title).
    function calMonthGridHtml(periods, holidays, today) {
      var parts = calGridMonth.split('-');
      var year = parseInt(parts[0], 10);
      var month = parseInt(parts[1], 10) - 1;
      var daysInMonth = new Date(year, month + 1, 0).getDate();
      var lead = new Date(year, month, 1).getDay();
      var shortDays = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
      var html = '<div class="cf-grid-nav">' +
        '<button type="button" class="btn btn-outline btn-sm" id="cf-cal-prev">‹ السابق</button>' +
        '<strong class="cf-grid-title">' + UI.escapeHtml(UI.fmtMonthYear(year, month)) + '</strong>' +
        '<button type="button" class="btn btn-outline btn-sm" id="cf-cal-next">التالي ›</button>' +
        '<button type="button" class="btn btn-outline btn-sm" id="cf-cal-today">اليوم</button>' +
        '</div>' +
        '<div class="cf-grid-weekdays">' +
        shortDays.map(function (s, i) {
          return '<div class="cf-grid-weekday" title="' + UI.escapeHtml(UI.WEEKDAYS[i]) + '">' + s + '</div>';
        }).join('') + '</div>' +
        '<div class="cf-month-cells">';
      for (var i = 0; i < lead; i++) html += '<span class="cf-grid-blank"></span>';
      for (var day = 1; day <= daysInMonth; day++) {
        var date = year + '-' + (month + 1 < 10 ? '0' : '') + (month + 1) + '-' + (day < 10 ? '0' : '') + day;
        var info = calDayAvail(date, periods, holidays);
        var title = UI.WEEKDAYS[calWeekday(date)] + ' ' + UI.fmtDateShort(date) +
          (info.state === 'holiday' ? ' — عطلة: ' + holidays[date] :
            info.state === 'weekend' ? ' — عطلة أسبوعية' :
            info.state === 'none' ? '' : ' — ' + calFreePeriodsLabel(info.freeCount));
        html += '<button type="button" class="' + calDayCellClass(date, info, today) + '" data-cf-grid-date="' + date + '" title="' + UI.escapeHtml(title) + '">' +
          calDayCellInner(day, info) + '</button>';
      }
      var total = lead + daysInMonth;
      for (var t = total; t % 7 !== 0; t++) html += '<span class="cf-grid-blank"></span>';
      html += '</div>';
      return html;
    }

    // لوحة فترات اليوم المفتوح أسفل الشبكة: شرائح الفترات بحالات
    // v2.2 نفسها (المحددات .cf-period-chip + data-cf-chip-date /
    // data-cf-chip-period ثابتة) + تفاصيل المحجوز + منتقيات قاعة
    // الجلسات المختارة. تحمل data-cf-date ليبقى إدراج صفوف القاعة
    // والتفاصيل يعمل كما في v2.2.
    function calDayPanelHtml(date, periods, holidays, today) {
      var d = UI.parseDateStr(date);
      var label = UI.WEEKDAYS[d.getDay()] + ' ' + UI.fmtDateShort(date);
      var isHoliday = !!holidays[date];
      var isWeekend = calIsWeekend(date);
      var html = '<div class="cf-day-panel" data-cf-date="' + date + '">' +
        '<div class="cf-panel-head">' +
        '<strong>' + UI.escapeHtml(label) + '</strong>';
      if (date === today) html += '<span class="pill pill-navy">اليوم</span>';
      if (isHoliday) html += '<span class="pill pill-amber">عطلة: ' + UI.escapeHtml(holidays[date]) + '</span>';
      if (isWeekend && !isHoliday) html += '<span class="pill pill-amber">عطلة أسبوعية</span>';
      // ملخص توفر اليوم (v2.2) — يُحسب من بيانات الإشغال نفسها.
      if (!isHoliday && !isWeekend && periods.length) {
        var freeCount = 0;
        periods.forEach(function (p) {
          if (calSlotState(date, p.id).state !== 'busy') freeCount++;
        });
        html += '<span class="cf-day-summary muted">' + UI.escapeHtml(calFreePeriodsLabel(freeCount)) + '</span>';
      }
      html += '<button type="button" class="btn btn-outline btn-sm cf-panel-close">إغلاق</button></div>';
      if (isHoliday || isWeekend) {
        // جلسات حالية في يوم عطلة (وُجدت قبل تسجيل العطلة أو قبل
        // تغيير أيام العطلة الأسبوعية): تُعرض قاعاتها فقط — بلا
        // شرائح لإضافة جلسات جديدة.
        var closedPicks = periods.filter(function (p) { return calPicks[date + '|' + p.id]; });
        html += '<div class="muted">' + (closedPicks.length ?
          (isHoliday ? 'يوم عطلة — لا يمكن إضافة جلسات جديدة؛ الجلسات الحالية معروضة أدناه.' :
            'يوم عطلة أسبوعية — لا يمكن إضافة جلسات جديدة؛ الجلسات الحالية معروضة أدناه.') :
          (isHoliday ? 'لا جلسات في أيام العطل.' : 'لا جلسات في أيام العطلة الأسبوعية.')) + '</div>';
        if (closedPicks.length) {
          html += '<div class="cf-day-halls">';
          closedPicks.forEach(function (p) { html += calHallRowHtml(calPicks[date + '|' + p.id]); });
          html += '</div>';
        }
      } else if (!periods.length) {
        html += '<div class="muted">لا فترات تدريبية معرّفة — أضف فترة من إعدادات المنصة أولاً.</div>';
      } else {
        // مع فلتر «المتاحة فقط»: تُخفى الشرائح المحجوزة كلياً (عدا
        // المختارة منها — لتُبقى قابلة للإلغاء)؛ وإن لم يبقَ شيء
        // يُطوى اليوم في سطر واحد.
        var visiblePeriods = periods.filter(function (p) {
          var key = date + '|' + p.id;
          if (calPicks[key]) return true;
          if (calFreeOnly && calSlotState(date, p.id).state === 'busy') return false;
          return true;
        });
        if (!visiblePeriods.length) {
          html += '<div class="muted">لا فترات حرة في هذا اليوم.</div>';
        } else {
          html += '<div style="display:flex;flex-wrap:wrap;gap:6px">';
          visiblePeriods.forEach(function (p) {
            var key = date + '|' + p.id;
            var st = calSlotState(date, p.id);
            var stateClass = st.state === 'free' ? ' cf-chip-free' : (st.state === 'partial' ? ' cf-chip-partial' : ' cf-chip-busy');
            html += '<button type="button" class="chip cf-period-chip' + stateClass + (calPicks[key] ? ' active' : '') +
              '" data-cf-chip-date="' + date + '" data-cf-chip-period="' + UI.escapeHtml(p.id) + '">' +
              '<span class="cf-chip-main">' + UI.escapeHtml(p.label) + ' <span class="ltr">' + UI.escapeHtml(fmtRange12(p.start, p.end)) + '</span></span>' +
              '<span class="cf-chip-status">' + UI.escapeHtml(calSlotStatusText(st)) + '</span></button>';
          });
          html += '</div><div class="cf-chip-detail-slot"></div><div class="cf-day-halls">';
          periods.forEach(function (p) {
            var key = date + '|' + p.id;
            if (calPicks[key]) html += calHallRowHtml(calPicks[key]);
          });
          html += '</div>';
        }
      }
      html += '</div>';
      return html;
    }

    // تحديث خلية يوم واحد في الشبكة بعد تبديل شريحة (دون إعادة
    // رسم كاملة — للحفاظ على موضع التمرير والتركيز).
    function calSyncGridDay(date) {
      var cell = card.querySelector('[data-cf-grid-date="' + date + '"]');
      if (!cell) return;
      var periods = sortedPeriods();
      var holidays = {};
      App.Store.getAll('holidays').forEach(function (h) { holidays[h.date] = h.name; });
      var info = calDayAvail(date, periods, holidays);
      cell.className = calDayCellClass(date, info, UI.todayStr());
      cell.innerHTML = calDayCellInner(UI.parseDateStr(date).getDate(), info);
    }

    // رسم الرزنامة (v2.3): شبكة شهر واحد + لوحة فترات اليوم
    // المفتوح أسفلها (إن كان ضمن الشهر المعروض). resetSpan
    // (تغيّر عدد الجلسات/تاريخ البدء/الأيام المفضلة) يعيد الشهر
    // إلى شهر أول جلسة مختارة، وإلا شهر تاريخ البدء. زر «إظهار
    // أسابيع إضافية» مخفي دائماً — التنقل بين الأشهر يغني عنه.
    function renderCalendar(resetSpan) {
      var calEl = card.querySelector('#cf-calendar');
      if (!calEl) return;
      calOccupied = buildHallOccupancy(isEdit ? course.id : null);
      calOccupiedDetail = buildHallOccupancyDetail(isEdit ? course.id : null, calCourseTypeVal());
      calDetailKey = null;
      // رسالة التعبئة الذكية تُمسح عند أي إعادة رسم (تغيّر السياق).
      var noteEl = card.querySelector('#cf-cal-smart-note');
      if (noteEl) { noteEl.textContent = ''; noteEl.hidden = true; }
      var periods = sortedPeriods();
      var startDate = calStartDateVal();
      var picks = calPicksList();
      if (resetSpan || !calGridMonth) {
        var anchor = picks.length ? sortPicks(picks)[0].date : startDate;
        calGridMonth = calMonthKey(anchor) || calMonthKey(UI.todayStr());
      }
      var holidays = {};
      App.Store.getAll('holidays').forEach(function (h) { holidays[h.date] = h.name; });
      var today = UI.todayStr();
      var html = calMonthGridHtml(periods, holidays, today);
      if (calExpandedDate && calMonthKey(calExpandedDate) === calGridMonth) {
        html += calDayPanelHtml(calExpandedDate, periods, holidays, today);
      }
      calEl.innerHTML = html;
      var moreBtn = card.querySelector('#cf-cal-more');
      if (moreBtn) moreBtn.hidden = true;
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
      // اختيارات بفترات محذوفة (حُذفت الفترة بعد إنشاء الجلسة):
      // تُذكر في العداد حتى لا تكون صامتة. (v2.3: الشرائح تظهر
      // لليوم المفتوح فقط، فلا يُقاس «غير المعروض» من الـ DOM —
      // وجود الفترة في المتجر هو المعيار.)
      var invisible = 0;
      picks.forEach(function (p) {
        if (!App.Store.get('periods', p.periodId)) invisible++;
      });
      if (summaryEl) {
        var remaining = sc > 0 ? sc - picks.length : 0;
        summaryEl.textContent = 'تم اختيار ' + picks.length + ' جلسة' + (sc > 0 ? ' من ' + sc + ' مطلوبة' : '') +
          (remaining > 0 ? ' — متبقّي ' + remaining : '') +
          (invisible ? ' (منها ' + invisible + ' جلسة بفترات محذوفة غير معروضة)' : '');
        summaryEl.style.color = over ? '#B91C1C' : '';
      }
      // زر «إكمال النمط» يظهر فقط عند كشف نمط واضح وجلسات متبقية.
      var patternBtn = card.querySelector('#cf-cal-pattern');
      if (patternBtn) {
        var pattern = calDetectPattern();
        var showPattern = !!pattern && sc > 0 && picks.length < sc;
        patternBtn.hidden = !showPattern;
        if (showPattern) patternBtn.textContent = 'إكمال النمط (' + pattern.label + ')';
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
      // النقر على شريحة فترة يبدّل اختيارها جلسةً؛ والنقر على شريحة
      // محجوزة كلياً (غير مختارة) يعرض سبب الحجز بدل الاختيار.
      calEl.addEventListener('click', function (e) {
        // تنقل الشبكة الشهرية (v2.3): السابق/التالي/اليوم.
        var navBtn = e.target && e.target.closest ? e.target.closest('#cf-cal-prev, #cf-cal-next, #cf-cal-today') : null;
        if (navBtn && calEl.contains(navBtn)) {
          if (navBtn.id === 'cf-cal-prev') calGridMonth = calShiftMonth(calGridMonth, -1);
          else if (navBtn.id === 'cf-cal-next') calGridMonth = calShiftMonth(calGridMonth, 1);
          else { calGridMonth = calMonthKey(UI.todayStr()); calExpandedDate = UI.todayStr(); }
          renderCalendar(false);
          return;
        }
        // زر إغلاق لوحة اليوم المفتوح.
        var panelClose = e.target && e.target.closest ? e.target.closest('.cf-panel-close') : null;
        if (panelClose && calEl.contains(panelClose)) {
          calExpandedDate = null;
          renderCalendar(false);
          return;
        }
        // النقر على يوم في الشبكة يفتح لوحة فتراته (أو يغلقها
        // إن كان مفتوحاً)؛ النقر على يوم آخر ينقل اللوحة إليه.
        var gridDay = e.target && e.target.closest ? e.target.closest('[data-cf-grid-date]') : null;
        if (gridDay && calEl.contains(gridDay)) {
          var gd = gridDay.getAttribute('data-cf-grid-date');
          calExpandedDate = (calExpandedDate === gd) ? null : gd;
          renderCalendar(false);
          return;
        }
        // زر «اختيار هذه الفترة» داخل تفاصيل شريحة محجوزة.
        var detailPick = e.target && e.target.closest ? e.target.closest('[data-cf-detail-pick]') : null;
        if (detailPick && calEl.contains(detailPick)) {
          var dpKey = detailPick.getAttribute('data-cf-detail-pick');
          var dpParts = dpKey.split('|');
          var dpDate = dpParts[0];
          var dpPeriod = dpParts[1];
          if (!calPicks[dpKey]) {
            calPicks[dpKey] = { date: dpDate, periodId: dpPeriod, hallId: calDefaultHallVal() };
            var dpChip = calEl.querySelector('[data-cf-chip-date="' + dpDate + '"][data-cf-chip-period="' + dpPeriod + '"]');
            if (dpChip) dpChip.classList.add('active');
            var dpDayHalls = calEl.querySelector('[data-cf-date="' + dpDate + '"] .cf-day-halls');
            if (dpDayHalls) dpDayHalls.insertAdjacentHTML('beforeend', calHallRowHtml(calPicks[dpKey]));
          }
          calSyncGridDay(dpDate);
          calCloseDetail();
          calRefreshSummary();
          return;
        }
        var chip = e.target && e.target.closest ? e.target.closest('[data-cf-chip-date]') : null;
        if (!chip || !calEl.contains(chip)) return;
        var date = chip.getAttribute('data-cf-chip-date');
        var periodId = chip.getAttribute('data-cf-chip-period');
        var key = date + '|' + periodId;
        if (!calPicks[key] && chip.classList.contains('cf-chip-busy')) {
          if (calDetailKey === key) {
            calCloseDetail();
          } else {
            calCloseDetail();
            calDetailKey = key;
            var slot = calEl.querySelector('[data-cf-date="' + date + '"] .cf-chip-detail-slot');
            if (slot) slot.innerHTML = calSlotDetailHtml(date, periodId);
          }
          return;
        }
        calCloseDetail();
        if (calPicks[key]) {
          delete calPicks[key];
          chip.classList.remove('active');
          var row = calEl.querySelector('[data-cf-hallrow="' + key + '"]');
          if (row && row.parentNode) row.parentNode.removeChild(row);
        } else {
          calPicks[key] = { date: date, periodId: periodId, hallId: calDefaultHallVal() };
          chip.classList.add('active');
          var dayHalls = calEl.querySelector('[data-cf-date="' + date + '"] .cf-day-halls');
          if (dayHalls) dayHalls.insertAdjacentHTML('beforeend', calHallRowHtml(calPicks[key]));
        }
        calSyncGridDay(date);
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
        if (defaultHallSel.value === '__new__') {
          defaultHallSel.value = '';
          openQuickAddModal('hall', function (newId) {
            refreshDirectorySelects();
            var dh = card.querySelector('#cf-cal-defaulthall');
            if (dh) dh.value = newId;
          });
          return;
        }
        // تغيير القاعة الافتراضية يغيّر حالة التوفر على الشرائح
        // (القاعة المحددة بدل «أي قاعة حرة») — والاختيارات الحالية
        // لا تتأثر (القاعة الافتراضية تنطبق على الجديدة فقط).
        renderCalendar(false);
      });
    }
    // تغيير نوع الدورة (v2.3 — W3) يغيّر حالة التوفر على الشرائح
    // (قاعات النوع المطابق فقط) — والاختيارات الحالية لا تتأثر.
    var courseTypeSel = card.querySelector('[name="courseType"]');
    if (courseTypeSel) {
      courseTypeSel.addEventListener('change', function () {
        renderCalendar(false);
      });
    }
    var freeOnlyBtn = card.querySelector('#cf-cal-freeonly');
    if (freeOnlyBtn) freeOnlyBtn.addEventListener('click', function () {
      calFreeOnly = !calFreeOnly;
      freeOnlyBtn.classList.toggle('btn-outline', !calFreeOnly);
      freeOnlyBtn.setAttribute('aria-pressed', calFreeOnly ? 'true' : 'false');
      renderCalendar(false);
    });
    var smartFillBtn = card.querySelector('#cf-cal-smartfill');
    if (smartFillBtn) smartFillBtn.addEventListener('click', calSmartFill);
    var patternBtnEl = card.querySelector('#cf-cal-pattern');
    if (patternBtnEl) patternBtnEl.addEventListener('click', calCompletePattern);
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
    var customNameInput = form.querySelector('[name="customName"]');
    var customName = customNameInput ? customNameInput.value.trim() : '';
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
    // نوع الدورة (v2.3 — W3): إداري افتراضياً؛ يُحفظ مع الدورة
    // ويُمرَّر إلى إنشاء الجلسات لمطابقة القاعات.
    var courseTypeEl = form.querySelector('[name="courseType"]');
    var courseType = (courseTypeEl && courseTypeEl.value === 'technical') ? 'technical' : 'admin';

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
          directorateId: (function () { var v = form.querySelector('[name="newTraineeDirectorate"]').value; return (v && v !== '__new__') ? v : null; })(),
          phone: form.querySelector('[name="newTraineePhone"]').value.trim(),
          notes: form.querySelector('[name="newTraineeNotes"]').value.trim()
        }).then(function (id) { traineeIds.push(id); return ctx; });
      });
    }

    chain.then(function (ctx) {
      var data = {
        name: name,
        customName: customName || null,
        code: code,
        level: level,
        courseType: courseType,
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
      data.groupNumber = App.nextGroupNumber();
      return window.TadreebDB.add('courses', data).then(function (id) {
        return { courseId: id, edited: false };
      });
    }).then(function (res) {
      if (res.reschedulePending) return; // نافذة التأكيد تتولى الباقي
      if (res.edited) {
        UI.setBtnLoading(submitBtn, false);
        close();
        UI.toast('تم حفظ تعديلات مجموعة التدريب', 'success');
        return App.refresh();
      }
      // إنشاء جلسات الدورة الجديدة من اختيارات الرزنامة (v2.1) —
      // سجلات مطابقة لما ينتجه توليد الجدول، وتُعرض نافذة النتيجة نفسها.
      return createPickedSessions(res.courseId, picks, courseType).then(function (result) {
        UI.setBtnLoading(submitBtn, false);
        close();
        UI.toast('تم إنشاء مجموعة التدريب وتوليد الجدول', 'success');
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
      UI.formError(form, err && err.message ? err.message : 'تعذّر حفظ مجموعة التدريب');
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
      title: 'تغيير تاريخ بدء مجموعة التدريب',
      bodyHTML: '<p>سيتم تغيير تاريخ بدء مجموعة التدريب إلى ' + UI.escapeHtml(UI.fmtDate(newStartDate)) +
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
              UI.toast('تم تغيير تاريخ بدء مجموعة التدريب وإعادة توليد ' + result.created + ' جلسة', 'success');
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
    if (result.skippedWeekend) {
      body += '<p>تُخطي <strong>' + result.skippedWeekend + '</strong> يوم عطلة أسبوعية (بلا جلسات).</p>';
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
      container.innerHTML = '<div class="error-view"><div class="error-title">مجموعة التدريب غير موجودة</div>' +
        '<p>ربما حُذفت مجموعة التدريب هذه.</p><button class="btn" type="button" id="cd-back-btn">العودة إلى مجموعات التدريب</button></div>';
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
    var detailDisplayName = App.groupDisplayName(course);
    var detailAutoName = App.groupAutoName(course);
    html += '<div class="page-head"><div><a class="back-link" href="#" id="cd-back">العودة إلى مجموعات التدريب</a>' +
      '<h1>' + UI.escapeHtml(detailDisplayName) + '</h1>' +
      (App.customGroupName(course) ? '<div class="group-auto-subtitle">' + UI.escapeHtml(detailAutoName) + '</div>' : '') +
      '<div class="muted">' + UI.escapeHtml(UI.daysLabel(course.days)) + ' · ' +
      UI.escapeHtml(period ? period.label : '') + '</div></div>' +
      '<div class="head-actions">' + UI.pillForCourseStatus(course.status) +
      '<button class="btn btn-outline btn-sm" type="button" id="cd-export-btn">تصدير ملف مجموعة التدريب ↓</button>' +
      (canWrite ? '<button class="btn btn-outline btn-sm" type="button" id="cd-edit-btn">تعديل مجموعة التدريب</button>' : '') +
      '</div></div>';

    // البطاقات الوصفية
    var contractHtml = '';
    if (contract) {
      if (contract.type === 'fixed') {
        contractHtml = 'الأجر: ثابت لمجموعة التدريب كاملة · ' + UI.fmtMoney(contract.amount);
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
      '<div class="meta-box"><div class="k">رقم المجموعة</div><div class="v">' +
      UI.escapeHtml(String(App.groupNumber(course))) + '</div></div>' +
      '<div class="meta-box"><div class="k">الدورة</div><div class="v">' +
      UI.escapeHtml(course.name) + '</div></div>' +
      '<div class="meta-box"><div class="k">المستوى</div><div class="v">' +
      UI.escapeHtml(App.levelName(course.level)) + '</div></div>' +
      '<div class="meta-box"><div class="k">نوع مجموعة التدريب</div><div class="v">' +
      UI.escapeHtml(courseTypeLabel(typeOfCourse(course))) + '</div></div>' +
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
      '<div class="meta-box"><div class="k">مديريات المتدربين</div><div class="v">' +
      UI.escapeHtml(App.groupDirectoratesSummary(course) || '—') + '</div></div>' +
      dayPlanMetaHtml(course) +
      '</div>';

    // التقدم
    html += '<div class="card"><div class="section-title-row"><strong>التقدم في مجموعة التدريب</strong>' +
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
      : 'المتدربون: قائمة مجموعة التدريب (' + trainees.length + ')';
    html += '<div class="card"><h2>المتدربون (' + trainees.length + ')</h2>' +
      '<div class="muted" style="margin-bottom:10px">' + UI.escapeHtml(traineesSource) + '</div>';
    if (!trainees.length) {
      html += '<div class="muted">' + (course.groupId ?
        'لا متدربين في مجموعة التدريب هذه بعد — أضف أعضاء إلى المجموعة من الدليل.' :
        'لا متدربين في مجموعة التدريب هذه بعد — أضفهم من تعديل مجموعة التدريب.') + '</div>';
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
              '<button class="btn btn-danger btn-sm" type="button" data-trainee-remove="' + UI.escapeHtml(t.id) + '">إزالة من مجموعة التدريب</button>') +
            '</div>';
        }
        html += '</div>';
      });
    }
    html += '</div>';

    // ملاحظات الدورة
    html += '<div class="card"><h2>ملاحظات مجموعة التدريب</h2><div id="cd-notes"></div></div>';

    // الميزانية
    var spentPct = budget.allocated > 0 ? Math.min(100, Math.round((budget.totalSpent / budget.allocated) * 100)) : 0;
    html += '<div class="card"><div class="section-title-row"><h2 style="margin:0">ميزانية مجموعة التدريب</h2>' +
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
        section: 'course', title: 'إحصاءات مجموعة التدريب', metrics: courseRes.metrics,
        export: { label: 'تصدير ملف مجموعة التدريب ↓', onClick: function () { openCourseFileExport(); } }
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
        UI.confirmDialog('إزالة المتدرب من مجموعة التدريب', 'هل أنت متأكد من إزالة «' + t.name + '» من مجموعة التدريب هذه؟ يبقى المتدرب مسجلاً في الدليل.',
          function () {
            var ids = (course.traineeIds || []).filter(function (id) { return id !== t.id; });
            window.TadreebDB.update('courses', course.id, { traineeIds: ids }).then(function () {
              UI.toast('تمت إزالة المتدرب من مجموعة التدريب', 'success');
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
        title: 'تصدير ملف مجموعة التدريب',
        sections: [
          { id: 'info', label: 'معلومات مجموعة التدريب', checked: true },
          { id: 'schedule', label: 'جدول الجلسات', checked: true },
          { id: 'trainees', label: 'أسماء المتدربين', checked: true },
          { id: 'attendance', label: 'الحضور والغياب', checked: true },
          { id: 'budget', label: 'الميزانية', checked: true }
        ],
        onConfirm: function (result) {
          UI.toast('جارٍ تجهيز ملف مجموعة التدريب…');
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
          { id: 'info', label: 'معلومات مجموعة التدريب', checked: true },
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
          { id: 'all', label: 'كل جلسات مجموعة التدريب' }
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
        if (!allSessions.length) fields = '<div class="muted">لا توجد جلسات في مجموعة التدريب هذه بعد.</div>';
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
      '<label class="check-row"><input type="radio" name="payType" value="fixed"' + (!course.trainerContract || course.trainerContract.type === 'fixed' ? ' checked' : '') + '> أجرة ثابتة لمجموعة التدريب كاملة</label>' +
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
          UI.toast('تمت إزالة المدرب من مجموعة التدريب', 'success');
          App.refresh();
        }).catch(function (err) { UI.setBtnLoading(submitBtn, false); UI.toastError(err); });
        return;
      }
      if (trainerSel === '__new__' && !newTrainerName) { UI.formError(form, 'اكتب اسم المدرب الجديد'); return; }
      var amount = parseInt(form.querySelector('[name="amount"]').value, 10) || 0;
      var rate = parseInt(form.querySelector('[name="rate"]').value, 10) || 0;
      if (payType === 'fixed' && amount <= 0) { UI.formError(form, 'أدخل المبلغ الثابت لمجموعة التدريب'); return; }
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
      '<div class="field-hint">تُنشأ الجلسات الجديدة فقط — الجلسات الموجودة لا تتكرر، والعطل وأيام العطلة الأسبوعية تُتخطى.</div></div>',
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
    // القاعات مرتبة: المطابقة لنوع الدورة أولاً، مع تسمية النوع في كل خيار (v2.3).
    var wantHallType = typeOfCourse(course) === 'technical' ? 'computer' : 'admin';
    var hallsSorted = App.Store.getAll('halls').slice().sort(function (a, b) {
      return (typeOfHall(a) === wantHallType ? 0 : 1) - (typeOfHall(b) === wantHallType ? 0 : 1);
    });
    var fields = '<div class="form-grid">' +
      '<div class="field"><label>التاريخ *</label><input type="date" name="date" required value="' + UI.todayStr() + '"></div>' +
      '<div class="field"><label>الفترة *</label><select name="periodId" required>' +
      periods.map(function (p) {
        return '<option value="' + UI.escapeHtml(p.id) + '"' + (p.id === course.periodId ? ' selected' : '') + '>' +
          UI.escapeHtml(App.displayCode(p, 'periods') + ' — ' + p.label) + ' (' + UI.escapeHtml(fmtRange12(p.start, p.end)) + ')</option>';
      }).join('') + '</select></div>' +
      '<div class="field field-full"><label>القاعة</label><select name="hallId"><option value="">بدون قاعة (تُعيَّن لاحقاً)</option>' +
      hallsSorted.map(function (h) {
        return '<option value="' + UI.escapeHtml(h.id) + '">' + UI.escapeHtml(App.displayCode(h, 'halls') + ' — ' + h.name + ' (' + (typeOfHall(h) === 'computer' ? 'حاسوب' : 'إدارية') + ')') + '</option>';
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
      window.TadreebDB.checkHallAvailability(date, periodId, typeOfCourse(course)).then(function (rows) {
        availEl.innerHTML = hallAvailabilityListHtml(rows);
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

  // تغيير قاعة جلسة (v2.3 — نوع القاعة): النقل ضمن النوع نفسه
  // يمر عادياً؛ النقل بين نوعين مختلفين (إدارية ↔ حاسوب) يُظهر
  // تحذيراً ويتطلب تأكيداً صريحاً بخانة اختيار. نوع القاعة الغائب
  // يُعامل إداريةً. التحقق من التعارض (v2.1) باقٍ عبر updateSession.
  function openSessionHallModal(sessionId) {
    var s = App.Store.get('sessions', sessionId);
    // نوع القاعة (مصدر الحقيقة TadreebDB.hallTypeOf — الحقل
    // hallType؛ الاحتياطي يقرأ hallType ثم type؛ الغائب = إدارية).
    function hallTypeOf(h) {
      try {
        if (window.TadreebDB && typeof window.TadreebDB.hallTypeOf === 'function') {
          var t = window.TadreebDB.hallTypeOf(h);
          if (t === 'computer' || t === 'admin') return t;
        }
      } catch (e) { /* احتياطي أدناه */ }
      return (h && (h.hallType === 'computer' || h.type === 'computer')) ? 'computer' : 'admin';
    }
    function hallTypeLabel(t) { return t === 'computer' ? 'حاسوب' : 'إدارية'; }
    function hallLabel(h) {
      return App.displayCode(h, 'halls') + ' — ' + h.name + ' (' + hallTypeLabel(hallTypeOf(h)) + ')';
    }
    var fields = '<div class="field"><label>القاعة</label><select name="hallId"><option value="">بدون قاعة</option>' +
      App.Store.getAll('halls').map(function (h) {
        return '<option value="' + UI.escapeHtml(h.id) + '"' + (s.hallId === h.id ? ' selected' : '') + '>' + UI.escapeHtml(hallLabel(h)) + '</option>';
      }).join('') + '</select><div class="field-hint" id="sh-availability">جارٍ فحص توفر القاعات…</div></div>' +
      '<div class="hall-type-warn" data-cross-type-warn hidden>' +
      '<strong>تحذير: نقل إلى نوع قاعة مختلف</strong><div data-cross-type-detail></div>' +
      '<label class="check-row" style="margin-top:8px"><input type="checkbox" name="crossTypeConfirm"> أؤكد النقل إلى قاعة من نوع مختلف</label></div>';
    var crossGuard = null;
    var modal = UI.openFormModal('تغيير قاعة الجلسة — ' + UI.fmtDateFull(s.date), fields, function (form, close, submitBtn) {
      var hallId = form.querySelector('[name="hallId"]').value || null;
      if (crossGuard && !crossGuard()) return;
      UI.setBtnLoading(submitBtn, true);
      // عبر updateSession (لا update العام) ليفحص التعارض قبل الحفظ.
      window.TadreebDB.updateSession(sessionId, { hallId: hallId }).then(function () {
        UI.setBtnLoading(submitBtn, false);
        close();
        UI.toast('تم تغيير قاعة الجلسة', 'success');
        App.refresh();
      }).catch(function (err) { UI.setBtnLoading(submitBtn, false); UI.toastError(err); });
    }, { submitLabel: 'حفظ', width: 'normal' });
    if (modal.element) {
      // حارس النقل بين النوعين (نفس منطق screens-session.js).
      (function () {
        var sel = modal.element.querySelector('[name="hallId"]');
        var warnEl = modal.element.querySelector('[data-cross-type-warn]');
        var detailEl = modal.element.querySelector('[data-cross-type-detail]');
        var confirmBox = modal.element.querySelector('[name="crossTypeConfirm"]');
        var formEl = modal.element.querySelector('form') || modal.element;
        if (!sel || !warnEl) { crossGuard = function () { return true; }; return; }
        var currentHall = s.hallId ? App.Store.get('halls', s.hallId) : null;
        function refresh() {
          var targetId = sel.value || null;
          var target = targetId ? App.Store.get('halls', targetId) : null;
          var cross = !!(currentHall && target && targetId !== s.hallId &&
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
        crossGuard = function () {
          if (!refresh()) return true;
          if (confirmBox && confirmBox.checked) return true;
          UI.formError(formEl, 'أكّد النقل إلى قاعة من نوع مختلف بوضع علامة في خانة التأكيد');
          return false;
        };
      })();
    }
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
