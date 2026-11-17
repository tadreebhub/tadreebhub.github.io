// تدريب — شاشة الدليل: المدربون، القاعات، المديريات، المتدربون،
// الفترات التدريبية، العطل، فئات الميزانية.
// تُسجَّل في window.Screens.directory.
(function () {
  'use strict';

  function render(container) {
    var Store = App.Store;
    var canWrite = App.canWrite();
    var trainers = Store.getAll('trainers').slice().sort(byName);
    var halls = Store.getAll('halls').slice().sort(byName);
    var directorates = Store.getAll('directorates').slice().sort(byName);
    var trainees = Store.getAll('trainees').slice().sort(byName);
    var periods = Store.getAll('periods').slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var holidays = Store.getAll('holidays').slice().sort(function (a, b) { return (a.date || '') < (b.date || '') ? -1 : 1; });
    var categories = Store.getAll('budgetCategories').slice().sort(byName);

    function byName(a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'ar'); }

    var html = '';
    html += '<div class="page-head"><div><h1>الدليل</h1>' +
      '<div class="muted">المدربون والقاعات والمديريات والمتدربون والفترات والعطل</div></div>' +
      '<div class="head-actions"><button class="btn btn-outline btn-sm" type="button" id="dir-export-btn">تصدير إكسل ↓</button></div></div>';

    html += '<div class="dir-grid">';

    // المدربون
    html += '<div><h2>المدربون</h2>';
    if (!trainers.length) html += '<div class="muted">لا مدربين مسجلين.</div>';
    trainers.forEach(function (t) {
      var activeCount = Store.getAll('courses').filter(function (c) { return c.trainerId === t.id && c.status === 'active'; }).length;
      html += '<div class="person"><div class="p-name">' + UI.escapeHtml(t.name) + '</div>' +
        '<div class="muted">' + UI.escapeHtml(t.specialty || 'بلا تخصص') +
        (t.phone ? ' · <span class="ltr">' + UI.escapeHtml(t.phone) + '</span>' : '') +
        ' · ' + activeCount + ' دورة نشطة</div>' +
        actionRow('trainer', t.id, canWrite) + '</div>';
    });
    if (canWrite) html += '<button class="btn btn-outline btn-sm" type="button" data-add="trainer">إضافة مدرب</button>';
    html += '</div>';

    // القاعات
    html += '<div><h2>القاعات</h2>';
    if (!halls.length) html += '<div class="muted">لا قاعات مسجلة.</div>';
    halls.forEach(function (h) {
      var todayCount = Store.getAll('sessions').filter(function (s) { return s.hallId === h.id && s.date === UI.todayStr(); }).length;
      html += '<div class="person"><div class="p-name">' + UI.escapeHtml(h.name) + '</div>' +
        '<div class="muted">' + (h.capacity ? 'السعة: ' + UI.fmtNumber(h.capacity) + ' متدرباً · ' : '') +
        todayCount + ' جلسة اليوم</div>' +
        actionRow('hall', h.id, canWrite) + '</div>';
    });
    if (canWrite) html += '<button class="btn btn-outline btn-sm" type="button" data-add="hall">إضافة قاعة</button>';
    html += '</div>';

    // المديريات
    html += '<div><h2>المديريات</h2>';
    if (!directorates.length) html += '<div class="muted">لا مديريات مسجلة.</div>';
    directorates.forEach(function (d) {
      var count = Store.getAll('trainees').filter(function (t) { return t.directorateId === d.id; }).length;
      html += '<div class="person"><div class="p-name">' + UI.escapeHtml(d.name) + '</div>' +
        '<div class="muted">' + count + ' متدرباً مسجلاً</div>' +
        actionRow('directorate', d.id, canWrite) + '</div>';
    });
    if (canWrite) html += '<button class="btn btn-outline btn-sm" type="button" data-add="directorate">إضافة مديرية</button>';
    html += '</div>';

    html += '</div>';

    // المتدربون
    html += '<div class="card"><div class="section-title-row"><h2 style="margin:0">المتدربون (' + trainees.length + ')</h2>' +
      (canWrite ? '<button class="btn btn-sm" type="button" data-add="trainee">إضافة متدرب</button>' : '') + '</div>';
    if (!trainees.length) {
      html += UI.emptyState('لا متدربين مسجلين', 'أضف المتدربين هنا أو أثناء إنشاء دورة جديدة.', canWrite ? 'إضافة متدرب' : null, 'dir-empty-trainee');
    } else {
      html += '<div class="table-wrap"><table><thead><tr><th>الاسم</th><th>المديرية</th><th>رقم الهاتف</th><th>الحالة</th><th>ملاحظات</th><th>إجراءات</th></tr></thead><tbody>';
      trainees.forEach(function (t) {
        html += '<tr><td><strong>' + UI.escapeHtml(t.name) + '</strong></td>' +
          '<td>' + UI.escapeHtml(App.directorateName(t.directorateId) || '—') + '</td>' +
          '<td><span class="ltr">' + UI.escapeHtml(t.phone || '—') + '</span></td>' +
          '<td>' + UI.pillForTraineeStatus(t.status) + '</td>' +
          '<td>' + UI.escapeHtml(t.notes || '') + '</td>' +
          '<td>' + actionRow('trainee', t.id, canWrite) + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }
    html += '</div>';

    // الفترات التدريبية
    html += '<div class="card"><div class="section-title-row"><h2 style="margin:0">الفترات التدريبية</h2>' +
      (canWrite ? '<button class="btn btn-outline btn-sm" type="button" data-add="period"' + (periods.length >= 4 ? ' disabled title="الحد الأقصى 4 فترات"' : '') + '>إضافة فترة</button>' : '') +
      '</div><div class="period-grid">';
    if (!periods.length) html += '<div class="muted">لا فترات معرّفة.</div>';
    periods.forEach(function (p) {
      html += '<div class="meta-box"><div class="k">' + UI.escapeHtml(p.label) + '</div>' +
        '<div class="v">' + UI.fmtTimeRange(p.start, p.end) + '</div>' +
        actionRow('period', p.id, canWrite) + '</div>';
    });
    html += '</div><div class="muted">يمكن تعديل أوقات الفترات من هنا، وإضافة فترة رابعة عند الحاجة (الحد الأقصى 4 فترات).</div></div>';

    // العطل
    html += '<div class="card"><div class="section-title-row"><h2 style="margin:0">العطل</h2>' +
      (canWrite ? '<button class="btn btn-outline btn-sm" type="button" data-add="holiday">إضافة عطلة</button>' : '') +
      '</div>';
    if (!holidays.length) {
      html += '<div class="muted">لا عطل مسجلة — تُتخطى العطل تلقائياً عند توليد الجداول.</div>';
    } else {
      html += '<div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>اسم العطلة</th><th>إجراءات</th></tr></thead><tbody>';
      holidays.forEach(function (h) {
        html += '<tr><td>' + UI.escapeHtml(UI.fmtDateFull(h.date)) + '</td><td>' + UI.escapeHtml(h.name || '') + '</td>' +
          '<td>' + actionRow('holiday', h.id, canWrite) + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }
    html += '</div>';

    // فئات الميزانية
    html += '<div class="card"><div class="section-title-row"><h2 style="margin:0">فئات الميزانية</h2>' +
      (canWrite ? '<button class="btn btn-outline btn-sm" type="button" data-add="category">إضافة فئة</button>' : '') +
      '</div><div class="chips">';
    if (!categories.length) html += '<span class="muted">لا فئات معرّفة.</span>';
    categories.forEach(function (c) {
      html += '<span class="chip" style="cursor:default">' + UI.escapeHtml(c.name) +
        (canWrite ? ' <button class="link-btn danger" type="button" data-del-category="' + UI.escapeHtml(c.id) + '" style="padding:0 2px">✕</button>' : '') +
        '</span>';
    });
    html += '</div><div class="muted" style="margin-top:10px">تظهر هذه الفئات في نموذج إضافة المصروف لكل دورة.</div></div>';

    container.innerHTML = html;

    // ربط الأحداث
    container.querySelectorAll('[data-add]').forEach(function (btn) {
      btn.addEventListener('click', function () { openAddModal(btn.getAttribute('data-add')); });
    });
    var emptyTrainee = document.getElementById('dir-empty-trainee');
    if (emptyTrainee) emptyTrainee.addEventListener('click', function () { openAddModal('trainee'); });

    container.querySelectorAll('[data-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openEditModal(btn.getAttribute('data-edit'), btn.getAttribute('data-id'));
      });
    });
    container.querySelectorAll('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        deleteEntity(btn.getAttribute('data-del'), btn.getAttribute('data-id'));
      });
    });
    container.querySelectorAll('[data-notes]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openNotesModal(btn.getAttribute('data-notes'), btn.getAttribute('data-id'));
      });
    });
    container.querySelectorAll('[data-del-category]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var cat = App.Store.get('budgetCategories', btn.getAttribute('data-del-category'));
        UI.confirmDialog('حذف الفئة', 'هل أنت متأكد من حذف فئة «' + cat.name + '»؟ المصاريف المسجلة بهذه الفئة تبقى كما هي.',
          function () {
            window.TadreebDB.remove('budgetCategories', cat.id).then(function () {
              UI.toast('تم حذف الفئة', 'success');
              App.refresh();
            }).catch(UI.toastError);
          });
      });
    });

    document.getElementById('dir-export-btn').addEventListener('click', function () {
      UI.openPicker({
        title: 'تصدير الدليل',
        sections: [
          { id: 'trainers', label: 'المدربون', checked: true },
          { id: 'halls', label: 'القاعات', checked: true },
          { id: 'directorates', label: 'المديريات', checked: true },
          { id: 'trainees', label: 'المتدربون', checked: true }
        ],
        onConfirm: function (result) {
          var data = App.buildDirectoryData();
          if (result.sections.trainers === false) data.trainers = [];
          if (result.sections.halls === false) data.halls = [];
          if (result.sections.directorates === false) data.directorates = [];
          if (result.sections.trainees === false) data.trainees = [];
          UI.callExport('exportDirectory', [data]);
        }
      });
    });
  }

  function actionRow(type, id, canWrite) {
    var html = '<div class="p-actions row-actions">';
    html += '<button class="link-btn" type="button" data-notes="' + type + '" data-id="' + UI.escapeHtml(id) + '">ملاحظات</button>';
    if (canWrite) {
      html += '<button class="link-btn" type="button" data-edit="' + type + '" data-id="' + UI.escapeHtml(id) + '">تعديل</button>' +
        '<button class="link-btn danger" type="button" data-del="' + type + '" data-id="' + UI.escapeHtml(id) + '">حذف</button>';
    }
    html += '</div>';
    return html;
  }

  var ENTITY_META = {
    trainer: { col: 'trainers', label: 'المدرب', title: 'مدرب' },
    hall: { col: 'halls', label: 'القاعة', title: 'قاعة' },
    directorate: { col: 'directorates', label: 'المديرية', title: 'مديرية' },
    trainee: { col: 'trainees', label: 'المتدرب', title: 'متدرب' },
    period: { col: 'periods', label: 'الفترة التدريبية', title: 'فترة تدريبية' },
    holiday: { col: 'holidays', label: 'يوم العطلة', title: 'عطلة' }
  };

  function formFieldsFor(type, item) {
    item = item || {};
    switch (type) {
      case 'trainer':
        return '<div class="field"><label>الاسم *</label><input type="text" name="name" required value="' + UI.escapeHtml(item.name || '') + '"></div>' +
          '<div class="field"><label>التخصص</label><input type="text" name="specialty" value="' + UI.escapeHtml(item.specialty || '') + '"></div>' +
          '<div class="field"><label>رقم الهاتف</label><input type="text" name="phone" value="' + UI.escapeHtml(item.phone || '') + '"></div>';
      case 'hall':
        return '<div class="field"><label>اسم القاعة *</label><input type="text" name="name" required value="' + UI.escapeHtml(item.name || '') + '"></div>' +
          '<div class="field"><label>السعة (عدد المتدربين)</label><input type="number" name="capacity" min="0" value="' + UI.escapeHtml(item.capacity == null ? '' : item.capacity) + '"></div>';
      case 'directorate':
        return '<div class="field"><label>اسم المديرية *</label><input type="text" name="name" required value="' + UI.escapeHtml(item.name || '') + '"></div>';
      case 'trainee':
        return '<div class="field"><label>الاسم *</label><input type="text" name="name" required value="' + UI.escapeHtml(item.name || '') + '"></div>' +
          '<div class="field"><label>المديرية</label><select name="directorateId"><option value="">اختر المديرية</option>' +
          App.Store.getAll('directorates').map(function (d) {
            return '<option value="' + UI.escapeHtml(d.id) + '"' + (item.directorateId === d.id ? ' selected' : '') + '>' + UI.escapeHtml(d.name) + '</option>';
          }).join('') + '</select></div>' +
          '<div class="field"><label>رقم الهاتف</label><input type="text" name="phone" value="' + UI.escapeHtml(item.phone || '') + '"></div>' +
          '<div class="field"><label>الحالة</label><select name="status"><option value="">بلا حالة</option>' +
          Object.keys(UI.TRAINEE_STATUS_LABELS).map(function (k) {
            return '<option value="' + k + '"' + (item.status === k ? ' selected' : '') + '>' + UI.TRAINEE_STATUS_LABELS[k] + '</option>';
          }).join('') + '</select></div>' +
          '<div class="field"><label>ملاحظات</label><textarea name="notes">' + UI.escapeHtml(item.notes || '') + '</textarea></div>';
      case 'period': {
        var periods = App.Store.getAll('periods');
        var maxOrder = periods.reduce(function (m, p) { return Math.max(m, p.order || 0); }, 0);
        return '<div class="field"><label>اسم الفترة *</label><input type="text" name="label" required value="' + UI.escapeHtml(item.label || '') + '" placeholder="مثال: الفترة الرابعة"></div>' +
          '<div class="form-grid"><div class="field"><label>من *</label><input type="time" name="start" required value="' + UI.escapeHtml(item.start || '') + '"></div>' +
          '<div class="field"><label>إلى *</label><input type="time" name="end" required value="' + UI.escapeHtml(item.end || '') + '"></div></div>' +
          '<div class="field"><label>الترتيب</label><input type="number" name="order" min="1" max="4" value="' + UI.escapeHtml(item.order != null ? item.order : maxOrder + 1) + '"></div>';
      }
      case 'holiday':
        return '<div class="field"><label>التاريخ *</label><input type="date" name="date" required value="' + UI.escapeHtml(item.date || '') + '"></div>' +
          '<div class="field"><label>اسم العطلة *</label><input type="text" name="name" required value="' + UI.escapeHtml(item.name || '') + '" placeholder="مثال: عيد العمال"></div>';
      default:
        return '';
    }
  }

  function readFormData(type, form) {
    var v = function (name) {
      var el = form.querySelector('[name="' + name + '"]');
      return el ? el.value.trim() : '';
    };
    switch (type) {
      case 'trainer': return { name: v('name'), specialty: v('specialty'), phone: v('phone') };
      case 'hall': {
        var cap = form.querySelector('[name="capacity"]').value;
        return { name: v('name'), capacity: cap === '' ? null : parseInt(cap, 10) };
      }
      case 'directorate': return { name: v('name') };
      case 'trainee': return {
        name: v('name'),
        directorateId: form.querySelector('[name="directorateId"]').value || null,
        phone: v('phone'),
        status: form.querySelector('[name="status"]').value || null,
        notes: v('notes')
      };
      case 'period': return {
        label: v('label'),
        start: v('start'),
        end: v('end'),
        order: parseInt(form.querySelector('[name="order"]').value, 10) || 1
      };
      case 'holiday': return { date: v('date'), name: v('name') };
      default: return {};
    }
  }

  function validateFormData(type, data, form) {
    if (type === 'trainee' || type === 'trainer' || type === 'hall' || type === 'directorate' || type === 'holiday') {
      if (!data.name) { UI.formError(form, 'الاسم مطلوب'); return false; }
    }
    if (type === 'holiday' && !data.date) { UI.formError(form, 'التاريخ مطلوب'); return false; }
    if (type === 'period') {
      if (!data.label) { UI.formError(form, 'اسم الفترة مطلوب'); return false; }
      if (!data.start || !data.end) { UI.formError(form, 'وقتا البداية والنهاية مطلوبان'); return false; }
      if (data.start >= data.end) { UI.formError(form, 'وقت النهاية يجب أن يكون بعد وقت البداية'); return false; }
    }
    return true;
  }

  function openAddModal(type) {
    if (type === 'category') {
      UI.openFormModal('إضافة فئة ميزانية',
        '<div class="field"><label>اسم الفئة *</label><input type="text" name="name" required placeholder="مثال: مواصلات"></div>',
        function (form, close, submitBtn) {
          var name = form.querySelector('[name="name"]').value.trim();
          if (!name) { UI.formError(form, 'اسم الفئة مطلوب'); return; }
          UI.setBtnLoading(submitBtn, true);
          window.TadreebDB.add('budgetCategories', { name: name }).then(function () {
            UI.setBtnLoading(submitBtn, false);
            close();
            UI.toast('تمت إضافة الفئة', 'success');
            App.refresh();
          }).catch(function (err) { UI.setBtnLoading(submitBtn, false); UI.formError(form, err.message); });
        }, { submitLabel: 'إضافة الفئة', width: 'normal' });
      return;
    }
    var meta = ENTITY_META[type];
    if (!meta) return;
    if (type === 'period' && App.Store.getAll('periods').length >= 4) {
      UI.toast('الحد الأقصى 4 فترات تدريبية', 'error');
      return;
    }
    UI.openFormModal('إضافة ' + meta.title, formFieldsFor(type, null), function (form, close, submitBtn) {
      var data = readFormData(type, form);
      if (!validateFormData(type, data, form)) return;
      UI.formError(form, '');
      UI.setBtnLoading(submitBtn, true);
      window.TadreebDB.add(meta.col, data).then(function () {
        UI.setBtnLoading(submitBtn, false);
        close();
        UI.toast('تمت إضافة ' + meta.label, 'success');
        App.refresh();
      }).catch(function (err) { UI.setBtnLoading(submitBtn, false); UI.formError(form, err.message); });
    }, { submitLabel: 'إضافة', width: 'normal' });
  }

  function openEditModal(type, id) {
    var meta = ENTITY_META[type];
    if (!meta) return;
    var item = App.Store.get(meta.col, id);
    if (!item) return;
    UI.openFormModal('تعديل ' + meta.label, formFieldsFor(type, item), function (form, close, submitBtn) {
      var data = readFormData(type, form);
      if (!validateFormData(type, data, form)) return;
      UI.formError(form, '');
      UI.setBtnLoading(submitBtn, true);
      window.TadreebDB.update(meta.col, id, data).then(function () {
        UI.setBtnLoading(submitBtn, false);
        close();
        UI.toast('تم حفظ التعديلات', 'success');
        App.refresh();
      }).catch(function (err) { UI.setBtnLoading(submitBtn, false); UI.formError(form, err.message); });
    }, { submitLabel: 'حفظ التعديلات', width: 'normal' });
  }

  function deleteEntity(type, id) {
    var meta = ENTITY_META[type];
    if (!meta) return;
    var item = App.Store.get(meta.col, id);
    if (!item) return;
    var label = item.name || item.label || UI.fmtDate(item.date) || '';
    var warning = '';
    if (type === 'trainer') {
      var used = App.Store.getAll('courses').filter(function (c) { return c.trainerId === id; }).length;
      if (used) warning = ' هذا المدرب معيّن في ' + used + ' دورة — ستظهر تلك الدورات بلا مدرب.';
    }
    if (type === 'hall') {
      var sessCount = App.Store.getAll('sessions').filter(function (s) { return s.hallId === id; }).length;
      if (sessCount) warning = ' هذه القاعة معيّنة في ' + sessCount + ' جلسة — ستظهر تلك الجلسات بلا قاعة.';
    }
    if (type === 'directorate') {
      var trCount = App.Store.getAll('trainees').filter(function (t) { return t.directorateId === id; }).length;
      if (trCount) warning = ' هذه المديرية مرتبطة بـ ' + trCount + ' متدرباً — سيظهرون بلا مديرية.';
    }
    if (type === 'trainee') {
      var courseCount = App.Store.getAll('courses').filter(function (c) { return (c.traineeIds || []).indexOf(id) !== -1; }).length;
      if (courseCount) warning = ' هذا المتدرب مسجل في ' + courseCount + ' دورة — سيُزال منها تلقائياً عند حذف سجله.';
    }
    if (type === 'period') {
      var pCount = App.Store.getAll('courses').filter(function (c) { return c.periodId === id; }).length;
      if (pCount) warning = ' هذه الفترة مستخدمة في ' + pCount + ' دورة — ستظهر تلك الدورات بلا فترة.';
    }
    UI.confirmDialog('حذف ' + meta.label, 'هل أنت متأكد من حذف «' + label + '»؟ لا يمكن التراجع.' + warning,
      function () {
        var cleanup = Promise.resolve();
        if (type === 'trainee') {
          // إزالة المتدرب من كل الدورات المسجل فيها.
          var courses = App.Store.getAll('courses').filter(function (c) { return (c.traineeIds || []).indexOf(id) !== -1; });
          courses.forEach(function (c) {
            var ids = c.traineeIds.filter(function (x) { return x !== id; });
            cleanup = cleanup.then(function () { return window.TadreebDB.update('courses', c.id, { traineeIds: ids }); });
          });
        }
        cleanup.then(function () { return window.TadreebDB.remove(meta.col, id); }).then(function () {
          UI.toast('تم حذف ' + meta.label, 'success');
          App.refresh();
        }).catch(UI.toastError);
      });
  }

  function openNotesModal(type, id) {
    var meta = ENTITY_META[type];
    if (!meta) return;
    var item = App.Store.get(meta.col, id);
    if (!item) return;
    var label = item.name || item.label || UI.fmtDate(item.date) || '';
    var destroy = null;
    var m = UI.openModal({
      title: 'ملاحظات — ' + label,
      bodyHTML: '<div id="dir-notes-box"></div>',
      actions: [{ label: 'إغلاق', className: 'btn-outline', closeOnClick: true }],
      onClose: function () { if (typeof destroy === 'function') destroy(); }
    });
    destroy = UI.notesWidget(type, id, m.element.querySelector('#dir-notes-box'), { canWrite: App.canWrite() });
  }

  window.Screens.directory = { render: render };
})();
