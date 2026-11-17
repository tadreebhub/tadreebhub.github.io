// تدريب — أدوات واجهة مشتركة (تنبيهات، نوافذ، ملاحظات، تنسيق).
// يُحمَّل قبل app.js. يكشف window.UI.
// كل النصوص بالعربية الفصحى؛ الأرقام لاتينية؛ أسماء الشهور شامية.
(function () {
  'use strict';

  // ---------- أسماء شامية (احتياطي إن لم تتوفر بيانات ar-SY) ----------
  var LEVANT_MONTHS = [
    'كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران',
    'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'
  ];
  var WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  var intlDate = null; // Intl.DateTimeFormat('ar-SY-u-nu-latn') إن كان سليماً
  try {
    var probe = new Intl.DateTimeFormat('ar-SY-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });
    var probeText = probe.format(new Date(2026, 10, 17)); // 17 تشرين الثاني 2026
    if (probeText.indexOf('تشرين الثاني') !== -1) {
      intlDate = probe;
    }
  } catch (e) { /* نستخدم التنسيق اليدوي أدناه */ }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function parseDateStr(s) {
    var parts = String(s || '').split('-');
    if (parts.length !== 3) return null;
    var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return isNaN(d.getTime()) ? null : d;
  }

  function dateToStr(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function todayStr() { return dateToStr(new Date()); }

  // "17 تشرين الثاني 2026" — أرقام لاتينية، شهر شامي.
  function fmtDate(s) {
    var d = typeof s === 'string' ? parseDateStr(s) : s;
    if (!d) return '';
    if (intlDate) return intlDate.format(d);
    return d.getDate() + ' ' + LEVANT_MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  // "الثلاثاء 17 تشرين الثاني 2026"
  function fmtDateFull(s) {
    var d = typeof s === 'string' ? parseDateStr(s) : s;
    if (!d) return '';
    return WEEKDAYS[d.getDay()] + ' ' + fmtDate(d);
  }

  // "17 تشرين الثاني" (بلا سنة)
  function fmtDateShort(s) {
    var d = typeof s === 'string' ? parseDateStr(s) : s;
    if (!d) return '';
    return d.getDate() + ' ' + LEVANT_MONTHS[d.getMonth()];
  }

  // "تشرين الثاني 2026"
  function fmtMonthYear(year, monthIndex) {
    return LEVANT_MONTHS[monthIndex] + ' ' + year;
  }

  function fmtWeekday(dateStr) {
    var d = parseDateStr(dateStr);
    return d ? WEEKDAYS[d.getDay()] : '';
  }

  // نطاق وقتين «HH:MM» بنظام 12 ساعة: «09:00 ص - 11:00 ص» — عبر
  // TadreebTime.formatTimeRange12 إن توفر (يغلّف النطاق بعلامتي
  // LRE…PDF حتى لا ينقلب في السياق العربي)، وإلا الصيغة الأصلية.
  function fmtTimeRange(start, end) {
    if (!start || !end) return '';
    if (window.TadreebTime && typeof window.TadreebTime.formatTimeRange12 === 'function') {
      try {
        return '<span class="ltr">' + escapeHtml(window.TadreebTime.formatTimeRange12(start, end)) + '</span>';
      } catch (e) { /* احتياطي أدناه */ }
    }
    return '<span class="ltr">' + escapeHtml(start) + ' - ' + escapeHtml(end) + '</span>';
  }

  // مدة الفترة بالعربية من وقتي "HH:MM": 60 ← «ساعة واحدة»، 120 ←
  // «ساعتان»، 3–10 ساعات ← «N ساعات»، 11+ ← «N ساعة»، دون الساعة ←
  // «N دقيقة»، مختلط ← «ساعة و30 دقيقة». نهاية ≤ بداية ← ''.
  function fmtDuration(start, end) {
    function mins(t) {
      var p = String(t || '').split(':');
      return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
    }
    var diff = mins(end) - mins(start);
    if (!isFinite(diff) || diff <= 0) return '';
    var hours = Math.floor(diff / 60);
    var minutes = diff % 60;
    var parts = [];
    if (hours === 1) parts.push(minutes > 0 ? 'ساعة' : 'ساعة واحدة');
    else if (hours === 2) parts.push('ساعتان');
    else if (hours >= 3 && hours <= 10) parts.push(hours + ' ساعات');
    else if (hours >= 11) parts.push(hours + ' ساعة');
    if (minutes > 0) parts.push(minutes + ' دقيقة');
    return parts.join(' و');
  }

  // وقت «Date» بنظام 12 ساعة: «09:30 ص» / «03:00 م» — عبر
  // TadreebTime.formatTime (توقيت دمشق) إن توفر، وإلا تحويل يدوي
  // صحيح من ساعة الجهاز (12 ← 12، 0 ← 12 ص، 13 ← 01 م).
  function fmtTime12Of(d) {
    if (window.TadreebTime && typeof window.TadreebTime.formatTime === 'function') {
      try { return window.TadreebTime.formatTime(d); } catch (e) { /* احتياطي أدناه */ }
    }
    var h = d.getHours();
    var suffix = h < 12 ? 'ص' : 'م';
    var h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return pad(h12) + ':' + pad(d.getMinutes()) + ' ' + suffix;
  }

  // طابع زمني (Timestamp من Firestore أو رقم أو Date) → "17 تشرين الثاني 2026، 09:30 ص"
  function fmtTimestamp(ts) {
    if (ts == null) return '';
    var d = null;
    if (typeof ts === 'number') d = new Date(ts);
    else if (ts instanceof Date) d = ts;
    else if (typeof ts.toDate === 'function') { try { d = ts.toDate(); } catch (e) { d = null; } }
    else if (typeof ts === 'string') d = new Date(ts);
    if (!d || isNaN(d.getTime())) return '';
    return fmtDate(d) + '، ' + fmtTime12Of(d);
  }

  function tsMillis(ts) {
    if (ts == null) return 0;
    if (typeof ts === 'number') return ts;
    if (ts instanceof Date) return ts.getTime();
    if (typeof ts.toMillis === 'function') { try { return ts.toMillis(); } catch (e) { return 0; } }
    if (typeof ts.seconds === 'number') return ts.seconds * 1000;
    return 0;
  }

  // أرقام لاتينية بفواصل آلاف: 2,500,000
  function fmtNumber(n) {
    var v = Number(n);
    if (!isFinite(v)) return '0';
    return v.toLocaleString('en-US');
  }

  function fmtMoney(n) {
    return fmtNumber(n) + ' ل.س';
  }

  function fmtPercent(part, total) {
    if (!total) return '0%';
    return Math.round((part / total) * 100) + '%';
  }

  // ---------- أمان: تهريب محتوى المستخدم ----------
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ---------- تنبيهات ----------
  function toast(msg, type) {
    var container = document.getElementById('toast-container');
    if (!container) return;
    var el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 4500);
  }

  function toastError(err) {
    var msg = (err && err.message) ? err.message : String(err || 'حدث خطأ غير متوقع');
    // رسائل أخطاء Firebase التقنية → رسالة عربية مفهومة.
    if (/network|unavailable|failed to fetch|ERR_/i.test(msg)) {
      msg = 'تعذّر الاتصال — تحقق من الاتصال بالإنترنت';
    } else if (/permission-denied/i.test(msg)) {
      msg = 'ليس لديك صلاحية لهذه العملية';
    } else if (/auth\/wrong-password|auth\/user-not-found|auth\/invalid-credential/i.test(msg)) {
      msg = 'اسم المستخدم أو كلمة المرور غير صحيحة';
    } else if (/auth\/too-many-requests/i.test(msg)) {
      msg = 'محاولات كثيرة — انتظر قليلاً ثم أعد المحاولة';
    }
    toast(msg, 'error');
  }

  // ---------- نوافذ عامة ----------
  var modalRoot = null;
  var openModalCount = 0;

  function getModalRoot() {
    if (!modalRoot) modalRoot = document.getElementById('modal-root');
    return modalRoot;
  }

  // openModal({title, bodyHTML, actions:[{label, className, onClick, closeOnClick}], width:'normal'|'wide'|'xwide', onClose})
  // تُرجع {close, element} — onClick تستقبل (close, modalEl).
  function openModal(opts) {
    opts = opts || {};
    var root = getModalRoot();
    if (!root) return { close: function () {}, element: null };

    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    var card = document.createElement('div');
    card.className = 'modal-card' + (opts.width === 'wide' ? ' wide' : opts.width === 'xwide' ? ' xwide' : '');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');

    var head = document.createElement('div');
    head.className = 'modal-head';
    var titleEl = document.createElement('h2');
    titleEl.textContent = opts.title || '';
    head.appendChild(titleEl);
    var closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.type = 'button';
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', 'إغلاق');
    head.appendChild(closeBtn);
    card.appendChild(head);

    var body = document.createElement('div');
    body.className = 'modal-body';
    if (opts.bodyHTML != null) body.innerHTML = opts.bodyHTML;
    card.appendChild(body);

    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      openModalCount = Math.max(0, openModalCount - 1);
      document.removeEventListener('keydown', onKey);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (typeof opts.onClose === 'function') opts.onClose();
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
    }
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
    document.addEventListener('keydown', onKey);

    var actions = Array.isArray(opts.actions) ? opts.actions : [];
    if (actions.length) {
      var footer = document.createElement('div');
      footer.className = 'modal-actions';
      actions.forEach(function (a) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn ' + (a.className || '');
        btn.textContent = a.label || '';
        btn.addEventListener('click', function () {
          if (typeof a.onClick === 'function') a.onClick(close, card, btn);
          else if (a.closeOnClick !== false) close();
        });
        footer.appendChild(btn);
      });
      card.appendChild(footer);
    }

    overlay.appendChild(card);
    root.appendChild(overlay);
    openModalCount++;
    return { close: close, element: card, body: body, overlay: overlay };
  }

  function isModalOpen() { return openModalCount > 0; }

  function closeAllModals() {
    var root = getModalRoot();
    if (root) root.innerHTML = '';
    openModalCount = 0;
  }

  // نافذة تأكيد: confirmDialog(title, body, onYes)
  function confirmDialog(title, body, onYes) {
    openModal({
      title: title,
      bodyHTML: '<p>' + escapeHtml(body || '') + '</p>',
      actions: [
        {
          label: 'تأكيد',
          className: 'btn-danger-solid',
          onClick: function (close) {
            close();
            if (typeof onYes === 'function') onYes();
          }
        },
        { label: 'إلغاء', className: 'btn-outline', closeOnClick: true }
      ]
    });
  }

  // نافذة نموذج: openFormModal(title, fieldsHTML, onSubmit(formEl, close, submitBtn), opts)
  // opts.onClose اختياري: يُستدعى عند إغلاق النافذة بأي طريقة.
  function openFormModal(title, fieldsHTML, onSubmit, opts) {
    opts = opts || {};
    var m = openModal({
      title: title,
      width: opts.width || 'wide',
      bodyHTML: '<form novalidate>' + fieldsHTML + '<div class="form-error"></div></form>',
      onClose: opts.onClose,
      actions: [
        {
          label: opts.submitLabel || 'حفظ',
          onClick: function (close, card, btn) {
            var form = card.querySelector('form');
            if (typeof onSubmit === 'function') onSubmit(form, close, btn);
          }
        },
        { label: 'إلغاء', className: 'btn-outline', closeOnClick: true }
      ]
    });
    // إرسال النموذج بمفتاح الإدخال.
    var form = m.element.querySelector('form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var btn = m.element.querySelector('.modal-actions .btn');
        if (btn) btn.click();
      });
    }
    return m;
  }

  // تأكيد الهوية قبل إجراء مدمّر: نافذة تطلب كلمة مرور المستخدم
  // الحالي وتتحقق منها (تطبيق Firebase ثانوي مؤقت — لا تسجيل خروج).
  // requireReauth(onConfirmed, onCancelled) — onConfirmed تُستدعى بعد
  // التحقق الناجح فقط؛ onCancelled عند إغلاق النافذة دون تأكيد
  // (إلغاء/✕/Escape). كلمة مرور خاطئة تُظهر خطأ وتُبقي النافذة مفتوحة.
  function requireReauth(onConfirmed, onCancelled) {
    var confirmed = false;
    openFormModal('تأكيد الهوية',
      '<div class="field"><label>كلمة المرور *</label><input type="password" name="password" required autocomplete="current-password"></div>' +
      '<div class="muted">أدخل كلمة مرورك لتأكيد هذا الإجراء</div>',
      function (form, close, submitBtn) {
        var password = form.querySelector('[name="password"]').value;
        if (!password) { formError(form, 'أدخل كلمة المرور'); return; }
        formError(form, '');
        setBtnLoading(submitBtn, true);
        window.TadreebAuth.reauthenticate(password).then(function () {
          confirmed = true;
          setBtnLoading(submitBtn, false);
          close();
          if (typeof onConfirmed === 'function') onConfirmed();
        }).catch(function (err) {
          setBtnLoading(submitBtn, false);
          formError(form, err && err.message ? err.message : 'تعذّر التأكيد');
        });
      }, {
        submitLabel: 'تأكيد',
        width: 'normal',
        onClose: function () {
          if (!confirmed && typeof onCancelled === 'function') onCancelled();
        }
      });
  }

  function formError(form, msg) {
    if (!form) return;
    var el = form.querySelector('.form-error');
    if (el) el.textContent = msg || '';
  }

  function setBtnLoading(btn, loading, label) {
    if (!btn) return;
    if (loading) {
      btn.disabled = true;
      btn.setAttribute('data-label', btn.textContent);
      btn.innerHTML = '<span class="spinner"></span> ' + escapeHtml(label || 'جارٍ الحفظ…');
    } else {
      btn.disabled = false;
      var old = btn.getAttribute('data-label');
      if (old != null) btn.textContent = old;
    }
  }

  // ---------- حالة فارغة ----------
  function emptyState(title, hint, actionLabel, actionId) {
    var html = '<div class="empty-state"><div class="empty-title">' + escapeHtml(title) + '</div>';
    if (hint) html += '<div>' + escapeHtml(hint) + '</div>';
    if (actionLabel) html += '<button class="btn" type="button" id="' + escapeHtml(actionId || 'empty-action') + '">' + escapeHtml(actionLabel) + '</button>';
    html += '</div>';
    return html;
  }

  function loadingState(text) {
    return '<div class="loading-state"><span class="spinner"></span><div style="margin-top:14px">' +
      escapeHtml(text || 'جارٍ التحميل…') + '</div></div>';
  }

  // ---------- شارات الحالات ----------
  var COURSE_STATUS_LABELS = { active: 'نشطة', completed: 'مكتملة', cancelled: 'ملغاة', paused: 'متوقفة' };
  var SESSION_STATE_LABELS = {
    scheduled: 'مجدولة', done: 'مكتملة', cancelled: 'ملغاة', 'trainer-absent': 'غياب المدرب', holiday: 'عطلة'
  };
  var ATTENDANCE_LABELS = { present: 'موجود', absent: 'غائب', excused: 'معتذر' };
  var ROLE_LABELS = { admin: 'مدير', editor: 'محرر', viewer: 'عارض' };

  function pillForCourseStatus(status) {
    var cls = status === 'completed' ? 'pill-green' : status === 'cancelled' ? 'pill-grey' : status === 'paused' ? 'pill-amber' : 'pill-navy';
    return '<span class="pill ' + cls + '">' + escapeHtml(COURSE_STATUS_LABELS[status] || status || '') + '</span>';
  }

  function pillForSessionState(state) {
    var cls = state === 'done' ? 'pill-green' : state === 'cancelled' ? 'pill-red' :
      (state === 'trainer-absent' || state === 'holiday') ? 'pill-amber' : 'pill-navy';
    return '<span class="pill ' + cls + '">' + escapeHtml(SESSION_STATE_LABELS[state] || state || '') + '</span>';
  }

  function pillForAttendance(status) {
    if (!status) return '<span class="muted">بلا تسجيل</span>';
    var cls = status === 'present' ? 'pill-green' : status === 'absent' ? 'pill-red' : 'pill-amber';
    return '<span class="pill ' + cls + '">' + escapeHtml(ATTENDANCE_LABELS[status] || status) + '</span>';
  }

  function roleLabel(role) { return ROLE_LABELS[role] || role || ''; }

  function daysLabel(days) {
    if (!Array.isArray(days) || !days.length) return 'غير محددة';
    var names = days.slice().sort(function (a, b) { return a - b; }).map(function (d) { return WEEKDAYS[d]; });
    if (names.length === 1) return names[0];
    if (names.length === 2) return names.join(' و');
    return names.slice(0, -1).join('، ') + ' و' + names[names.length - 1];
  }

  // ---------- أداة الملاحظات ----------
  // notesWidget(entityType, entityId, containerEl, opts{canWrite})
  // تعرض القائمة (الكاتب + الوقت + النص + حذف) وحقل إضافة.
  function notesWidget(entityType, entityId, containerEl, opts) {
    opts = opts || {};
    var canWrite = opts.canWrite !== false;
    if (!containerEl) return function () {};
    containerEl.innerHTML = loadingState('جارٍ تحميل الملاحظات…');

    var unsubscribe = null;
    var cancelled = false;

    function renderList(notes) {
      if (cancelled) return;
      var html = '';
      if (!notes || !notes.length) {
        html += '<div class="muted" style="margin-bottom:12px">لا توجد ملاحظات بعد.</div>';
      } else {
        notes.forEach(function (n) {
          html += '<div class="note-item"><div class="note-meta"><span>' +
            escapeHtml(n.authorName || 'مستخدم') + ' · ' + escapeHtml(fmtTimestamp(n.tsMs || n.ts)) +
            '</span>';
          if (canWrite) {
            html += '<button class="link-btn danger" type="button" data-note-del="' + escapeHtml(n.id) + '">حذف</button>';
          }
          html += '</div><div class="note-text">' + escapeHtml(n.text || '') + '</div></div>';
        });
      }
      if (canWrite) {
        html += '<div class="notes-add"><textarea placeholder="أضف ملاحظة…" aria-label="ملاحظة جديدة"></textarea>' +
          '<button class="btn btn-sm" type="button">إضافة</button></div>';
      }
      containerEl.innerHTML = html;

      if (canWrite) {
        var ta = containerEl.querySelector('textarea');
        var addBtn = containerEl.querySelector('.notes-add .btn');
        if (addBtn && ta) {
          addBtn.addEventListener('click', function () {
            var text = ta.value.trim();
            if (!text) { toast('اكتب نص الملاحظة أولاً', 'error'); return; }
            setBtnLoading(addBtn, true, 'جارٍ الإضافة…');
            window.TadreebNotes.addNote(entityType, entityId, text).then(function () {
              ta.value = '';
              toast('تمت إضافة الملاحظة', 'success');
            }).catch(toastError).finally(function () { setBtnLoading(addBtn, false); });
          });
        }
        containerEl.querySelectorAll('[data-note-del]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = btn.getAttribute('data-note-del');
            confirmDialog('حذف الملاحظة', 'هل أنت متأكد من حذف هذه الملاحظة؟ لا يمكن التراجع.', function () {
              window.TadreebNotes.removeNote(id).then(function () {
                toast('تم حذف الملاحظة', 'success');
              }).catch(toastError);
            });
          });
        });
      }
    }

    try {
      if (window.TadreebNotes && typeof window.TadreebNotes.subscribeNotes === 'function') {
        unsubscribe = window.TadreebNotes.subscribeNotes(entityType, entityId, renderList);
      } else if (window.TadreebNotes) {
        window.TadreebNotes.listNotes(entityType, entityId).then(renderList).catch(function (err) {
          containerEl.innerHTML = '<div class="muted">تعذّر تحميل الملاحظات.</div>';
          toastError(err);
        });
      }
    } catch (err) {
      containerEl.innerHTML = '<div class="muted">تعذّر تحميل الملاحظات.</div>';
    }

    return function destroy() {
      cancelled = true;
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }

  // ---------- إعدادات العرض والتنسيق (محلية لكل جهاز) ----------
  // تُحفظ كل الإعدادات في مفتاح واحد من localStorage بصيغة JSON،
  // ومغلّفة بـ try/catch حتى لا يكسر مخزن تالف إقلاع التطبيق أبداً.
  var SETTINGS_KEY = 'tadreeb-settings';
  var SETTING_DEFAULTS = {
    calendarView: 'week',
    dashboardCards: { stats: true, today: true, weekAttendance: true, upcoming: true, progress: true, tracker: true },
    tableDensity: 'comfortable',
    exportFmt: { dateFormat: 'iso', numbers: 'western', thousands: true, title: true }
  };

  function readSettingsStore() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return {};
      var raw = window.localStorage.getItem(SETTINGS_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) { return {}; }
  }

  function getSetting(key, fallback) {
    var store = readSettingsStore();
    var def = (fallback !== undefined) ? fallback : SETTING_DEFAULTS[key];
    if (!Object.prototype.hasOwnProperty.call(store, key)) return def;
    var val = store[key];
    // دمج الكائنات فوق الافتراضي حتى يبقى مخزن جزئي مكتملاً دائماً.
    if (val && typeof val === 'object' && !Array.isArray(val) &&
        def && typeof def === 'object' && !Array.isArray(def)) {
      var merged = {};
      Object.keys(def).forEach(function (k) { merged[k] = def[k]; });
      Object.keys(val).forEach(function (k) { merged[k] = val[k]; });
      return merged;
    }
    return val;
  }

  function setSetting(key, value) {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      var store = readSettingsStore();
      store[key] = value;
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(store));
    } catch (e) { /* التخزين غير متاح — يُتجاهل دون كسر أي شيء */ }
  }

  // ---------- تصدير دفاعي ----------
  function hasExport(fnName) {
    return !!(window.TadreebExport && typeof window.TadreebExport[fnName] === 'function');
  }

  function callExport(fnName, args) {
    if (!hasExport(fnName)) {
      toast('وظيفة التصدير هذه غير متوفرة حالياً', 'error');
      return null;
    }
    try {
      args = args || [];
      // دمج تفضيلات تنسيق التصدير في وسيط البيانات (للكائنات فقط؛
      // المصفوفات يقرأ محرك التصدير تفضيلاتها من UI مباشرة).
      try {
        if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0]) && !args[0].fmt) {
          args[0].fmt = getSetting('exportFmt', SETTING_DEFAULTS.exportFmt);
        }
      } catch (e) { /* تفضيلات التنسيق اختيارية تماماً */ }
      var result = window.TadreebExport[fnName].apply(window.TadreebExport, args || []);
      if (result && typeof result.then === 'function') {
        return result.then(function (filename) {
          toast('تم تصدير الملف بنجاح', 'success');
          return filename;
        }).catch(function (err) { toastError(err); throw err; });
      }
      toast('تم تصدير الملف بنجاح', 'success');
      return result;
    } catch (err) {
      toastError(err);
      return null;
    }
  }

  function openPicker(opts) {
    if (!hasExport('openExportPicker')) {
      toast('نافذة خيارات التصدير غير متوفرة حالياً', 'error');
      return;
    }
    try {
      window.TadreebExport.openExportPicker(opts);
    } catch (err) {
      toastError(err);
    }
  }

  window.UI = {
    LEVANT_MONTHS: LEVANT_MONTHS,
    WEEKDAYS: WEEKDAYS,
    parseDateStr: parseDateStr,
    dateToStr: dateToStr,
    todayStr: todayStr,
    fmtDate: fmtDate,
    fmtDateFull: fmtDateFull,
    fmtDateShort: fmtDateShort,
    fmtMonthYear: fmtMonthYear,
    fmtWeekday: fmtWeekday,
    fmtTimeRange: fmtTimeRange,
    fmtDuration: fmtDuration,
    fmtTimestamp: fmtTimestamp,
    tsMillis: tsMillis,
    fmtNumber: fmtNumber,
    fmtMoney: fmtMoney,
    fmtPercent: fmtPercent,
    escapeHtml: escapeHtml,
    toast: toast,
    toastError: toastError,
    openModal: openModal,
    isModalOpen: isModalOpen,
    closeAllModals: closeAllModals,
    confirmDialog: confirmDialog,
    openFormModal: openFormModal,
    requireReauth: requireReauth,
    formError: formError,
    setBtnLoading: setBtnLoading,
    emptyState: emptyState,
    loadingState: loadingState,
    COURSE_STATUS_LABELS: COURSE_STATUS_LABELS,
    SESSION_STATE_LABELS: SESSION_STATE_LABELS,
    ATTENDANCE_LABELS: ATTENDANCE_LABELS,
    ROLE_LABELS: ROLE_LABELS,
    pillForCourseStatus: pillForCourseStatus,
    pillForSessionState: pillForSessionState,
    pillForAttendance: pillForAttendance,
    roleLabel: roleLabel,
    daysLabel: daysLabel,
    notesWidget: notesWidget,
    hasExport: hasExport,
    callExport: callExport,
    openPicker: openPicker,
    SETTING_DEFAULTS: SETTING_DEFAULTS,
    getSetting: getSetting,
    setSetting: setSetting
  };
})();
