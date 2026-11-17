// تدريب — شاشة الدليل: المدربون، المديريات، المجموعات التدريبية،
// القاعات، المتدربون.
// (الفترات التدريبية والعطل وفئات الميزانية تُدار من إعدادات المنصة
// منذ v1.1 — انظر window.Screens.settings في screens-admin.js.)
// تُسجَّل في window.Screens.directory.
(function () {
  'use strict';

  function render(container) {
    var Store = App.Store;
    var canWrite = App.canWrite();
    var trainers = Store.getAll('trainers').slice().sort(byName);
    var halls = Store.getAll('halls').slice().sort(byName);
    var directorates = Store.getAll('directorates').slice().sort(byName);
    var groups = Store.getAll('groups').slice().sort(byName);
    var trainees = Store.getAll('trainees').slice().sort(byName);

    function byName(a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'ar'); }

    var html = '';
    html += '<div class="page-head"><div><h1>الدليل</h1>' +
      '<div class="muted">المدربون والمديريات والمجموعات التدريبية والقاعات والمتدربون</div></div>' +
      '<div class="head-actions"><button class="btn btn-outline btn-sm" type="button" id="dir-export-btn">تصدير إكسل ↓</button></div></div>';

    // المدربون — جدول بيانات
    html += '<div class="card-white"><div class="section-title-row"><h2>المدربون (' + trainers.length + ')</h2>' +
      (canWrite ? '<button class="btn btn-sm" type="button" data-add="trainer">إضافة مدرب</button>' : '') + '</div>';
    if (!trainers.length) {
      html += UI.emptyState('لا مدربين مسجلين');
    } else {
      html += '<div class="table-wrap"><table><thead><tr><th>المعرّف</th><th>الاسم</th><th>التخصص</th><th>رقم الهاتف</th><th>عدد الدورات</th><th>إجراءات</th></tr></thead><tbody>';
      trainers.forEach(function (t) {
        var courseCount = Store.getAll('courses').filter(function (c) { return c.trainerId === t.id; }).length;
        html += '<tr><td><span class="pill pill-grey">' + UI.escapeHtml(App.displayCode(t, 'trainers')) + '</span></td><td><strong>' + UI.escapeHtml(t.name) + '</strong></td>' +
          '<td>' + UI.escapeHtml(t.specialty || 'بلا تخصص') + '</td>' +
          '<td><span class="ltr">' + UI.escapeHtml(t.phone || '—') + '</span></td>' +
          '<td>' + courseCount + '</td>' +
          '<td>' + actionRow('trainer', t.id, canWrite) + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }
    html += '</div>';

    // المديريات — جدول بيانات
    html += '<div class="card-white"><div class="section-title-row"><h2>المديريات (' + directorates.length + ')</h2>' +
      (canWrite ? '<button class="btn btn-sm" type="button" data-add="directorate">إضافة مديرية</button>' : '') + '</div>';
    if (!directorates.length) {
      html += UI.emptyState('لا مديريات مسجلة');
    } else {
      html += '<div class="table-wrap"><table><thead><tr><th>المعرّف</th><th>الاسم</th><th>عدد المجموعات</th><th>عدد الدورات</th><th>عدد المتدربين</th><th>إجراءات</th></tr></thead><tbody>';
      directorates.forEach(function (d) {
        var groupCount = Store.getAll('groups').filter(function (g) { return g.directorateId === d.id; }).length;
        var courseCount = Store.getAll('courses').filter(function (c) {
          return c.directorateId === d.id || (c.directorateIds || []).indexOf(d.id) !== -1;
        }).length;
        var traineeCount = Store.getAll('trainees').filter(function (t) { return t.directorateId === d.id; }).length;
        html += '<tr><td><span class="pill pill-grey">' + UI.escapeHtml(App.displayCode(d, 'directorates')) + '</span></td><td><strong>' + UI.escapeHtml(d.name) + '</strong></td>' +
          '<td>' + groupCount + '</td>' +
          '<td>' + courseCount + '</td>' +
          '<td>' + traineeCount + '</td>' +
          '<td>' + actionRow('directorate', d.id, canWrite) + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }
    html += '</div>';

    // المجموعات التدريبية — جدول بيانات
    html += '<div class="card-white"><div class="section-title-row"><h2>المجموعات التدريبية (' + groups.length + ')</h2>' +
      (canWrite ? '<button class="btn btn-sm" type="button" data-add="group">إضافة مجموعة</button>' : '') + '</div>';
    if (!groups.length) {
      html += UI.emptyState('لا مجموعات تدريبية مسجلة', 'المجموعة تنتمي إلى مديرية وتُعيَّن لدورة.');
    } else {
      html += '<div class="table-wrap"><table><thead><tr><th>المعرّف</th><th>الاسم</th><th>المديرية</th><th>عدد الأعضاء</th><th>عدد الدورات</th><th>إجراءات</th></tr></thead><tbody>';
      groups.forEach(function (g) {
        var courseCount = Store.getAll('courses').filter(function (c) { return c.groupId === g.id; }).length;
        html += '<tr><td><span class="pill pill-grey">' + UI.escapeHtml(App.displayCode(g, 'groups')) + '</span></td><td><strong>' + UI.escapeHtml(g.name) + '</strong></td>' +
          '<td>' + UI.escapeHtml(App.directorateName(g.directorateId) || '—') + '</td>' +
          '<td>' + (g.traineeIds || []).length + '</td>' +
          '<td>' + courseCount + '</td>' +
          '<td>' + actionRow('group', g.id, canWrite) + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }
    html += '</div>';

    // القاعات — قائمة بطاقات كما هي
    html += '<div class="card-white"><div class="section-title-row"><h2>القاعات (' + halls.length + ')</h2>' +
      (canWrite ? '<button class="btn btn-outline btn-sm" type="button" data-add="hall">إضافة قاعة</button>' : '') + '</div>';
    if (!halls.length) html += UI.emptyState('لا قاعات مسجلة');
    halls.forEach(function (h) {
      var todayCount = Store.getAll('sessions').filter(function (s) { return s.hallId === h.id && s.date === UI.todayStr(); }).length;
      html += '<div class="person"><div class="p-name">' + UI.escapeHtml(h.name) + ' <span class="pill pill-grey">' + UI.escapeHtml(App.displayCode(h, 'halls')) + '</span></div>' +
        '<div class="muted">' + (h.capacity ? 'السعة: ' + UI.fmtNumber(h.capacity) + ' متدرباً · ' : '') +
        todayCount + ' جلسة اليوم</div>' +
        actionRow('hall', h.id, canWrite) + '</div>';
    });
    html += '</div>';

    // المتدربون
    html += '<div class="card-white"><div class="section-title-row"><h2>المتدربون (' + trainees.length + ')</h2>' +
      (canWrite ? '<button class="btn btn-sm" type="button" data-add="trainee">إضافة متدرب</button>' : '') + '</div>';
    if (!trainees.length) {
      html += UI.emptyState('لا متدربين مسجلين', 'أضف المتدربين هنا أو أثناء إنشاء دورة جديدة.', canWrite ? 'إضافة متدرب' : null, 'dir-empty-trainee');
    } else {
      html += '<div class="table-wrap"><table><thead><tr><th>المعرّف</th><th>الاسم</th><th>المديرية</th><th>رقم الهاتف</th><th>الحالة</th><th>ملاحظات</th><th>إجراءات</th></tr></thead><tbody>';
      trainees.forEach(function (t) {
        html += '<tr><td><span class="pill pill-grey">' + UI.escapeHtml(App.displayCode(t, 'trainees')) + '</span></td><td><strong>' + UI.escapeHtml(t.name) + '</strong></td>' +
          '<td>' + UI.escapeHtml(App.directorateName(t.directorateId) || '—') + '</td>' +
          '<td><span class="ltr">' + UI.escapeHtml(t.phone || '—') + '</span></td>' +
          '<td>' + UI.pillForTraineeStatus(t.status) + '</td>' +
          '<td>' + UI.escapeHtml(t.notes || '') + '</td>' +
          '<td>' + actionRow('trainee', t.id, canWrite) + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }
    html += '</div>';

    // تلميح للمدير فقط: الفترات والعطل وفئات الميزانية انتقلت إلى الإعدادات.
    if (App.isAdmin()) {
      html += '<div class="muted">تُدار الفترات والعطل وفئات الميزانية من إعدادات المنصة.</div>';
    }

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

    document.getElementById('dir-export-btn').addEventListener('click', function () {
      UI.openPicker({
        title: 'تصدير الدليل',
        sections: [
          { id: 'trainers', label: 'المدربون', checked: true },
          { id: 'halls', label: 'القاعات', checked: true },
          { id: 'directorates', label: 'المديريات', checked: true },
          { id: 'groups', label: 'المجموعات التدريبية', checked: true },
          { id: 'trainees', label: 'المتدربون', checked: true }
        ],
        onConfirm: function (result) {
          var data = App.buildDirectoryData();
          if (result.sections.trainers === false) data.trainers = [];
          if (result.sections.halls === false) data.halls = [];
          if (result.sections.directorates === false) data.directorates = [];
          if (result.sections.groups === false) data.groups = [];
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
    group: { col: 'groups', label: 'المجموعة', title: 'مجموعة تدريبية' },
    trainee: { col: 'trainees', label: 'المتدرب', title: 'متدرب' }
  };

  // حقل المعرّف: عند الإنشاء يُملأ بالرمز التالي المتاح، وعند التعديل
  // بالرمز المخزَّن أو المشتق من ترتيب الإنشاء للسجلات القديمة — وفي
  // الحالتين يبقى قابلاً للتعديل، ويُثبَّت عند الحفظ.
  function codeFieldFor(type, item) {
    var meta = ENTITY_META[type];
    var value = (item && item.id)
      ? (item.code || App.displayCode(item, meta.col))
      : App.nextCode(meta.col);
    return '<div class="field"><label>المعرّف *</label><input type="text" name="code" required value="' + UI.escapeHtml(value) + '"></div>';
  }

  // ---------- أعضاء المجموعة (traineeIds حقل اختياري جديد —
  // المجموعات القديمة بلا الحقل تُعامل كقائمة أعضاء فارغة) ----------
  function memberLabel(t) {
    var code = (typeof App.displayCode === 'function') ? App.displayCode(t, 'trainees') : '';
    return code ? code + ' — ' + (t.name || '') : (t.name || '');
  }

  // صفوف قائمة الأعضاء: خانة اختيار لكل متدرب في الدليل؛ في نموذج
  // التعديل يحمل كل صف محدد زر «تعديل» صغيراً (يظهر عند التحديد فقط).
  function groupMemberRowsHtml(selected, isEdit) {
    var trainees = App.Store.getAll('trainees').slice().sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
    });
    if (!trainees.length) return '<div class="muted">لا متدربين مسجلين بعد.</div>';
    return trainees.map(function (t) {
      var checked = selected.has(t.id);
      var row = '<div class="check-row" style="justify-content:space-between">' +
        '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;flex:1">' +
        '<input type="checkbox" data-member-id="' + UI.escapeHtml(t.id) + '"' + (checked ? ' checked' : '') + '> ' +
        UI.escapeHtml(memberLabel(t)) + '</label>';
      if (isEdit) {
        row += '<button class="link-btn" type="button" data-member-edit="' + UI.escapeHtml(t.id) + '"' +
          (checked ? '' : ' hidden') + '>تعديل</button>';
      }
      return row + '</div>';
    }).join('');
  }

  function groupMembersSectionHtml(item) {
    var selected = new Set(item.traineeIds || []);
    var isEdit = !!item.id;
    return '<div class="field"><label>الأعضاء</label>' +
      '<div class="check-list" id="grp-members-list">' + groupMemberRowsHtml(selected, isEdit) + '</div>' +
      '<div style="margin-top:8px"><button class="btn btn-outline btn-sm" type="button" id="grp-add-trainee-btn">إضافة متدرب جديد</button></div>' +
      '<div class="field-hint">أعضاء المجموعة هم من يُستخدمون في التفقد والتصدير عند تعيين المجموعة لدورة. يمكن ترك المجموعة بلا أعضاء.</div></div>';
  }

  function selectedMemberIds(form) {
    var ids = [];
    form.querySelectorAll('[data-member-id]:checked').forEach(function (cb) {
      ids.push(cb.getAttribute('data-member-id'));
    });
    return ids;
  }

  // إعادة رسم قائمة الأعضاء داخل نموذج المجموعة المفتوح (بعد إضافة
  // متدرب جديد أو تعديل أحدهم) مع الحفاظ على المحدد، وتحديد الجديد.
  function renderGroupMembersList(form, isEdit, extraCheckedId) {
    var list = form.querySelector('#grp-members-list');
    if (!list) return;
    var selected = new Set(selectedMemberIds(form));
    if (extraCheckedId) selected.add(extraCheckedId);
    list.innerHTML = groupMemberRowsHtml(selected, isEdit);
  }

  // ربط تفاعلات قسم الأعضاء داخل نموذج المجموعة المفتوح: إظهار زر
  // التعديل للعضو المحدد، وفتح نافذة إضافة/تعديل متدرب فوق النموذج.
  function wireGroupMembers(modalEl, isEdit) {
    var form = modalEl.querySelector('form');
    if (!form) return;
    var list = form.querySelector('#grp-members-list');
    if (list) {
      list.addEventListener('change', function (e) {
        var cb = e.target && e.target.closest ? e.target.closest('[data-member-id]') : null;
        if (!cb) return;
        var btn = list.querySelector('[data-member-edit="' + cb.getAttribute('data-member-id') + '"]');
        if (btn) btn.hidden = !cb.checked;
      });
      list.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('[data-member-edit]') : null;
        if (!btn) return;
        e.preventDefault();
        openEditModal('trainee', btn.getAttribute('data-member-edit'), {
          onSaved: function () { renderGroupMembersList(form, isEdit); }
        });
      });
    }
    var addBtn = form.querySelector('#grp-add-trainee-btn');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        openAddModal('trainee', {
          onSaved: function (newId) { renderGroupMembersList(form, isEdit, newId); }
        });
      });
    }
  }

  function formFieldsFor(type, item) {
    item = item || {};
    switch (type) {
      case 'trainer':
        return '<div class="field"><label>الاسم *</label><input type="text" name="name" required value="' + UI.escapeHtml(item.name || '') + '"></div>' +
          codeFieldFor(type, item) +
          '<div class="field"><label>التخصص</label><input type="text" name="specialty" value="' + UI.escapeHtml(item.specialty || '') + '"></div>' +
          '<div class="field"><label>رقم الهاتف</label><input type="text" name="phone" value="' + UI.escapeHtml(item.phone || '') + '"></div>';
      case 'hall':
        return '<div class="field"><label>اسم القاعة *</label><input type="text" name="name" required value="' + UI.escapeHtml(item.name || '') + '"></div>' +
          codeFieldFor(type, item) +
          '<div class="field"><label>السعة (عدد المتدربين)</label><input type="number" name="capacity" min="0" value="' + UI.escapeHtml(item.capacity == null ? '' : item.capacity) + '"></div>';
      case 'directorate':
        return '<div class="field"><label>اسم المديرية *</label><input type="text" name="name" required value="' + UI.escapeHtml(item.name || '') + '"></div>' +
          codeFieldFor(type, item);
      case 'group':
        return '<div class="field"><label>اسم المجموعة *</label><input type="text" name="name" required value="' + UI.escapeHtml(item.name || '') + '" placeholder="مثال: مجموعة الإدارة العامة"></div>' +
          codeFieldFor(type, item) +
          '<div class="field"><label>المديرية *</label><select name="directorateId" required><option value="">اختر المديرية</option>' +
          App.Store.getAll('directorates').map(function (d) {
            return '<option value="' + UI.escapeHtml(d.id) + '"' + (item.directorateId === d.id ? ' selected' : '') + '>' + UI.escapeHtml(App.displayCode(d, 'directorates') + ' — ' + d.name) + '</option>';
          }).join('') + '</select></div>' +
          '<div class="field"><label>ملاحظات</label><textarea name="notes">' + UI.escapeHtml(item.notes || '') + '</textarea></div>' +
          groupMembersSectionHtml(item);
      case 'trainee':
        return '<div class="field"><label>الاسم *</label><input type="text" name="name" required value="' + UI.escapeHtml(item.name || '') + '"></div>' +
          codeFieldFor(type, item) +
          '<div class="field"><label>المديرية</label><select name="directorateId"><option value="">اختر المديرية</option>' +
          App.Store.getAll('directorates').map(function (d) {
            return '<option value="' + UI.escapeHtml(d.id) + '"' + (item.directorateId === d.id ? ' selected' : '') + '>' + UI.escapeHtml(App.displayCode(d, 'directorates') + ' — ' + d.name) + '</option>';
          }).join('') + '</select></div>' +
          '<div class="field"><label>رقم الهاتف</label><input type="text" name="phone" value="' + UI.escapeHtml(item.phone || '') + '"></div>' +
          '<div class="field"><label>الحالة</label><select name="status"><option value="">بلا حالة</option>' +
          Object.keys(UI.TRAINEE_STATUS_LABELS).map(function (k) {
            return '<option value="' + k + '"' + (item.status === k ? ' selected' : '') + '>' + UI.TRAINEE_STATUS_LABELS[k] + '</option>';
          }).join('') + '</select></div>' +
          '<div class="field"><label>ملاحظات</label><textarea name="notes">' + UI.escapeHtml(item.notes || '') + '</textarea></div>';
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
      case 'trainer': return { name: v('name'), code: v('code'), specialty: v('specialty'), phone: v('phone') };
      case 'hall': {
        var cap = form.querySelector('[name="capacity"]').value;
        return { name: v('name'), code: v('code'), capacity: cap === '' ? null : parseInt(cap, 10) };
      }
      case 'directorate': return { name: v('name'), code: v('code') };
      case 'group': return {
        name: v('name'),
        code: v('code'),
        directorateId: form.querySelector('[name="directorateId"]').value || null,
        notes: v('notes'),
        traineeIds: selectedMemberIds(form)
      };
      case 'trainee': return {
        name: v('name'),
        code: v('code'),
        directorateId: form.querySelector('[name="directorateId"]').value || null,
        phone: v('phone'),
        status: form.querySelector('[name="status"]').value || null,
        notes: v('notes')
      };
      default: return {};
    }
  }

  // excludeId: معرّف السجل الجاري تعديله (يُستثنى من فحص التكرار حتى
  // لا يُعدَّ رمزه الحالي مكرراً)؛ بلا قيمة عند الإنشاء.
  function validateFormData(type, data, form, excludeId) {
    if (type === 'trainee' || type === 'trainer' || type === 'hall' || type === 'directorate' || type === 'group') {
      if (!data.name) { UI.formError(form, 'الاسم مطلوب'); return false; }
    }
    if (type === 'group' && !data.directorateId) { UI.formError(form, 'المديرية مطلوبة — المجموعة تنتمي إلى مديرية'); return false; }
    var meta = ENTITY_META[type];
    if (meta) {
      if (!data.code) { UI.formError(form, 'المعرّف مطلوب'); return false; }
      if (!App.isCodeUnique(meta.col, data.code, excludeId || null)) {
        UI.formError(form, 'هذا المعرّف مستخدم من قبل — اختر معرّفاً آخر');
        return false;
      }
    }
    return true;
  }

  // opts.onSaved(id): ردّ اختياري يُستدعى بعد الحفظ وتحديث المتجر —
  // يستخدمه نموذج المجموعة لتحديث قائمة أعضائه بعد إضافة/تعديل متدرب.
  function openAddModal(type, opts) {
    var meta = ENTITY_META[type];
    if (!meta) return;
    var modal = UI.openFormModal('إضافة ' + meta.title, formFieldsFor(type, null), function (form, close, submitBtn) {
      var data = readFormData(type, form);
      if (!validateFormData(type, data, form)) return;
      UI.formError(form, '');
      UI.setBtnLoading(submitBtn, true);
      window.TadreebDB.add(meta.col, data).then(function (newId) {
        UI.setBtnLoading(submitBtn, false);
        close();
        UI.toast('تمت إضافة ' + meta.label, 'success');
        var afterRefresh = function () {
          if (opts && typeof opts.onSaved === 'function') opts.onSaved(newId);
        };
        var rp = App.refresh();
        if (rp && typeof rp.then === 'function') rp.then(afterRefresh, afterRefresh);
        else afterRefresh();
      }).catch(function (err) { UI.setBtnLoading(submitBtn, false); UI.formError(form, err.message); });
    }, { submitLabel: 'إضافة', width: 'normal' });
    if (type === 'group' && modal && modal.element) wireGroupMembers(modal.element, false);
  }

  function openEditModal(type, id, opts) {
    var meta = ENTITY_META[type];
    if (!meta) return;
    var item = App.Store.get(meta.col, id);
    if (!item) return;
    var modal = UI.openFormModal('تعديل ' + meta.label, formFieldsFor(type, item), function (form, close, submitBtn) {
      var data = readFormData(type, form);
      if (!validateFormData(type, data, form, id)) return;
      UI.formError(form, '');
      UI.setBtnLoading(submitBtn, true);
      window.TadreebDB.update(meta.col, id, data).then(function () {
        UI.setBtnLoading(submitBtn, false);
        close();
        UI.toast('تم حفظ التعديلات', 'success');
        var afterRefresh = function () {
          if (opts && typeof opts.onSaved === 'function') opts.onSaved(id);
        };
        var rp = App.refresh();
        if (rp && typeof rp.then === 'function') rp.then(afterRefresh, afterRefresh);
        else afterRefresh();
      }).catch(function (err) { UI.setBtnLoading(submitBtn, false); UI.formError(form, err.message); });
    }, { submitLabel: 'حفظ التعديلات', width: 'normal' });
    if (type === 'group' && modal && modal.element) wireGroupMembers(modal.element, true);
  }

  function deleteEntity(type, id) {
    var meta = ENTITY_META[type];
    if (!meta) return;
    var item = App.Store.get(meta.col, id);
    if (!item) return;
    // المجموعة المعيّنة في دورة لا تُحذف أبداً.
    if (type === 'group') {
      var groupCourseCount = App.Store.getAll('courses').filter(function (c) { return c.groupId === id; }).length;
      if (groupCourseCount) {
        UI.toast('لا يمكن حذف هذه المجموعة — معيّنة في ' + groupCourseCount + ' دورة', 'error');
        return;
      }
    }
    var label = item.name || item.label || UI.fmtDate(item.date) || '';
    var warning = '';
    if (type === 'trainer') {
      var used = App.Store.getAll('courses').filter(function (c) { return c.trainerId === id; }).length;
      if (used) warning = ' هذا المدرب معيّن في ' + used + ' دورة — ستظهر تلك الدورات بلا مدرب.';
    }
    if (type === 'hall') {
      var sessCount = App.Store.getAll('sessions').filter(function (s) { return s.hallId === id; }).length;
      if (sessCount) warning = ' هذه القاعة معيّنة في ' + sessCount + ' جلسة — ستظهر تلك الجلسات بلا قاعة.';
      // الاجتماعات العارضة المجدولة في القاعة (الملغاة لا تُحسب).
      var meetCount = App.Store.getAll('meetings').filter(function (m) { return m.hallId === id && m.status !== 'cancelled'; }).length;
      if (meetCount) warning += ' ولها ' + meetCount + ' اجتماع عارض مجدول — ستظهر تلك الاجتماعات بلا قاعة.';
    }
    if (type === 'directorate') {
      var trCount = App.Store.getAll('trainees').filter(function (t) { return t.directorateId === id; }).length;
      if (trCount) warning = ' هذه المديرية مرتبطة بـ ' + trCount + ' متدرباً — سيظهرون بلا مديرية.';
    }
    if (type === 'trainee') {
      var courseCount = App.Store.getAll('courses').filter(function (c) { return (c.traineeIds || []).indexOf(id) !== -1; }).length;
      if (courseCount) warning = ' هذا المتدرب مسجل في ' + courseCount + ' دورة — سيُزال منها تلقائياً عند حذف سجله.';
      var memberGroupCount = App.Store.getAll('groups').filter(function (g) { return (g.traineeIds || []).indexOf(id) !== -1; }).length;
      if (memberGroupCount) warning += ' وهو عضو في ' + memberGroupCount + ' مجموعة — سيُزال منها أيضاً.';
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
          // وإزالته من عضوية كل المجموعات.
          var memberGroups = App.Store.getAll('groups').filter(function (g) { return (g.traineeIds || []).indexOf(id) !== -1; });
          memberGroups.forEach(function (g) {
            var memberIds = (g.traineeIds || []).filter(function (x) { return x !== id; });
            cleanup = cleanup.then(function () { return window.TadreebDB.update('groups', g.id, { traineeIds: memberIds }); });
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
