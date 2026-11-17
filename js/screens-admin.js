// تدريب — شاشة الإدارة (للمدير فقط): إنشاء الحسابات، إدارة الأدوار،
// سجل التدقيق، النسخ الاحتياطي والملخص.
// تُسجَّل في window.Screens.admin.
(function () {
  'use strict';

  var auditLimit = 50;

  function render(container) {
    var html = '';
    html += '<div class="page-head"><div><h1>الإدارة</h1>' +
      '<div class="muted">إدارة حسابات المستخدمين وسجل التدقيق والنسخ الاحتياطي</div></div></div>';

    // إنشاء حساب
    html += '<div class="card"><h2>إنشاء حساب جديد</h2>' +
      '<form id="admin-user-form" novalidate><div class="form-grid">' +
      '<div class="field"><label>اسم المستخدم *</label><input type="text" name="username" required placeholder="مثال: coordinator1" dir="ltr" style="text-align:right">' +
      '<div class="field-hint">من 3 إلى 30 حرفاً: أحرف لاتينية وأرقام ونقطة وشرطة سفلية وشرطة فقط.</div></div>' +
      '<div class="field"><label>كلمة المرور *</label><input type="password" name="password" required placeholder="8 أحرف على الأقل"></div>' +
      '<div class="field"><label>الدور *</label><select name="role">' +
      '<option value="editor">محرر — إضافة وتعديل وحذف</option>' +
      '<option value="viewer">عارض — قراءة فقط</option>' +
      '<option value="admin">مدير — كل الصلاحيات</option>' +
      '</select></div>' +
      '</div><div class="form-error" id="admin-user-error"></div>' +
      '<button class="btn" type="submit" id="admin-user-submit">إنشاء الحساب</button></form></div>';

    // جدول المستخدمين
    html += '<div class="card"><h2>الحسابات</h2><div id="admin-users-box">' +
      UI.loadingState('جارٍ تحميل الحسابات…') + '</div></div>';

    // سجل التدقيق
    html += '<div class="card"><div class="section-title-row"><h2 style="margin:0">سجل التدقيق</h2>' +
      '<button class="btn btn-outline btn-sm" type="button" id="admin-audit-refresh">تحديث</button></div>' +
      '<div id="admin-audit-box">' + UI.loadingState('جارٍ تحميل سجل التدقيق…') + '</div></div>';

    // النسخ الاحتياطي
    html += '<div class="card"><h2>النسخ الاحتياطي والملخص</h2>' +
      '<p class="muted">نزّل نسخة كاملة من كل بيانات المنصة في ملف إكسل واحد، أو ملخصاً موجزاً بحالة المنصة.</p>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
      '<button class="btn" type="button" id="admin-backup-btn">تصدير نسخة احتياطية كاملة ↓</button>' +
      '<button class="btn btn-outline" type="button" id="admin-summary-btn">تصدير ملخص المنصة ↓</button>' +
      '</div></div>';

    container.innerHTML = html;

    loadUsers();
    loadAudit();

    var form = document.getElementById('admin-user-form');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var errEl = document.getElementById('admin-user-error');
      errEl.textContent = '';
      var username = form.querySelector('[name="username"]').value.trim();
      var password = form.querySelector('[name="password"]').value;
      var role = form.querySelector('[name="role"]').value;
      var vUser = window.TadreebAuth.validateUsername(username);
      if (!vUser.ok) { errEl.textContent = vUser.error; return; }
      var vPass = window.TadreebAuth.validatePassword(password);
      if (!vPass.ok) { errEl.textContent = vPass.error; return; }
      var btn = document.getElementById('admin-user-submit');
      UI.setBtnLoading(btn, true, 'جارٍ إنشاء الحساب…');
      window.TadreebAuth.provisionUser(username, password, role).then(function () {
        UI.setBtnLoading(btn, false);
        form.reset();
        UI.toast('تم إنشاء الحساب بنجاح', 'success');
        loadUsers();
      }).catch(function (err) {
        UI.setBtnLoading(btn, false);
        var msg = err && err.message ? err.message : 'تعذّر إنشاء الحساب';
        if (/auth\/email-already-in-use/i.test(msg)) msg = 'اسم المستخدم هذا مستخدم مسبقاً';
        errEl.textContent = msg;
      });
    });

    document.getElementById('admin-audit-refresh').addEventListener('click', function () {
      loadAudit();
    });

    document.getElementById('admin-backup-btn').addEventListener('click', function () {
      if (!UI.hasExport('exportBackup')) {
        UI.toast('وظيفة النسخ الاحتياطي الكامل غير متوفرة بعد في محرك التصدير', 'error');
        return;
      }
      UI.openPicker({
        title: 'تصدير نسخة احتياطية كاملة',
        sections: [
          { id: 'courses', label: 'الدورات والجلسات', checked: true },
          { id: 'directory', label: 'الدليل (مدربون، قاعات، مديريات، متدربون)', checked: true },
          { id: 'budget', label: 'الميزانيات والمصاريف', checked: true },
          { id: 'users', label: 'المستخدمون وسجل التدقيق', checked: true }
        ],
        onConfirm: function (result) {
          UI.toast('جارٍ تجهيز النسخة الاحتياطية…');
          App.buildBackupData().then(function (data) {
            if (result.sections.courses === false) { data.courses = []; data.sessions = []; }
            if (result.sections.directory === false) {
              data.trainers = []; data.halls = []; data.directorates = []; data.trainees = [];
            }
            if (result.sections.budget === false) { data.expenses = []; }
            if (result.sections.users === false) { data.users = []; data.audit = []; }
            UI.callExport('exportBackup', [data]);
          }).catch(UI.toastError);
        }
      });
    });

    document.getElementById('admin-summary-btn').addEventListener('click', function () {
      if (!UI.hasExport('exportSummary')) {
        UI.toast('وظيفة تصدير الملخص غير متوفرة بعد في محرك التصدير', 'error');
        return;
      }
      UI.toast('جارٍ تجهيز ملخص المنصة…');
      App.buildSummaryData().then(function (data) {
        UI.callExport('exportSummary', [data]);
      }).catch(UI.toastError);
    });
  }

  function loadUsers() {
    var box = document.getElementById('admin-users-box');
    if (!box) return;
    box.innerHTML = UI.loadingState('جارٍ تحميل الحسابات…');
    window.TadreebAuth.listUsers().then(function (users) {
      var me = window.TadreebAuth.getCurrentProfile();
      if (!users.length) {
        box.innerHTML = '<div class="muted">لا حسابات مسجلة.</div>';
        return;
      }
      var html = '<div class="table-wrap"><table><thead><tr><th>اسم المستخدم</th><th>الدور</th><th>تاريخ الإنشاء</th><th>إجراءات</th></tr></thead><tbody>';
      users.forEach(function (u) {
        var isMe = me && u.uid === me.uid;
        html += '<tr><td><strong>' + UI.escapeHtml(u.username) + '</strong>' + (isMe ? ' <span class="pill pill-navy">أنت</span>' : '') + '</td>' +
          '<td><select class="input" data-role-select="' + UI.escapeHtml(u.uid) + '" style="padding:6px 8px"' + (isMe ? ' disabled' : '') + '>' +
          ['admin', 'editor', 'viewer'].map(function (r) {
            return '<option value="' + r + '"' + (u.role === r ? ' selected' : '') + '>' + UI.roleLabel(r) + '</option>';
          }).join('') + '</select></td>' +
          '<td>' + UI.escapeHtml(UI.fmtTimestamp(u.createdAt)) + '</td>' +
          '<td><div class="row-actions">' +
          (isMe ? '<span class="muted">لا يمكن حذف حسابك الحالي</span>' :
            '<button class="link-btn danger" type="button" data-user-del="' + UI.escapeHtml(u.uid) + '" data-username="' + UI.escapeHtml(u.username) + '">حذف الحساب</button>') +
          '</div></td></tr>';
      });
      html += '</tbody></table></div>' +
        '<div class="muted" style="margin-top:10px">حذف الحساب يزيل ملفه الشخصي فيمنع دخوله فوراً. حساب تسجيل الدخول نفسه يبقى في وحدة تحكم Firebase ويمكن حذفه نهائياً من هناك (Authentication ← Users).</div>';
      box.innerHTML = html;

      box.querySelectorAll('[data-role-select]').forEach(function (sel) {
        sel.addEventListener('change', function () {
          var uid = sel.getAttribute('data-role-select');
          var role = sel.value;
          window.TadreebAuth.setUserRole(uid, role).then(function () {
            UI.toast('تم تغيير دور الحساب إلى ' + UI.roleLabel(role), 'success');
          }).catch(function (err) {
            UI.toastError(err);
            loadUsers();
          });
        });
      });
      box.querySelectorAll('[data-user-del]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var uid = btn.getAttribute('data-user-del');
          var username = btn.getAttribute('data-username');
          UI.confirmDialog('حذف الحساب',
            'هل أنت متأكد من حذف حساب «' + username + '»؟ سيُمنع دخوله فوراً. حساب تسجيل الدخول نفسه يبقى في وحدة تحكم Firebase ويمكن حذفه نهائياً من هناك.',
            function () {
              window.TadreebAuth.deleteUserProfile(uid).then(function () {
                UI.toast('تم حذف الحساب', 'success');
                loadUsers();
              }).catch(UI.toastError);
            });
        });
      });
    }).catch(function (err) {
      box.innerHTML = '<div class="muted">تعذّر تحميل الحسابات.</div>';
      UI.toastError(err);
    });
  }

  function loadAudit() {
    var box = document.getElementById('admin-audit-box');
    if (!box) return;
    box.innerHTML = UI.loadingState('جارٍ تحميل سجل التدقيق…');
    window.TadreebDB.list('audit').then(function (entries) {
      entries.sort(function (a, b) { return UI.tsMillis(b.ts) - UI.tsMillis(a.ts); });
      var shown = entries.slice(0, auditLimit);
      if (!shown.length) {
        box.innerHTML = '<div class="muted">سجل التدقيق فارغ بعد.</div>';
        return;
      }
      var html = '<div class="table-wrap"><table><thead><tr><th>الوقت</th><th>المستخدم</th><th>الإجراء</th><th>السجل</th><th>التفاصيل</th></tr></thead><tbody>';
      shown.forEach(function (e) {
        html += '<tr class="audit-row"><td style="white-space:nowrap">' + UI.escapeHtml(UI.fmtTimestamp(e.ts)) + '</td>' +
          '<td>' + UI.escapeHtml(e.username || '') + '</td>' +
          '<td>' + UI.escapeHtml(actionLabel(e.action)) + '</td>' +
          '<td>' + UI.escapeHtml(entityLabel(e.entity)) + '</td>' +
          '<td class="audit-details">' + UI.escapeHtml(e.details || '') + '</td></tr>';
      });
      html += '</tbody></table></div>';
      if (entries.length > auditLimit) {
        html += '<div class="muted" style="margin-top:10px">عرض أحدث ' + auditLimit + ' من ' + entries.length + ' سجلاً.</div>';
      }
      box.innerHTML = html;
    }).catch(function (err) {
      box.innerHTML = '<div class="muted">تعذّر تحميل سجل التدقيق.</div>';
      UI.toastError(err);
    });
  }

  function actionLabel(action) {
    var map = {
      create: 'إنشاء', update: 'تعديل', delete: 'حذف', login: 'تسجيل دخول',
      first_setup: 'الإعداد الأولي', user_create: 'إنشاء حساب', user_role: 'تغيير دور',
      user_delete: 'حذف حساب', seed: 'قيم افتراضية', schedule_generate: 'توليد جدول',
      session_state: 'تغيير حالة جلسة', session_merge: 'دمج جلسات',
      session_merge_delete: 'حذف بعد دمج', trainer_attendance: 'حضور مدرب',
      attendance: 'تسجيل حضور', trainee_status: 'تغيير حالة متدرب',
      note_add: 'إضافة ملاحظة', note_delete: 'حذف ملاحظة'
    };
    return map[action] || action || '';
  }

  function entityLabel(entity) {
    var map = {
      courses: 'دورة', sessions: 'جلسة', trainees: 'متدرب', trainers: 'مدرب',
      directorates: 'مديرية', halls: 'قاعة', periods: 'فترة', holidays: 'عطلة',
      expenses: 'مصروف', budgetCategories: 'فئة ميزانية', users: 'حساب',
      notes: 'ملاحظة', audit: 'تدقيق', meta: 'إعداد'
    };
    return map[entity] || entity || '';
  }

  window.Screens.admin = { render: render };
})();
