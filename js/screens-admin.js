// تدريب — شاشة الإدارة (للمدير فقط): إنشاء الحسابات، إدارة الأدوار،
// سجل التدقيق، النسخ الاحتياطي والملخص.
// وشاشة إعدادات المنصة (للمدير فقط): الفترات التدريبية، العطل، فئات
// الميزانية (منقولة من شاشة الدليل في v1.1)، إدارة المستخدمين، حول المنصة.
// تُسجَّلان في window.Screens.admin و window.Screens.settings.
(function () {
  'use strict';

  var auditLimit = 50;

  // ---------- لوحات الإحصاءات (v2.1 — بند 10) ----------
  // نمط موحد لكل لوحات هذا الملف: حساب المقاييس عبر TadreebStats ثم
  // رسم اللوحة (وفيها زر «تخصيص» وزر تصدير يفتح منتقي الأعمدة ثم
  // يستدعي دالة التصدير ببيانات جديدة). تُتخطى اللوحة بهدوء إن غابت
  // وحدة الإحصاءات أو حاوية اللوحة.
  // spec: {section, title, compute(), exportTitle, exportFn, exportKind,
  // exportParams?, columns: [{id, label, checked}]}
  function renderStatsPanel(container, panelId, spec) {
    if (!container || !window.TadreebStats) return null;
    var panelEl = container.querySelector('#' + panelId);
    if (!panelEl) return null;
    var res = spec.compute();
    window.TadreebStats.renderPanel(panelEl, {
      section: spec.section,
      title: spec.title,
      metrics: res.metrics,
      export: {
        label: 'تصدير الإحصاءات ↓',
        onClick: function () {
          UI.openPicker({
            title: spec.exportTitle,
            columns: spec.columns,
            onConfirm: function (result) {
              UI.callExport(spec.exportFn, [
                window.TadreebStats.exportData(spec.exportKind, spec.exportParams || {}),
                { columns: result.columns }
              ]);
            }
          });
        }
      }
    });
    return panelEl;
  }

  function render(container) {
    var html = '';
    html += '<div class="page-head"><div><h1>الإدارة</h1>' +
      '<div class="muted">إدارة حسابات المستخدمين وسجل التدقيق والنسخ الاحتياطي</div></div></div>';

    // إنشاء حساب
    html += '<div class="card-white"><div class="section-title-row"><h2>إنشاء حساب جديد</h2></div>' +
      '<form id="admin-user-form" novalidate><div class="form-grid">' +
      '<div class="field"><label>اسم المستخدم *</label><input type="text" name="username" required placeholder="مثال: coordinator1" dir="ltr" style="text-align:right">' +
      '<div class="field-hint">من 3 إلى 30 حرفاً: أحرف لاتينية وأرقام ونقطة وشرطة سفلية وشرطة فقط.</div></div>' +
      '<div class="field"><label>كلمة المرور *</label><input type="password" name="password" required placeholder="10 أحرف على الأقل، مع حرف ورقم"></div>' +
      '<div class="field"><label>الدور *</label><select name="role">' +
      '<option value="editor">محرر — إضافة وتعديل وحذف</option>' +
      '<option value="viewer">عارض — قراءة فقط</option>' +
      '<option value="admin">مدير — كل الصلاحيات</option>' +
      '</select></div>' +
      '</div><div class="form-error" id="admin-user-error"></div>' +
      '<button class="btn" type="submit" id="admin-user-submit">إنشاء الحساب</button></form></div>';

    // جدول المستخدمين
    html += '<div class="card-white"><div class="section-title-row"><h2>الحسابات</h2></div><div id="admin-users-box">' +
      UI.loadingState('جارٍ تحميل الحسابات…') + '</div></div>';

    // لوحة إحصاءات المستخدمين (v2.1 — بند 10): تُرسم بعد تحميل القائمة.
    html += '<div id="admin-users-stats-panel"></div>';

    // سجل التدقيق
    html += '<div class="card-white"><div class="section-title-row"><h2>سجل التدقيق</h2>' +
      '<button class="btn btn-outline btn-sm" type="button" id="admin-audit-refresh">تحديث</button></div>' +
      '<div id="admin-audit-box">' + UI.loadingState('جارٍ تحميل سجل التدقيق…') + '</div></div>';

    // محاولات دخول فاشلة أخيرة (بصمة اسم المستخدم فقط — بلا أسماء)
    html += '<div class="card-white"><div class="section-title-row"><h2>محاولات دخول فاشلة أخيرة</h2>' +
      '<button class="btn btn-outline btn-sm" type="button" id="admin-attempts-refresh">تحديث</button></div>' +
      '<div id="admin-attempts-box">' + UI.loadingState('جارٍ تحميل محاولات الدخول…') + '</div></div>';

    // لوحة إحصاءات المصاريف (v2.1 — بند 10): كل مصاريف المنصة.
    html += '<div id="admin-expenses-stats-panel"></div>';

    // النسخ الاحتياطي
    html += '<div class="card-white"><div class="section-title-row"><h2>النسخ الاحتياطي والملخص</h2></div>' +
      '<p class="muted">نزّل نسخة كاملة من كل بيانات المنصة في ملف إكسل واحد، أو ملخصاً موجزاً بحالة المنصة.</p>' +
      '<div class="toolbar">' +
      '<button class="btn" type="button" id="admin-backup-btn">تصدير نسخة احتياطية كاملة ↓</button>' +
      '<button class="btn btn-outline" type="button" id="admin-summary-btn">تصدير ملخص المنصة ↓</button>' +
      '</div></div>';

    container.innerHTML = html;

    loadUsers();
    loadAudit();
    loadLoginAttempts();

    // لوحة إحصاءات المصاريف (متزامنة من المتجر المحمّل).
    renderStatsPanel(container, 'admin-expenses-stats-panel', {
      section: 'expenses',
      title: 'إحصاءات المصاريف',
      compute: function () { return window.TadreebStats.computeExpenses(); },
      exportTitle: 'تصدير إحصاءات المصاريف',
      exportFn: 'exportExpensesStats',
      exportKind: 'expenses-stats',
      columns: [
        { id: 'category', label: 'الفئة', checked: true },
        { id: 'course', label: 'مجموعة التدريب', checked: true },
        { id: 'count', label: 'عدد المصاريف', checked: true },
        { id: 'total', label: 'الإجمالي (ل.س)', checked: true }
      ]
    });

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

    document.getElementById('admin-attempts-refresh').addEventListener('click', function () {
      loadLoginAttempts();
    });

    document.getElementById('admin-backup-btn').addEventListener('click', function () {
      if (!UI.hasExport('exportBackup')) {
        UI.toast('وظيفة النسخ الاحتياطي الكامل غير متوفرة بعد في محرك التصدير', 'error');
        return;
      }
      UI.openPicker({
        title: 'تصدير نسخة احتياطية كاملة',
        sections: [
          { id: 'courses', label: 'مجموعات التدريب والجلسات', checked: true },
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
      // لوحة إحصاءات المستخدمين (تُعاد رسمها عند كل تحميل للقائمة).
      renderStatsPanel(document.getElementById('screen-container'), 'admin-users-stats-panel', {
        section: 'users',
        title: 'إحصاءات المستخدمين',
        compute: function () { return window.TadreebStats.computeUsers(users); },
        exportTitle: 'تصدير إحصاءات المستخدمين',
        exportFn: 'exportUsersStats',
        exportKind: 'users-stats',
        exportParams: { users: users },
        columns: [
          { id: 'username', label: 'اسم المستخدم', checked: true },
          { id: 'role', label: 'الدور', checked: true }
        ]
      });
      if (!users.length) {
        box.innerHTML = '<div class="muted">لا حسابات مسجلة.</div>';
        return;
      }
      var html = '';
      users.forEach(function (u) {
        var isMe = me && u.uid === me.uid;
        var created = UI.fmtTimestamp(u.createdAt);
        html += '<div class="list-row"><div class="list-row-main">' +
          '<div class="list-row-title"><strong>' + UI.escapeHtml(u.username) + '</strong>' + (isMe ? ' <span class="pill pill-navy">أنت</span>' : '') + '</div>' +
          (created ? '<div class="list-row-meta muted">أُنشئ في ' + UI.escapeHtml(created) + '</div>' : '') +
          '</div><div class="list-row-actions row-actions">' +
          '<select class="input" data-role-select="' + UI.escapeHtml(u.uid) + '"' + (isMe ? ' disabled' : '') + '>' +
          ['admin', 'editor', 'viewer'].map(function (r) {
            return '<option value="' + r + '"' + (u.role === r ? ' selected' : '') + '>' + UI.roleLabel(r) + '</option>';
          }).join('') + '</select>' +
          (isMe ? '<span class="muted">لا يمكن حذف حسابك الحالي</span>' :
            '<button class="btn btn-danger btn-sm" type="button" data-user-del="' + UI.escapeHtml(u.uid) + '" data-username="' + UI.escapeHtml(u.username) + '">حذف الحساب</button>') +
          '</div></div>';
      });
      html += '<div class="muted" style="margin-top:10px">حذف الحساب يزيل ملفه الشخصي فيمنع دخوله فوراً. حساب تسجيل الدخول نفسه يبقى في وحدة تحكم Firebase ويمكن حذفه نهائياً من هناك (Authentication ← Users).</div>';
      box.innerHTML = html;

      box.querySelectorAll('[data-role-select]').forEach(function (sel) {
        sel.addEventListener('change', function () {
          var uid = sel.getAttribute('data-role-select');
          var role = sel.value;
          // تغيير الدور إجراء مدمّر نسبياً — يتطلب تأكيد هوية المدير.
          // عند إلغاء التأكيد تُعاد القائمة فيعود المحدد للدور الحالي.
          UI.requireReauth(function () {
            window.TadreebAuth.setUserRole(uid, role).then(function () {
              UI.toast('تم تغيير دور الحساب إلى ' + UI.roleLabel(role), 'success');
            }).catch(function (err) {
              UI.toastError(err);
              loadUsers();
            });
          }, function () { loadUsers(); });
        });
      });
      box.querySelectorAll('[data-user-del]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var uid = btn.getAttribute('data-user-del');
          var username = btn.getAttribute('data-username');
          UI.confirmDialog('حذف الحساب',
            'هل أنت متأكد من حذف حساب «' + username + '»؟ سيُمنع دخوله فوراً. حساب تسجيل الدخول نفسه يبقى في وحدة تحكم Firebase ويمكن حذفه نهائياً من هناك.',
            function () {
              UI.requireReauth(function () {
                window.TadreebAuth.deleteUserProfile(uid).then(function () {
                  UI.toast('تم حذف الحساب', 'success');
                  loadUsers();
                }).catch(UI.toastError);
              });
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
      var html = '';
      shown.forEach(function (e) {
        var entity = entityLabel(e.entity);
        var meta = [];
        if (e.username) meta.push(UI.escapeHtml(e.username));
        meta.push(UI.escapeHtml(UI.fmtTimestamp(e.ts)));
        if (e.details) meta.push(UI.escapeHtml(e.details));
        html += '<div class="list-row audit-row"><div class="list-row-main">' +
          '<div class="list-row-title"><strong>' + UI.escapeHtml(actionLabel(e.action)) + '</strong>' + (entity ? ' <span class="pill pill-grey">' + UI.escapeHtml(entity) + '</span>' : '') + '</div>' +
          '<div class="list-row-meta muted">' + meta.join(' · ') + '</div>' +
          '</div></div>';
      });
      if (entries.length > auditLimit) {
        html += '<div class="muted" style="margin-top:10px">عرض أحدث ' + auditLimit + ' من ' + entries.length + ' سجلاً.</div>';
      }
      box.innerHTML = html;
    }).catch(function (err) {
      box.innerHTML = '<div class="muted">تعذّر تحميل سجل التدقيق.</div>';
      UI.toastError(err);
    });
  }

  // محاولات الدخول الفاشلة الأخيرة — تُعرض البصمة مقطوعة (12 حرفاً)
  // لأن المستندات لا تحوي اسم المستخدم أصلاً. القفل: 5 محاولات
  // فاشلة خلال 15 دقيقة تقفل الحساب 15 دقيقة.
  function loadLoginAttempts() {
    var box = document.getElementById('admin-attempts-box');
    if (!box) return;
    box.innerHTML = UI.loadingState('جارٍ تحميل محاولات الدخول…');
    if (!window.TadreebAuth || typeof window.TadreebAuth.listLoginAttempts !== 'function') {
      box.innerHTML = '<div class="muted">غير متوفرة.</div>';
      return;
    }
    window.TadreebAuth.listLoginAttempts().then(function (attempts) {
      if (!attempts.length) {
        box.innerHTML = '<div class="muted">لا محاولات دخول فاشلة مسجلة.</div>';
        return;
      }
      var html = '';
      attempts.forEach(function (a) {
        html += '<div class="list-row"><div class="list-row-main">' +
          '<div class="list-row-title"><strong><span class="ltr">' + UI.escapeHtml(String(a.u || '').slice(0, 12) + '…') + '</span></strong>' +
          (a.locked ? ' <span class="pill pill-red">قفل حساب</span>' : '') + '</div>' +
          '<div class="list-row-meta muted">' + UI.escapeHtml(UI.fmtTimestamp(a.atMs)) + (a.locked ? '' : ' · محاولة فاشلة') + '</div>' +
          '</div></div>';
      });
      html += '<div class="muted" style="margin-top:10px">تُحفظ بصمة اسم المستخدم فقط — لا أسماء مستخدمين ولا كلمات مرور. يُقفل الحساب 15 دقيقة بعد 5 محاولات فاشلة.</div>';
      box.innerHTML = html;
    }).catch(function (err) {
      box.innerHTML = '<div class="muted">تعذّر تحميل محاولات الدخول.</div>';
      UI.toastError(err);
    });
  }

  function actionLabel(action) {
    var map = {
      create: 'إنشاء', update: 'تعديل', delete: 'حذف', login: 'تسجيل دخول',
      login_success: 'تسجيل دخول ناجح', lockout: 'قفل حساب',
      first_setup: 'الإعداد الأولي', user_create: 'إنشاء حساب', user_role: 'تغيير دور',
      user_delete: 'حذف حساب', user_disable: 'تعطيل حساب', user_enable: 'تفعيل حساب',
      user_password_reset: 'إعادة تعيين كلمة مرور', seed: 'قيم افتراضية', schedule_generate: 'توليد جدول',
      session_state: 'تغيير حالة جلسة', session_merge: 'دمج جلسات',
      session_merge_delete: 'حذف بعد دمج', session_split: 'تقسيم جلسة', trainer_attendance: 'حضور مدرب',
      session_postpone: 'تأجيل جلسة', session_holiday: 'جلسة عطلة', session_update: 'تعديل جلسة',
      course_reschedule: 'تغيير تاريخ بدء مجموعة تدريب', course_rename: 'إعادة تسمية دورة', course_delete: 'حذف مجموعة تدريب',
      attendance: 'تسجيل حضور', trainee_status: 'تغيير حالة متدرب',
      note_add: 'إضافة ملاحظة', note_delete: 'حذف ملاحظة',
      meeting_create: 'إنشاء اجتماع عارض', meeting_update: 'تعديل اجتماع عارض',
      meeting_cancel: 'إلغاء اجتماع عارض', meeting_delete: 'حذف اجتماع عارض'
    };
    return map[action] || action || '';
  }

  function entityLabel(entity) {
    var map = {
      courses: 'مجموعة تدريب', sessions: 'جلسة', trainees: 'متدرب', trainers: 'مدرب',
      groups: 'مجموعة تدريبية',
      directorates: 'مديرية', halls: 'قاعة', periods: 'فترة', holidays: 'عطلة',
      expenses: 'مصروف', budgetCategories: 'فئة ميزانية', levels: 'مستوى مجموعة تدريب', users: 'حساب',
      notes: 'ملاحظة', audit: 'تدقيق', meta: 'إعداد', meetings: 'اجتماع عارض'
    };
    return map[entity] || entity || '';
  }

  // ============ إعدادات المنصة (للمدير فقط) ============
  // ستة أقسام مرتّبة (v2.1): الحسابات والمستخدمون، الفترات الدراسية،
  // المستويات، الإعدادات العامة، العرض والتنسيق، حول المنصة. البطاقات
  // نفسها كما كانت (نفس المعرّفات والنماذج والتحقق) — الترتيب فقط
  // تغيّر: كل بطاقة داخل قسمها المرقّم، وكل قسم له عنوان ووصف.
  // أقسام الفترات والعطل وفئات الميزانية منقولة من شاشة الدليل كما هي،
  // مع ملاحظات الفترات والعطل كما كانت في الدليل.

  var SETTINGS_META = {
    period: { col: 'periods', label: 'الفترة التدريبية', title: 'فترة تدريبية' },
    holiday: { col: 'holidays', label: 'يوم العطلة', title: 'عطلة' }
  };

  // ---------- مصفوفة الصلاحيات (عرض فقط — مشتقة من الكود) ----------
  // كل صف: [التسمية، مدير، محرر، عارض]. المصادر:
  // - requireAdmin في auth.js (إدارة المستخدمين)؛ isAdmin في app.js
  //   showScreen + renderSettings (شاشتا الإدارة والإعدادات).
  // - requireWrite في db.js (كل الكتابات: الدورات، الجلسات، الحضور،
  //   الدليل، الاجتماعات) + بوابات canWrite في الشاشات.
  // - التصدير العام بلا بوابة دور (الأزرار تظهر لكل الأدوار ومحرك
  //   التصدير بلا فحص دور)؛ تصدير الإحصائيات وحده ببوابة canWrite
  //   (screens-courses.js).
  // - سجل التدقيق: شاشة الإدارة فقط + قاعدة Firestore (قراءة للمدير فقط).
  // - النسخ الاحتياطي: شاشة الإدارة فقط؛ لا توجد وظيفة استعادة في الكود.
  var PERMISSION_ROWS = [
    ['عرض الشاشات والبيانات (لوحة المعلومات، مجموعات التدريب، الرزنامة، الدليل)', true, true, true],
    ['عرض شاشتي الإدارة والإعدادات', true, false, false],
    ['إدارة المستخدمين (إنشاء، تغيير الدور، تعطيل، حذف، إعادة تعيين كلمة المرور)', true, false, false],
    ['إضافة مجموعات التدريب وتعديلها وحذفها', true, true, false],
    ['إدارة الجلسات (تأجيل، إلغاء، دمج، تقسيم، تعديل، تغيير الحالة)', true, true, false],
    ['عرض الحضور (تفقد)', true, true, true],
    ['تسجيل الحضور وتصحيحه (متدربون ومدرب)', true, true, false],
    ['إدارة الدليل (مدربون، قاعات، مديريات، مجموعات، متدربون)', true, true, false],
    ['إدارة الفترات والعطل وفئات الميزانية ومستويات مجموعات التدريب', true, false, false],
    ['الاجتماعات العارضة (إنشاء، تعديل، إلغاء، حذف)', true, true, false],
    ['تصدير Excel (ملفات مجموعات التدريب، القوائم، الحضور، الرزنامة، الدليل)', true, true, true],
    ['تصدير إحصائيات مجموعات التدريب', true, true, false],
    ['عرض سجل التدقيق', true, false, false],
    ['النسخ الاحتياطي وملخص المنصة', true, false, false],
    ['إضافة الملاحظات وحذفها', true, true, false]
  ];

  function permissionsMatrixHtml() {
    function cell(ok) {
      return '<td style="text-align:center">' + (ok ? '✓' : '—') + '</td>';
    }
    var html = '<div class="table-wrap"><table><thead><tr><th>الصلاحية</th>' +
      '<th style="text-align:center">مدير</th><th style="text-align:center">محرر</th>' +
      '<th style="text-align:center">عارض</th></tr></thead><tbody>';
    PERMISSION_ROWS.forEach(function (row) {
      html += '<tr><td>' + UI.escapeHtml(row[0]) + '</td>' +
        cell(row[1]) + cell(row[2]) + cell(row[3]) + '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  // بطاقات لوحة المعلومات (كما تُبنى في screens-dashboard.js) — لتبديل إظهارها.
  var DASHBOARD_CARD_DEFS = [
    { key: 'stats', label: 'الإحصاءات الموجزة' },
    { key: 'today', label: 'جلسات اليوم' },
    { key: 'weekAttendance', label: 'ملخص الحضور هذا الأسبوع' },
    { key: 'upcoming', label: 'الجلسات القادمة' },
    { key: 'progress', label: 'تقدم مجموعات التدريب النشطة' },
    { key: 'tracker', label: 'متابعة مجموعات التدريب' }
  ];

  // ---------- رأس قسم في شاشة الإعدادات ----------
  // عنوان مرقّم بلغة تصميم v2 نفسها (شريط ذهبي + عنوان كحلي) مع وصف
  // موجز. يفتح وسم <section> يُغلق بعد آخر بطاقة في القسم.
  function settingsSectionHead(num, title, desc, topMargin) {
    var top = (typeof topMargin === 'number') ? topMargin : 26;
    return '<section style="margin-top:' + top + 'px">' +
      '<div style="display:flex;align-items:center;gap:10px">' +
      '<span aria-hidden="true" style="width:10px;height:2px;background:var(--gold);border-radius:2px;flex:none"></span>' +
      '<h2 style="margin:0">' + num + ' — ' + UI.escapeHtml(title) + '</h2></div>' +
      '<p class="muted" style="margin:6px 0 14px">' + UI.escapeHtml(desc) + '</p>';
  }

  function renderSettings(container) {
    if (!App.isAdmin()) {
      container.innerHTML = '<div class="error-view"><div class="error-title">إعدادات المنصة متاحة للمدير فقط</div>' +
        '<p>هذه الشاشة متاحة لحسابات المدير فقط.</p></div>';
      return;
    }
    var Store = App.Store;
    var periods = Store.getAll('periods').slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var holidays = Store.getAll('holidays').slice().sort(function (a, b) { return (a.date || '') < (b.date || '') ? -1 : 1; });
    var categories = Store.getAll('budgetCategories').slice().sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'ar'); });
    var levels = Store.getAll('levels').slice().sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'ar'); });

    var html = '';
    html += '<div class="page-head"><div><h1>إعدادات المنصة</h1>' +
      '<div class="muted">ستة أقسام مرتّبة: الحسابات والمستخدمون، الفترات الدراسية، المستويات، الإعدادات العامة، العرض والتنسيق، حول المنصة</div></div></div>';

    html += settingsSectionHead(1, 'الحسابات والمستخدمون', 'حسابات المنصة وأدوارها، وصلاحيات كل دور.', 0);

    // القسم 1 — الحسابات والمستخدمون: إدارة المستخدمين
    html += '<div class="card-white"><div class="section-title-row"><h2>إدارة المستخدمين</h2>' +
      '<button class="btn btn-sm" type="button" id="settings-add-user">إضافة مستخدم</button></div>' +
      '<div id="settings-users-box">' + UI.loadingState('جارٍ تحميل الحسابات…') + '</div></div>';

    // القسم 1 — الحسابات والمستخدمون: الصلاحيات (عرض فقط)
    html += '<div class="card-white"><div class="section-title-row"><h2>الصلاحيات</h2></div>' +
      '<p class="muted" style="margin-top:0">الصلاحيات ثابتة حسب الدور — تُدار الأدوار من قسم إدارة المستخدمين أعلاه، ولا يمكن تخصيص صلاحية لمستخدم بمفرده.</p>' +
      permissionsMatrixHtml() + '</div>';

    html += '</section>';

    html += settingsSectionHead(2, 'الفترات الدراسية', 'أوقات الفترات التدريبية خلال اليوم.');

    // القسم 2 — الفترات الدراسية
    html += '<div class="card-white"><div class="section-title-row"><h2>الفترات التدريبية</h2>' +
      '<button class="btn btn-outline btn-sm" type="button" id="settings-add-period"' + (periods.length >= 4 ? ' disabled title="الحد الأقصى 4 فترات"' : '') + '>إضافة فترة</button>' +
      '</div>';
    if (!periods.length) html += '<div class="muted">لا فترات معرّفة.</div>';
    periods.forEach(function (p) {
      var duration = UI.fmtDuration(p.start, p.end);
      html += '<div class="list-row"><div class="list-row-main">' +
        '<div class="list-row-title"><strong>' + UI.escapeHtml(p.label) + '</strong> <span class="pill pill-grey">' + UI.escapeHtml(App.displayCode(p, 'periods')) + '</span></div>' +
        '<div class="list-row-meta muted">' + UI.fmtTimeRange(p.start, p.end) + (duration ? ' · المدة: ' + UI.escapeHtml(duration) : '') + '</div>' +
        '</div><div class="list-row-actions row-actions">' + settingsActionRow('period', p.id) + '</div></div>';
    });
    html += '<div class="muted">يمكن تعديل أوقات الفترات من هنا، وإضافة فترة رابعة عند الحاجة (الحد الأقصى 4 فترات).</div></div>';

    // لوحة إحصاءات الفترات (v2.1 — بند 10).
    html += '<div id="settings-periods-stats-panel"></div>';

    html += '</section>';

    html += settingsSectionHead(3, 'المستويات', 'مستويات مجموعات التدريب الافتراضية والمخصصة.');

    // القسم 3 — المستويات: مستويات الدورات (الافتراضية للعرض فقط + المخصصة قابلة للإدارة)
    html += '<div class="card-white"><div class="section-title-row"><h2>مستويات مجموعات التدريب</h2>' +
      '<button class="btn btn-outline btn-sm" type="button" id="settings-add-level">إضافة مستوى</button>' +
      '</div>';
    Object.keys(App.LEVEL_LABELS).forEach(function (key) {
      html += '<div class="list-row"><div class="list-row-main">' +
        '<div class="list-row-title"><strong>' + UI.escapeHtml(App.LEVEL_LABELS[key]) + '</strong></div>' +
        '<div class="list-row-meta muted">مستوى افتراضي — لا يمكن حذفه.</div>' +
        '</div></div>';
    });
    html += '<div class="muted" style="margin:6px 0 10px">مستويات مخصصة:</div>';
    if (!levels.length) html += '<div class="muted">لا مستويات مخصصة — أضف مستوى يظهر في نموذج مجموعة التدريب.</div>';
    levels.forEach(function (l) {
      html += '<div class="list-row"><div class="list-row-main">' +
        '<div class="list-row-title"><strong>' + UI.escapeHtml(l.name) + '</strong></div>' +
        '</div><div class="list-row-actions row-actions">' +
        '<button class="btn btn-outline btn-sm" type="button" data-settings-edit-level="' + UI.escapeHtml(l.id) + '">تعديل</button>' +
        '<button class="btn btn-danger btn-sm" type="button" data-settings-del-level="' + UI.escapeHtml(l.id) + '">حذف</button>' +
        '</div></div>';
    });
    html += '<div class="muted" style="margin-top:10px">تظهر المستويات المخصصة في نموذج مجموعة التدريب. لا يمكن حذف مستوى معيّن في مجموعة تدريب.</div></div>';

    // لوحة إحصاءات المستويات (v2.1 — بند 10).
    html += '<div id="settings-levels-stats-panel"></div>';

    html += '</section>';

    html += settingsSectionHead(4, 'الإعدادات العامة', 'العطل التي تُتخطى عند توليد الجداول، وأيام العطلة الأسبوعية، وفئات مصروفات الميزانية.');

    // القسم 4 — الإعدادات العامة: العطل
    html += '<div class="card-white"><div class="section-title-row"><h2>العطل</h2>' +
      '<button class="btn btn-outline btn-sm" type="button" id="settings-add-holiday">إضافة عطلة</button>' +
      '</div>';
    if (!holidays.length) {
      html += '<div class="muted">لا عطل مسجلة — تُتخطى العطل تلقائياً عند توليد الجداول.</div>';
    } else {
      // العطل بلا معرّف (لا إدخال رمز في نموذجها ولا بادئة في
      // CODE_PREFIXES) — لذا بلا قرص رمز في العنوان.
      holidays.forEach(function (h) {
        html += '<div class="list-row"><div class="list-row-main">' +
          '<div class="list-row-title"><strong>' + UI.escapeHtml(h.name || '') + '</strong></div>' +
          '<div class="list-row-meta muted">' + UI.escapeHtml(UI.fmtDateFull(h.date)) + '</div>' +
          '</div><div class="list-row-actions row-actions">' + settingsActionRow('holiday', h.id) + '</div></div>';
      });
    }
    html += '</div>';

    // القسم 4 — الإعدادات العامة: العطلة الأسبوعية (v2.3 — W3).
    // إعداد مشترك بين كل المنسقين (meta/general) — لا جلسات في
    // هذه الأيام، وتُتخطى في التعبئة الذكية والرزنامة. تُعرض القيمة
    // المخزنة مؤقتاً أولاً، ثم تُزامن مع المحفوظة بعد التحميل (انظر
    // الربط أسفل renderSettings).
    var weekendDays = [5, 6];
    try {
      if (window.TadreebDB && typeof window.TadreebDB.getWeekendDays === 'function') {
        var wd = window.TadreebDB.getWeekendDays();
        if (Array.isArray(wd) && wd.length) weekendDays = wd;
      }
    } catch (e) { /* الافتراضي أعلاه */ }
    html += '<div class="card-white"><div class="section-title-row"><h2>العطلة الأسبوعية</h2>' +
      '<button class="btn btn-outline btn-sm" type="button" id="settings-save-weekend">حفظ العطلة الأسبوعية</button>' +
      '</div>' +
      '<p class="muted" style="margin-top:0">أيام العطلة الأسبوعية — لا جلسات فيها، وتُتخطى في التعبئة الذكية والرزنامة. تُطبَّق على جميع المنسقين.</p>' +
      '<div class="day-picker" id="settings-weekend-picker">' +
      UI.WEEKDAYS.map(function (name, i) {
        return '<label class="day-chip' + (weekendDays.indexOf(i) !== -1 ? ' checked' : '') + '"><input type="checkbox" data-weekend-day="' +
          i + '"' + (weekendDays.indexOf(i) !== -1 ? ' checked' : '') + '> ' + name + '</label>';
      }).join('') + '</div>' +
      '<div class="field-hint">الافتراضي: الجمعة والسبت. يجب اختيار يوم واحد على الأقل.</div></div>';

    // لوحة إحصاءات العطل (v2.1 — بند 10).
    html += '<div id="settings-holidays-stats-panel"></div>';

    // القسم 4 — الإعدادات العامة: فئات الميزانية
    html += '<div class="card-white"><div class="section-title-row"><h2>فئات الميزانية</h2>' +
      '<button class="btn btn-outline btn-sm" type="button" id="settings-add-category">إضافة فئة</button>' +
      '</div>';
    if (!categories.length) html += '<div class="muted">لا فئات معرّفة.</div>';
    categories.forEach(function (c) {
      html += '<div class="list-row"><div class="list-row-main">' +
        '<div class="list-row-title"><strong>' + UI.escapeHtml(c.name) + '</strong> <span class="pill pill-grey">' + UI.escapeHtml(App.displayCode(c, 'budgetCategories')) + '</span></div>' +
        '</div><div class="list-row-actions row-actions">' +
        '<button class="btn btn-outline btn-sm" type="button" data-settings-edit-category="' + UI.escapeHtml(c.id) + '">تعديل</button>' +
        '<button class="btn btn-danger btn-sm" type="button" data-settings-del-category="' + UI.escapeHtml(c.id) + '">حذف</button>' +
        '</div></div>';
    });
    html += '<div class="muted" style="margin-top:10px">تظهر هذه الفئات في نموذج إضافة المصروف لكل مجموعة تدريب.</div></div>';

    html += '</section>';

    html += settingsSectionHead(5, 'العرض والتنسيق', 'تفضيلات العرض وتنسيق ملفات إكسل — محفوظة على هذا الجهاز فقط.');

    // القسم 5 — العرض والتنسيق: إدارة العرض (محفوظة على هذا الجهاز فقط)
    var calViewPref = UI.getSetting('calendarView', 'week');
    var dashCardsPref = UI.getSetting('dashboardCards', UI.SETTING_DEFAULTS.dashboardCards);
    var densityPref = UI.getSetting('tableDensity', 'comfortable');
    html += '<div class="card-white"><div class="section-title-row"><h2>إدارة العرض</h2></div>' +
      '<p class="muted" style="margin-top:0">إعدادات العرض محفوظة على هذا الجهاز فقط.</p>' +
      '<div class="form-grid">' +
      '<div class="field"><label>العرض الافتراضي للتقويم</label><select class="input" id="settings-calendar-view">' +
      '<option value="day"' + (calViewPref === 'day' ? ' selected' : '') + '>يوم</option>' +
      '<option value="week"' + (calViewPref === 'week' ? ' selected' : '') + '>أسبوع</option>' +
      '<option value="month"' + (calViewPref === 'month' ? ' selected' : '') + '>شهر</option>' +
      '</select></div>' +
      '<div class="field"><label>كثافة الجداول</label><select class="input" id="settings-density">' +
      '<option value="comfortable"' + (densityPref !== 'compact' ? ' selected' : '') + '>مريحة</option>' +
      '<option value="compact"' + (densityPref === 'compact' ? ' selected' : '') + '>مدمجة</option>' +
      '</select></div>' +
      '</div>' +
      '<div class="field" style="margin-top:12px"><label>بطاقات لوحة التحكم</label>' +
      DASHBOARD_CARD_DEFS.map(function (def) {
        return '<label class="check-row"><input type="checkbox" data-dash-card="' + def.key + '"' +
          (dashCardsPref[def.key] !== false ? ' checked' : '') + '> ' + UI.escapeHtml(def.label) + '</label>';
      }).join('') +
      '<div class="field-hint">البطاقات غير المحددة لا تظهر في لوحة المعلومات.</div></div>' +
      '</div>';

    // القسم 5 — العرض والتنسيق: إدارة التنسيق (محفوظة على هذا الجهاز فقط)
    var fmtPref = UI.getSetting('exportFmt', UI.SETTING_DEFAULTS.exportFmt);
    html += '<div class="card-white"><div class="section-title-row"><h2>إدارة التنسيق</h2></div>' +
      '<p class="muted" style="margin-top:0">تنسيق ملفات إكسل المصدَّرة — محفوظ على هذا الجهاز فقط.</p>' +
      '<div class="form-grid">' +
      '<div class="field"><label>تنسيق التاريخ</label><select class="input" id="settings-export-date">' +
      '<option value="iso"' + (fmtPref.dateFormat === 'iso' ? ' selected' : '') + '>2026-11-17</option>' +
      '<option value="dmy"' + (fmtPref.dateFormat === 'dmy' ? ' selected' : '') + '>17/11/2026</option>' +
      '<option value="long"' + (fmtPref.dateFormat === 'long' ? ' selected' : '') + '>17 تشرين الثاني 2026</option>' +
      '</select></div>' +
      '<div class="field"><label>أرقام التصدير</label><select class="input" id="settings-export-numbers">' +
      '<option value="western"' + (fmtPref.numbers !== 'eastern' ? ' selected' : '') + '>غربية 0123</option>' +
      '<option value="eastern"' + (fmtPref.numbers === 'eastern' ? ' selected' : '') + '>مشرقية ٠١٢٣</option>' +
      '</select></div>' +
      '</div>' +
      '<label class="check-row"><input type="checkbox" id="settings-export-thousands"' + (fmtPref.thousands !== false ? ' checked' : '') + '> فاصل الآلاف</label>' +
      '<label class="check-row"><input type="checkbox" id="settings-export-title"' + (fmtPref.title !== false ? ' checked' : '') + '> تضمين صف العنوان</label>' +
      '</div>';

    html += '</section>';

    html += settingsSectionHead(6, 'حول المنصة', 'إصدار المنصة وأرقامها الموجزة.');

    // القسم 6 — حول المنصة
    html += '<div class="card-white"><div class="section-title-row"><h2>حول المنصة</h2></div>' +
      '<p class="muted" style="margin-top:0">المنصة: تدريب · الإصدار: 2.3.1</p>' +
      '<div class="stats" style="margin-bottom:0">' +
      '<div class="stat"><div class="stat-num" id="settings-count-users">…</div><div class="stat-label">عدد المستخدمين</div></div>' +
      '<div class="stat"><div class="stat-num">' + UI.fmtNumber(Store.getAll('courses').length) + '</div><div class="stat-label">عدد مجموعات التدريب</div></div>' +
      '<div class="stat"><div class="stat-num">' + UI.fmtNumber(Store.getAll('trainees').length) + '</div><div class="stat-label">عدد المتدربين</div></div>' +
      '</div></div>';

    html += '</section>';

    container.innerHTML = html;

    // لوحات إحصاءات الأقسام (v2.1 — بند 10): الفترات والمستويات
    // والعطل. فئات الميزانية بلا لوحة (الصرف حسب الفئة في لوحة
    // المصاريف في شاشة الإدارة)؛ ومستخدمو هذا القسم وحول المنصة بلا
    // لوحات (لوحة المستخدمين في شاشة الإدارة، وعدّادات حول المنصة قائمة).
    renderStatsPanel(container, 'settings-periods-stats-panel', {
      section: 'periods',
      title: 'إحصاءات الفترات',
      compute: function () { return window.TadreebStats.computePeriods(); },
      exportTitle: 'تصدير إحصاءات الفترات',
      exportFn: 'exportPeriodsStats',
      exportKind: 'periods-stats',
      columns: [
        { id: 'label', label: 'الفترة', checked: true },
        { id: 'code', label: 'المعرّف', checked: true },
        { id: 'time', label: 'الوقت', checked: true },
        { id: 'duration', label: 'المدة (دقيقة)', checked: true },
        { id: 'sessions', label: 'عدد الجلسات', checked: true },
        { id: 'share', label: 'الحصة %', checked: true }
      ]
    });
    renderStatsPanel(container, 'settings-levels-stats-panel', {
      section: 'levels',
      title: 'إحصاءات المستويات',
      compute: function () { return window.TadreebStats.computeLevels(); },
      exportTitle: 'تصدير إحصاءات المستويات',
      exportFn: 'exportLevelsStats',
      exportKind: 'levels-stats',
      columns: [
        { id: 'level', label: 'المستوى', checked: true },
        { id: 'courses', label: 'عدد مجموعات التدريب', checked: true },
        { id: 'sessions', label: 'عدد الجلسات', checked: true },
        { id: 'trainees', label: 'عدد المتدربين', checked: true }
      ]
    });
    renderStatsPanel(container, 'settings-holidays-stats-panel', {
      section: 'holidays',
      title: 'إحصاءات العطل',
      compute: function () { return window.TadreebStats.computeHolidays(); },
      exportTitle: 'تصدير العطل',
      exportFn: 'exportHolidays',
      exportKind: 'holidays',
      columns: [
        { id: 'date', label: 'التاريخ', checked: true },
        { id: 'name', label: 'اسم العطلة', checked: true },
        { id: 'note', label: 'الملاحظة', checked: true }
      ]
    });

    loadSettingsUsers();

    document.getElementById('settings-add-period').addEventListener('click', function () { settingsOpenAddModal('period'); });
    document.getElementById('settings-add-holiday').addEventListener('click', function () { settingsOpenAddModal('holiday'); });
    document.getElementById('settings-add-category').addEventListener('click', function () { settingsAddCategory(); });
    document.getElementById('settings-add-level').addEventListener('click', function () { settingsAddLevel(); });
    document.getElementById('settings-add-user').addEventListener('click', function () { openAddUserModal(); });

    // العطلة الأسبوعية (v2.3 — W3): تبديل مظهر الشريحة عند النقر،
    // ومزامنة المربعات مع القيمة المحفوظة بعد التحميل، ثم الحفظ.
    var weekendPicker = document.getElementById('settings-weekend-picker');
    if (weekendPicker) {
      weekendPicker.addEventListener('change', function (e) {
        var cb = e.target && e.target.closest ? e.target.closest('[data-weekend-day]') : null;
        if (cb) {
          var lbl = cb.closest('label');
          if (lbl) lbl.classList.toggle('checked', cb.checked);
        }
      });
      if (window.TadreebDB && typeof window.TadreebDB.loadWeekendDays === 'function') {
        window.TadreebDB.loadWeekendDays().then(function (days) {
          weekendPicker.querySelectorAll('[data-weekend-day]').forEach(function (cb) {
            var on = days.indexOf(parseInt(cb.getAttribute('data-weekend-day'), 10)) !== -1;
            cb.checked = on;
            var lbl2 = cb.closest('label');
            if (lbl2) lbl2.classList.toggle('checked', on);
          });
        }).catch(function () { /* تبقى القيم المعروضة */ });
      }
    }
    var weekendSaveBtn = document.getElementById('settings-save-weekend');
    if (weekendSaveBtn) weekendSaveBtn.addEventListener('click', function () {
      var days = [];
      container.querySelectorAll('[data-weekend-day]:checked').forEach(function (cb) {
        days.push(parseInt(cb.getAttribute('data-weekend-day'), 10));
      });
      if (!days.length) { UI.toast('اختر يوماً واحداً على الأقل للعطلة الأسبوعية', 'error'); return; }
      UI.setBtnLoading(weekendSaveBtn, true, 'جارٍ الحفظ…');
      window.TadreebDB.setWeekendDays(days).then(function () {
        UI.setBtnLoading(weekendSaveBtn, false);
        UI.toast('تم حفظ أيام العطلة الأسبوعية', 'success');
      }).catch(function (err) {
        UI.setBtnLoading(weekendSaveBtn, false);
        UI.toastError(err);
      });
    });

    // إدارة العرض
    var calViewSel = document.getElementById('settings-calendar-view');
    if (calViewSel) calViewSel.addEventListener('change', function () {
      UI.setSetting('calendarView', calViewSel.value);
      UI.toast('تم حفظ العرض الافتراضي للتقويم', 'success');
    });
    var densitySel = document.getElementById('settings-density');
    if (densitySel) densitySel.addEventListener('change', function () {
      UI.setSetting('tableDensity', densitySel.value);
      if (typeof App.applyDisplaySettings === 'function') App.applyDisplaySettings();
      UI.toast('تم حفظ كثافة الجداول', 'success');
    });
    container.querySelectorAll('[data-dash-card]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var cards = UI.getSetting('dashboardCards', UI.SETTING_DEFAULTS.dashboardCards);
        var next = {};
        DASHBOARD_CARD_DEFS.forEach(function (def) { next[def.key] = cards[def.key] !== false; });
        next[cb.getAttribute('data-dash-card')] = cb.checked;
        UI.setSetting('dashboardCards', next);
        UI.toast('تم حفظ بطاقات لوحة التحكم', 'success');
      });
    });

    // إدارة التنسيق
    function saveExportFmt(patch) {
      var cur = UI.getSetting('exportFmt', UI.SETTING_DEFAULTS.exportFmt);
      var next = {
        dateFormat: cur.dateFormat || 'iso',
        numbers: cur.numbers || 'western',
        thousands: cur.thousands !== false,
        title: cur.title !== false
      };
      Object.keys(patch).forEach(function (k) { next[k] = patch[k]; });
      UI.setSetting('exportFmt', next);
      UI.toast('تم حفظ تنسيق التصدير', 'success');
    }
    var expDateSel = document.getElementById('settings-export-date');
    if (expDateSel) expDateSel.addEventListener('change', function () {
      saveExportFmt({ dateFormat: expDateSel.value });
    });
    var expNumSel = document.getElementById('settings-export-numbers');
    if (expNumSel) expNumSel.addEventListener('change', function () {
      saveExportFmt({ numbers: expNumSel.value });
    });
    var expThousands = document.getElementById('settings-export-thousands');
    if (expThousands) expThousands.addEventListener('change', function () {
      saveExportFmt({ thousands: expThousands.checked });
    });
    var expTitle = document.getElementById('settings-export-title');
    if (expTitle) expTitle.addEventListener('change', function () {
      saveExportFmt({ title: expTitle.checked });
    });

    container.querySelectorAll('[data-settings-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        settingsOpenEditModal(btn.getAttribute('data-settings-edit'), btn.getAttribute('data-id'));
      });
    });
    container.querySelectorAll('[data-settings-del-entity]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        settingsDeleteEntity(btn.getAttribute('data-settings-del-entity'), btn.getAttribute('data-id'));
      });
    });
    container.querySelectorAll('[data-settings-notes]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        settingsOpenNotesModal(btn.getAttribute('data-settings-notes'), btn.getAttribute('data-id'));
      });
    });
    container.querySelectorAll('[data-settings-del-category]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        settingsDeleteCategory(btn.getAttribute('data-settings-del-category'));
      });
    });
    container.querySelectorAll('[data-settings-edit-category]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        settingsEditCategory(btn.getAttribute('data-settings-edit-category'));
      });
    });
    container.querySelectorAll('[data-settings-del-level]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        settingsDeleteLevel(btn.getAttribute('data-settings-del-level'));
      });
    });
    container.querySelectorAll('[data-settings-edit-level]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        settingsEditLevel(btn.getAttribute('data-settings-edit-level'));
      });
    });
  }

  // أزرار إجراءات صفّ الفترة/العطلة (نمط القوائم المرتبة v2.1):
  // أزرار ظاهرة حقيقية — تُستدعى داخل <div class="list-row-actions">.
  function settingsActionRow(type, id) {
    return '<button class="btn btn-outline btn-sm" type="button" data-settings-notes="' + type + '" data-id="' + UI.escapeHtml(id) + '">ملاحظات</button>' +
      '<button class="btn btn-outline btn-sm" type="button" data-settings-edit="' + type + '" data-id="' + UI.escapeHtml(id) + '">تعديل</button>' +
      '<button class="btn btn-danger btn-sm" type="button" data-settings-del-entity="' + type + '" data-id="' + UI.escapeHtml(id) + '">حذف</button>';
  }

  // --- الفترات والعطل: نماذج منقولة من شاشة الدليل كما هي ---
  function settingsPeriodFields(item) {
    item = item || {};
    var periods = App.Store.getAll('periods');
    var maxOrder = periods.reduce(function (m, p) { return Math.max(m, p.order || 0); }, 0);
    // المعرّف: عند الإنشاء الرمز التالي المتاح، وعند التعديل المخزَّن أو
    // المشتق من ترتيب الإنشاء للفترات القديمة — قابل للتعديل دائماً.
    var codeVal = item.id ? (item.code || App.displayCode(item, 'periods')) : App.nextCode('periods');
    return '<div class="field"><label>اسم الفترة *</label><input type="text" name="label" required value="' + UI.escapeHtml(item.label || '') + '" placeholder="مثال: الفترة الرابعة"></div>' +
      '<div class="field"><label>المعرّف *</label><input type="text" name="code" required value="' + UI.escapeHtml(codeVal) + '"></div>' +
      '<div class="form-grid"><div class="field"><label>من *</label><input type="time" name="start" required value="' + UI.escapeHtml(item.start || '') + '"></div>' +
      '<div class="field"><label>إلى *</label><input type="time" name="end" required value="' + UI.escapeHtml(item.end || '') + '"></div></div>' +
      '<div class="muted" id="period-duration-hint" style="margin-top:-6px;margin-bottom:12px"></div>' +
      '<div class="field"><label>الترتيب</label><input type="number" name="order" min="1" max="4" value="' + UI.escapeHtml(item.order != null ? item.order : maxOrder + 1) + '"></div>';
  }

  function settingsHolidayFields(item) {
    item = item || {};
    return '<div class="field"><label>التاريخ *</label><input type="date" name="date" required value="' + UI.escapeHtml(item.date || '') + '"></div>' +
      '<div class="field"><label>اسم العطلة *</label><input type="text" name="name" required value="' + UI.escapeHtml(item.name || '') + '" placeholder="مثال: عيد العمال"></div>';
  }

  function settingsReadFormData(type, form) {
    var v = function (name) {
      var el = form.querySelector('[name="' + name + '"]');
      return el ? el.value.trim() : '';
    };
    if (type === 'period') {
      return {
        label: v('label'),
        code: v('code'),
        start: v('start'),
        end: v('end'),
        order: parseInt(form.querySelector('[name="order"]').value, 10) || 1
      };
    }
    return { date: v('date'), name: v('name') };
  }

  // excludeId: معرّف السجل الجاري تعديله (يُستثنى من فحص تكرار المعرّف)؛
  // بلا قيمة عند الإنشاء.
  function settingsValidateFormData(type, data, form, excludeId) {
    if (type === 'holiday') {
      if (!data.name) { UI.formError(form, 'الاسم مطلوب'); return false; }
      if (!data.date) { UI.formError(form, 'التاريخ مطلوب'); return false; }
    }
    if (type === 'period') {
      if (!data.label) { UI.formError(form, 'اسم الفترة مطلوب'); return false; }
      if (!data.code) { UI.formError(form, 'المعرّف مطلوب'); return false; }
      if (!App.isCodeUnique('periods', data.code, excludeId || null)) {
        UI.formError(form, 'هذا المعرّف مستخدم من قبل — اختر معرّفاً آخر');
        return false;
      }
      if (!data.start || !data.end) { UI.formError(form, 'وقتا البداية والنهاية مطلوبان'); return false; }
      // أوقات حرة تماماً: التحقق الوحيد أن النهاية بعد البداية (لا قيد على المدة).
      if (data.start >= data.end) { UI.formError(form, 'وقت النهاية يجب أن يكون بعد وقت البداية'); return false; }
    }
    return true;
  }

  // تلميح مباشر بمدة الفترة داخل نموذج الإضافة/التعديل — يتحدث مع
  // تغيير وقتي البداية والنهاية. (منقول من شاشة الدليل كما هو)
  function wirePeriodDurationHint(root) {
    if (!root) return;
    var startEl = root.querySelector('[name="start"]');
    var endEl = root.querySelector('[name="end"]');
    var hint = root.querySelector('#period-duration-hint');
    if (!startEl || !endEl || !hint) return;
    function update() {
      var dur = UI.fmtDuration(startEl.value, endEl.value);
      hint.textContent = dur ? 'المدة: ' + dur : '';
    }
    startEl.addEventListener('input', update);
    startEl.addEventListener('change', update);
    endEl.addEventListener('input', update);
    endEl.addEventListener('change', update);
    update();
  }

  function settingsOpenAddModal(type) {
    var meta = SETTINGS_META[type];
    if (!meta) return;
    if (type === 'period' && App.Store.getAll('periods').length >= 4) {
      UI.toast('الحد الأقصى 4 فترات تدريبية', 'error');
      return;
    }
    var fields = type === 'period' ? settingsPeriodFields(null) : settingsHolidayFields(null);
    var modal = UI.openFormModal('إضافة ' + meta.title, fields, function (form, close, submitBtn) {
      var data = settingsReadFormData(type, form);
      if (!settingsValidateFormData(type, data, form)) return;
      UI.formError(form, '');
      UI.setBtnLoading(submitBtn, true);
      window.TadreebDB.add(meta.col, data).then(function () {
        UI.setBtnLoading(submitBtn, false);
        close();
        UI.toast('تمت إضافة ' + meta.label, 'success');
        App.refresh();
      }).catch(function (err) { UI.setBtnLoading(submitBtn, false); UI.formError(form, err.message); });
    }, { submitLabel: 'إضافة', width: 'normal' });
    if (type === 'period') wirePeriodDurationHint(modal.element);
  }

  function settingsOpenEditModal(type, id) {
    var meta = SETTINGS_META[type];
    if (!meta) return;
    var item = App.Store.get(meta.col, id);
    if (!item) return;
    var fields = type === 'period' ? settingsPeriodFields(item) : settingsHolidayFields(item);
    var modal = UI.openFormModal('تعديل ' + meta.label, fields, function (form, close, submitBtn) {
      var data = settingsReadFormData(type, form);
      if (!settingsValidateFormData(type, data, form, id)) return;
      UI.formError(form, '');
      UI.setBtnLoading(submitBtn, true);
      window.TadreebDB.update(meta.col, id, data).then(function () {
        UI.setBtnLoading(submitBtn, false);
        close();
        UI.toast('تم حفظ التعديلات', 'success');
        App.refresh();
      }).catch(function (err) { UI.setBtnLoading(submitBtn, false); UI.formError(form, err.message); });
    }, { submitLabel: 'حفظ التعديلات', width: 'normal' });
    if (type === 'period') wirePeriodDurationHint(modal.element);
  }

  function settingsDeleteEntity(type, id) {
    var meta = SETTINGS_META[type];
    if (!meta) return;
    var item = App.Store.get(meta.col, id);
    if (!item) return;
    var label = item.name || item.label || UI.fmtDate(item.date) || '';
    var warning = '';
    if (type === 'period') {
      var pCount = App.Store.getAll('courses').filter(function (c) { return c.periodId === id; }).length;
      if (pCount) warning = ' هذه الفترة مستخدمة في ' + pCount + ' مجموعة تدريب — ستظهر مجموعات التدريب تلك بلا فترة.';
    }
    UI.confirmDialog('حذف ' + meta.label, 'هل أنت متأكد من حذف «' + label + '»؟ لا يمكن التراجع.' + warning,
      function () {
        window.TadreebDB.remove(meta.col, id).then(function () {
          UI.toast('تم حذف ' + meta.label, 'success');
          App.refresh();
        }).catch(UI.toastError);
      });
  }

  function settingsOpenNotesModal(type, id) {
    var meta = SETTINGS_META[type];
    if (!meta) return;
    var item = App.Store.get(meta.col, id);
    if (!item) return;
    var label = item.name || item.label || UI.fmtDate(item.date) || '';
    var destroy = null;
    var m = UI.openModal({
      title: 'ملاحظات — ' + label,
      bodyHTML: '<div id="settings-notes-box"></div>',
      actions: [{ label: 'إغلاق', className: 'btn-outline', closeOnClick: true }],
      onClose: function () { if (typeof destroy === 'function') destroy(); }
    });
    destroy = UI.notesWidget(type, id, m.element.querySelector('#settings-notes-box'), { canWrite: true });
  }

  // --- فئات الميزانية: منقولة من شاشة الدليل كما هي ---
  function settingsAddCategory() {
    UI.openFormModal('إضافة فئة ميزانية',
      '<div class="field"><label>اسم الفئة *</label><input type="text" name="name" required placeholder="مثال: مواصلات"></div>' +
      '<div class="field"><label>المعرّف *</label><input type="text" name="code" required value="' + UI.escapeHtml(App.nextCode('budgetCategories')) + '"></div>',
      function (form, close, submitBtn) {
        var name = form.querySelector('[name="name"]').value.trim();
        var code = form.querySelector('[name="code"]').value.trim();
        if (!name) { UI.formError(form, 'اسم الفئة مطلوب'); return; }
        if (!code) { UI.formError(form, 'المعرّف مطلوب'); return; }
        if (!App.isCodeUnique('budgetCategories', code, null)) {
          UI.formError(form, 'هذا المعرّف مستخدم من قبل — اختر معرّفاً آخر');
          return;
        }
        UI.formError(form, '');
        UI.setBtnLoading(submitBtn, true);
        window.TadreebDB.add('budgetCategories', { name: name, code: code }).then(function () {
          UI.setBtnLoading(submitBtn, false);
          close();
          UI.toast('تمت إضافة الفئة', 'success');
          App.refresh();
        }).catch(function (err) { UI.setBtnLoading(submitBtn, false); UI.formError(form, err.message); });
      }, { submitLabel: 'إضافة الفئة', width: 'normal' });
  }

  // تعديل فئة ميزانية (الاسم والمعرّف). عند تغيير الاسم تُحدَّث المصاريف
  // المسجلة بالاسم القديم إلى الاسم الجديد، لأن المصروف يخزّن اسم الفئة.
  function settingsEditCategory(id) {
    var cat = App.Store.get('budgetCategories', id);
    if (!cat) return;
    var codeVal = cat.code || App.displayCode(cat, 'budgetCategories');
    UI.openFormModal('تعديل فئة ميزانية',
      '<div class="field"><label>اسم الفئة *</label><input type="text" name="name" required value="' + UI.escapeHtml(cat.name || '') + '"></div>' +
      '<div class="field"><label>المعرّف *</label><input type="text" name="code" required value="' + UI.escapeHtml(codeVal) + '"></div>',
      function (form, close, submitBtn) {
        var name = form.querySelector('[name="name"]').value.trim();
        var code = form.querySelector('[name="code"]').value.trim();
        if (!name) { UI.formError(form, 'اسم الفئة مطلوب'); return; }
        if (!code) { UI.formError(form, 'المعرّف مطلوب'); return; }
        if (!App.isCodeUnique('budgetCategories', code, id)) {
          UI.formError(form, 'هذا المعرّف مستخدم من قبل — اختر معرّفاً آخر');
          return;
        }
        UI.formError(form, '');
        UI.setBtnLoading(submitBtn, true);
        var oldName = cat.name;
        var chain = window.TadreebDB.update('budgetCategories', id, { name: name, code: code });
        if (name !== oldName) {
          App.Store.getAll('expenses').filter(function (e) { return e.category === oldName; }).forEach(function (e) {
            chain = chain.then(function () { return window.TadreebDB.update('expenses', e.id, { category: name }); });
          });
        }
        chain.then(function () {
          UI.setBtnLoading(submitBtn, false);
          close();
          UI.toast('تم حفظ التعديلات', 'success');
          App.refresh();
        }).catch(function (err) { UI.setBtnLoading(submitBtn, false); UI.formError(form, err.message); });
      }, { submitLabel: 'حفظ التعديلات', width: 'normal' });
  }

  function settingsDeleteCategory(id) {
    var cat = App.Store.get('budgetCategories', id);
    if (!cat) return;
    UI.confirmDialog('حذف الفئة', 'هل أنت متأكد من حذف فئة «' + cat.name + '»؟ المصاريف المسجلة بهذه الفئة تبقى كما هي.',
      function () {
        window.TadreebDB.remove('budgetCategories', cat.id).then(function () {
          UI.toast('تم حذف الفئة', 'success');
          App.refresh();
        }).catch(UI.toastError);
      });
  }

  // --- مستويات الدورات المخصصة (نفس نمط فئات الميزانية) ---
  // المستويات الافتراضية ثوابت برمجية (App.LEVEL_LABELS) لا تُحذف ولا
  // تُعدَّل. المخصصة في مجموعة levels: {name, createdAt} فقط، وتُدار
  // عبر الدوال العامة نفسها (فيُسجَّل التدقيق تلقائياً كما في الفئات).
  // قاعدة الحذف: مستوى معيّن في دورة واحدة على الأقل لا يُحذف أبداً
  // (بلا إعادة تعيين صامتة) — يُرفض برسالة واضحة تذكر عدد الدورات.
  function levelNameExists(name, excludeId) {
    var n = String(name || '').trim();
    return App.Store.getAll('levels').some(function (l) {
      return l.id !== excludeId && String(l.name || '').trim() === n;
    });
  }

  function settingsAddLevel() {
    UI.openFormModal('إضافة مستوى مجموعة تدريب',
      '<div class="field"><label>اسم المستوى *</label><input type="text" name="name" required placeholder="مثال: مستوى احترافي"></div>',
      function (form, close, submitBtn) {
        var name = form.querySelector('[name="name"]').value.trim();
        if (!name) { UI.formError(form, 'اسم المستوى مطلوب'); return; }
        if (levelNameExists(name, null)) { UI.formError(form, 'يوجد مستوى بهذا الاسم'); return; }
        UI.formError(form, '');
        UI.setBtnLoading(submitBtn, true);
        window.TadreebDB.add('levels', { name: name }).then(function () {
          UI.setBtnLoading(submitBtn, false);
          close();
          UI.toast('تمت إضافة المستوى', 'success');
          App.refresh();
        }).catch(function (err) { UI.setBtnLoading(submitBtn, false); UI.formError(form, err.message); });
      }, { submitLabel: 'إضافة المستوى', width: 'normal' });
  }

  function settingsEditLevel(id) {
    var level = App.Store.get('levels', id);
    if (!level) return;
    UI.openFormModal('تعديل مستوى مجموعة تدريب',
      '<div class="field"><label>اسم المستوى *</label><input type="text" name="name" required value="' + UI.escapeHtml(level.name || '') + '"></div>',
      function (form, close, submitBtn) {
        var name = form.querySelector('[name="name"]').value.trim();
        if (!name) { UI.formError(form, 'اسم المستوى مطلوب'); return; }
        if (levelNameExists(name, id)) { UI.formError(form, 'يوجد مستوى بهذا الاسم'); return; }
        UI.formError(form, '');
        UI.setBtnLoading(submitBtn, true);
        window.TadreebDB.update('levels', id, { name: name }).then(function () {
          UI.setBtnLoading(submitBtn, false);
          close();
          UI.toast('تم حفظ التعديلات', 'success');
          App.refresh();
        }).catch(function (err) { UI.setBtnLoading(submitBtn, false); UI.formError(form, err.message); });
      }, { submitLabel: 'حفظ التعديلات', width: 'normal' });
  }

  function settingsDeleteLevel(id) {
    var level = App.Store.get('levels', id);
    if (!level) return;
    var used = App.Store.getAll('courses').filter(function (c) { return c.level === id; }).length;
    if (used) {
      UI.toast('لا يمكن حذف هذا المستوى — معيّن في ' + used + ' مجموعة تدريب', 'error');
      return;
    }
    UI.confirmDialog('حذف المستوى', 'هل أنت متأكد من حذف مستوى «' + level.name + '»؟ لا يمكن التراجع.',
      function () {
        window.TadreebDB.remove('levels', level.id).then(function () {
          UI.toast('تم حذف المستوى', 'success');
          App.refresh();
        }).catch(UI.toastError);
      });
  }

  // --- إدارة المستخدمين ---
  function loadSettingsUsers() {
    var box = document.getElementById('settings-users-box');
    if (!box) return;
    box.innerHTML = UI.loadingState('جارٍ تحميل الحسابات…');
    window.TadreebAuth.listUsers().then(function (users) {
      var me = window.TadreebAuth.getCurrentProfile();
      var countEl = document.getElementById('settings-count-users');
      if (countEl) countEl.textContent = UI.fmtNumber(users.length);
      if (!users.length) {
        box.innerHTML = '<div class="muted">لا حسابات مسجلة.</div>';
        return;
      }
      var html = '';
      users.forEach(function (u) {
        var isMe = me && u.uid === me.uid;
        var disabled = u.disabled === true;
        var created = UI.fmtTimestamp(u.createdAt);
        html += '<div class="list-row"><div class="list-row-main">' +
          '<div class="list-row-title"><strong>' + UI.escapeHtml(u.username) + '</strong>' + (isMe ? ' <span class="pill pill-navy">أنت</span>' : '') +
          ' ' + (disabled ? '<span class="pill pill-red">معطّل</span>' : '<span class="pill pill-green">نشط</span>') + '</div>' +
          (created ? '<div class="list-row-meta muted">أُنشئ في ' + UI.escapeHtml(created) + '</div>' : '') +
          '</div><div class="list-row-actions row-actions">' +
          '<select class="input" data-settings-role="' + UI.escapeHtml(u.uid) + '"' + (isMe ? ' disabled title="لا يمكنك تغيير دور حسابك الحالي"' : '') + '>' +
          ['admin', 'editor', 'viewer'].map(function (r) {
            return '<option value="' + r + '"' + (u.role === r ? ' selected' : '') + '>' + UI.roleLabel(r) + '</option>';
          }).join('') + '</select>' +
          '<button class="btn btn-outline btn-sm" type="button" data-settings-reset="' + UI.escapeHtml(u.uid) + '" data-username="' + UI.escapeHtml(u.username) + '">إعادة تعيين كلمة المرور</button>' +
          (isMe ? '<button class="btn btn-outline btn-sm" type="button" disabled title="لا يمكنك تعطيل حسابك الحالي">تعطيل</button>' :
            '<button class="btn btn-outline btn-sm" type="button" data-settings-toggle="' + UI.escapeHtml(u.uid) + '" data-username="' + UI.escapeHtml(u.username) + '" data-disabled="' + (disabled ? '1' : '0') + '">' + (disabled ? 'تفعيل' : 'تعطيل') + '</button>') +
          (isMe ? '<span class="muted">لا يمكن حذف حسابك الحالي</span>' :
            '<button class="btn btn-danger btn-sm" type="button" data-settings-del-user="' + UI.escapeHtml(u.uid) + '" data-username="' + UI.escapeHtml(u.username) + '">حذف</button>') +
          '</div></div>';
      });
      html += '<div class="muted" style="margin-top:10px">تعطيل الحساب يمنع دخوله فوراً، ويُنهي جلسته النشطة إن وُجدت، ويمكن التراجع عنه في أي وقت. حذف الحساب يزيله من المنصة فيمنع دخوله؛ حساب تسجيل الدخول نفسه يبقى في وحدة تحكم Firebase ويمكن حذفه نهائياً من هناك (Authentication ← Users).</div>';
      box.innerHTML = html;

      box.querySelectorAll('[data-settings-role]').forEach(function (sel) {
        sel.addEventListener('change', function () {
          var uid = sel.getAttribute('data-settings-role');
          var role = sel.value;
          // تغيير الدور يتطلب تأكيد هوية المدير؛ عند الإلغاء تُعاد
          // القائمة فيعود المحدد للدور الحالي.
          UI.requireReauth(function () {
            window.TadreebAuth.setUserRole(uid, role).then(function () {
              UI.toast('تم تغيير دور الحساب إلى ' + UI.roleLabel(role), 'success');
            }).catch(function (err) {
              UI.toastError(err);
              loadSettingsUsers();
            });
          }, function () { loadSettingsUsers(); });
        });
      });
      box.querySelectorAll('[data-settings-reset]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          openResetPasswordModal(btn.getAttribute('data-username'));
        });
      });
      box.querySelectorAll('[data-settings-toggle]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var uid = btn.getAttribute('data-settings-toggle');
          var username = btn.getAttribute('data-username');
          var isDisabled = btn.getAttribute('data-disabled') === '1';
          UI.confirmDialog(isDisabled ? 'تفعيل الحساب' : 'تعطيل الحساب',
            isDisabled
              ? 'هل أنت متأكد من تفعيل حساب «' + username + '»؟ سيتمكن من تسجيل الدخول من جديد.'
              : 'هل أنت متأكد من تعطيل حساب «' + username + '»؟ لن يتمكن من تسجيل الدخول، وستُنهى جلسته النشطة فوراً إن وُجدت.',
            function () {
              window.TadreebAuth.setUserDisabled(uid, !isDisabled).then(function () {
                UI.toast(isDisabled ? 'تم تفعيل الحساب' : 'تم تعطيل الحساب', 'success');
                loadSettingsUsers();
              }).catch(UI.toastError);
            });
        });
      });
      box.querySelectorAll('[data-settings-del-user]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var uid = btn.getAttribute('data-settings-del-user');
          var username = btn.getAttribute('data-username');
          UI.confirmDialog('حذف الحساب',
            'هل أنت متأكد من حذف حساب «' + username + '»؟ سيُزال من المنصة ولن يتمكن من تسجيل الدخول. حساب تسجيل الدخول نفسه يبقى في وحدة تحكم Firebase ويمكن حذفه نهائياً من هناك.',
            function () {
              UI.requireReauth(function () {
                window.TadreebAuth.deleteUserProfile(uid).then(function () {
                  UI.toast('تم حذف الحساب', 'success');
                  loadSettingsUsers();
                }).catch(UI.toastError);
              });
            });
        });
      });
    }).catch(function (err) {
      box.innerHTML = '<div class="muted">تعذّر تحميل الحسابات.</div>';
      UI.toastError(err);
    });
  }

  function openAddUserModal() {
    UI.openFormModal('إضافة مستخدم',
      '<div class="field"><label>اسم المستخدم *</label><input type="text" name="username" required placeholder="مثال: coordinator1" dir="ltr" style="text-align:right">' +
      '<div class="field-hint">من 3 إلى 30 حرفاً: أحرف لاتينية وأرقام ونقطة وشرطة سفلية وشرطة فقط.</div></div>' +
      '<div class="field"><label>كلمة المرور *</label><input type="password" name="password" required placeholder="10 أحرف على الأقل، مع حرف ورقم"></div>' +
      '<div class="field"><label>الدور *</label><select name="role">' +
      '<option value="editor">محرر — إضافة وتعديل وحذف</option>' +
      '<option value="viewer">عارض — قراءة فقط</option>' +
      '<option value="admin">مدير — كل الصلاحيات</option>' +
      '</select></div>',
      function (form, close, submitBtn) {
        var username = form.querySelector('[name="username"]').value.trim();
        var password = form.querySelector('[name="password"]').value;
        var role = form.querySelector('[name="role"]').value;
        var vUser = window.TadreebAuth.validateUsername(username);
        if (!vUser.ok) { UI.formError(form, vUser.error); return; }
        var vPass = window.TadreebAuth.validatePassword(password);
        if (!vPass.ok) { UI.formError(form, vPass.error); return; }
        UI.formError(form, '');
        UI.setBtnLoading(submitBtn, true);
        window.TadreebAuth.provisionUser(username, password, role).then(function () {
          UI.setBtnLoading(submitBtn, false);
          close();
          UI.toast('تم إنشاء الحساب بنجاح', 'success');
          loadSettingsUsers();
        }).catch(function (err) {
          UI.setBtnLoading(submitBtn, false);
          var msg = err && err.message ? err.message : 'تعذّر إنشاء الحساب';
          if (/auth\/email-already-in-use/i.test(msg)) msg = 'اسم المستخدم هذا مستخدم مسبقاً';
          UI.formError(form, msg);
        });
      }, { submitLabel: 'إنشاء الحساب', width: 'normal' });
  }

  function openResetPasswordModal(username) {
    UI.openFormModal('إعادة تعيين كلمة المرور — ' + username,
      '<div class="field"><label>كلمة المرور الحالية *</label><input type="password" name="currentPassword" required></div>' +
      '<div class="field"><label>كلمة المرور الجديدة *</label><input type="password" name="newPassword" required placeholder="10 أحرف على الأقل، مع حرف ورقم"></div>' +
      '<div class="field"><label>تأكيد كلمة المرور الجديدة *</label><input type="password" name="newPasswordConfirm" required></div>' +
      '<div class="muted">إعادة التعيين تحتاج كلمة المرور الحالية — إن لم تكن معروفة، عطّل الحساب وأنشئ حساباً جديداً.</div>',
      function (form, close, submitBtn) {
        var current = form.querySelector('[name="currentPassword"]').value;
        var next = form.querySelector('[name="newPassword"]').value;
        var confirm = form.querySelector('[name="newPasswordConfirm"]').value;
        if (!current) { UI.formError(form, 'كلمة المرور الحالية مطلوبة'); return; }
        var vPass = window.TadreebAuth.validatePassword(next);
        if (!vPass.ok) { UI.formError(form, vPass.error); return; }
        if (next !== confirm) { UI.formError(form, 'كلمتا المرور غير متطابقتين'); return; }
        UI.formError(form, '');
        UI.setBtnLoading(submitBtn, true);
        // إعادة التعيين تتطلب تأكيد هوية المدير نفسه (إضافة إلى
        // كلمة المرور الحالية للمستهدف التي يطلبها النموذج أصلاً).
        UI.requireReauth(function () {
          window.TadreebAuth.resetUserPassword(username, current, next).then(function () {
            UI.setBtnLoading(submitBtn, false);
            close();
            UI.toast('تمت إعادة تعيين كلمة المرور', 'success');
          }).catch(function (err) { UI.setBtnLoading(submitBtn, false); UI.formError(form, err.message); });
        }, function () { UI.setBtnLoading(submitBtn, false); });
      }, { submitLabel: 'إعادة التعيين', width: 'normal' });
  }

  window.Screens.admin = { render: render };
  window.Screens.settings = { render: renderSettings };
})();
