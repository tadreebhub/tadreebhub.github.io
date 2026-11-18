/* تدريب — محرّك تصدير إكسل
 * وحدة نقية: تأخذ بيانات جافاسكربت عادية وتُنتج ملفات .xlsx
 * تعتمد على المكتبة العالمية ExcelJS (4.4.0) المحمّلة قبل هذا الملف.
 * لا تعتمد على Firebase ولا على أي وحدة أخرى في التطبيق.
 * جميع العناوين والتسميات بالعربية الفصحى. أسماء الملفات ASCII آمنة.
 *
 * التنسيق الاحترافي (كل ورقة في كل مصنّف — v2.3):
 * الصف 1: عنوان — عريض 14 نقطة بلون كحلي. الصف 2: سطر الإنشاء.
 * الصف 3: سطر التفاصيل — التصفية المطبقة («بدون تصفية» إن لم
 * توجد) وعدد الصفوف والإجماليات حيث توجد. الصف 4: صف العناوين —
 * تعبئة كحلية، نص أبيض عريض، في المنتصف. البيانات من الصف 5.
 * تجميد أسفل صف العناوين، حدود رفيعة، أرقام بفواصل الآلاف،
 * اتجاه RTL، إعداد طباعة جاهز. صفوف كل قسم مرتبة بترتيب منطقي
 * (بالتاريخ ثم الوقت للجلسات والاجتماعات والمصاريف، وبالاسم
 * لقوائم الأشخاص والدورات — انظر كل دالة تصدير).
 */
(function () {
  'use strict';

  /* ---------- ثوابت التنسيق ---------- */
  var NAVY = 'FF081F31';
  var WHITE = 'FFFFFFFF';
  var GREY = 'FF595959';
  var BORDER_GREY = 'FFBFBFBF';
  var NUM_FMT = '#,##0';
  var MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  /* ---------- تخطيط الورقة (v2.3 — L) ----------
   * الصف 1: العنوان. الصف 2: سطر الإنشاء (+ النطاق). الصف 3: سطر
   * التفاصيل. الصف 4: صف العناوين. البيانات من الصف 5. */
  var DETAILS_ROW = 3;
  var HEADER_ROW = 4;
  var DATA_ROW = 5;

  /* ---------- تفضيلات تنسيق التصدير ---------- */
  // تُقرأ من opts.fmt عند تمريرها، وإلا من UI.getSetting('exportFmt') في
  // المتصفح، وإلا الافتراضي (السلوك الحالي تماماً). كل قراءة لـ window.UI
  // محمية — المحرك يعمل مستقلاً في اختبار Node بلا UI.
  // في المتصفح تُقرأ التفضيلات حيةً في كل استدعاء (fmtNow) فتبقى طازجة
  // لكل الصادرات؛ activeFmt يخدم مسار opts.fmt خارج المتصفح فقط.
  var DEFAULT_EXPORT_FMT = { dateFormat: 'iso', numbers: 'western', thousands: true, title: true };
  var activeFmt = DEFAULT_EXPORT_FMT;
  var LEVANT_MONTHS = [
    'كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران',
    'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'
  ];
  var EASTERN_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

  function normalizeFmt(fmt) {
    fmt = fmt || {};
    return {
      dateFormat: (fmt.dateFormat === 'dmy' || fmt.dateFormat === 'long') ? fmt.dateFormat : 'iso',
      numbers: fmt.numbers === 'eastern' ? 'eastern' : 'western',
      thousands: fmt.thousands !== false,
      title: fmt.title !== false
    };
  }

  function resolveFmt(opts) {
    if (opts && opts.fmt && typeof opts.fmt === 'object') return normalizeFmt(opts.fmt);
    try {
      if (typeof window !== 'undefined' && window.UI && typeof window.UI.getSetting === 'function') {
        return normalizeFmt(window.UI.getSetting('exportFmt', DEFAULT_EXPORT_FMT));
      }
    } catch (e) { /* بلا UI — الافتراضي */ }
    return normalizeFmt(null);
  }

  function fmtNow() {
    try {
      if (typeof window !== 'undefined' && window.UI && typeof window.UI.getSetting === 'function') {
        return normalizeFmt(window.UI.getSetting('exportFmt', DEFAULT_EXPORT_FMT));
      }
    } catch (e) { /* بلا UI — تفضيلات الاستدعاء الحالي */ }
    return activeFmt;
  }

  /* ---------- أدوات داخلية ---------- */

  // تحويل نص إلى مقطع آمن لاسم الملف (ASCII فقط)
  function sanitizeFilename(text) {
    var s = String(text == null ? '' : text).trim();
    // إزالة التشكيل والعلامات من العربية (تبقى الأحرف العربية ثم تُحذف لاحقاً)
    s = s.normalize('NFKD');
    // إبقاء الأحرف اللاتينية والأرقام والواصلة والشرطة السفلية فقط
    s = s.replace(/[^A-Za-z0-9\-_]+/g, '-');
    s = s.replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!s) {
      // تجزئة بسيطة من النص الأصلي حتى لا يكون الاسم فارغاً
      var h = 0;
      var src = String(text == null ? '' : text);
      for (var i = 0; i < src.length; i++) {
        h = ((h << 5) - h + src.charCodeAt(i)) | 0;
      }
      s = 'x' + Math.abs(h).toString(36);
    }
    return s.slice(0, 40);
  }

  // تاريخ اليوم بصيغة YYYY-MM-DD
  function todayString() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  // تنسيق "HH:MM" بنظام 12 ساعة (ص/م) — للعرض فقط.
  function fmt12(hhmm) {
    if (typeof window !== 'undefined' && window.TadreebTime && typeof window.TadreebTime.formatTime12 === 'function') {
      return window.TadreebTime.formatTime12(hhmm);
    }
    return hhmm;
  }

  // التاريخ والوقت الآن: YYYY-MM-DD + وقت بنظام 12 ساعة — بتوقيت
  // دمشق عبر TadreebTime عند توفره (المتصفح)، وإلا توقيت الجهاز
  // المحلي (اختبار Node — يُشغَّل مع TZ=Asia/Damascus).
  function nowString() {
    try {
      if (typeof window !== 'undefined' && window.TadreebTime &&
          typeof window.TadreebTime.todayISO === 'function' &&
          typeof window.TadreebTime.formatTime === 'function') {
        return window.TadreebTime.todayISO() + ' ' + window.TadreebTime.formatTime(new Date());
      }
    } catch (e) { /* احتياطي أدناه */ }
    var d = new Date();
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    return todayString() + ' ' + fmt12(hh + ':' + mm);
  }

  // تاريخ ISO خام دائماً — لأسماء الملفات والفرز (يجب أن يبقى
  // YYYY-MM-DD بلا شرطات مائلة أو حروف عربية مهما كان تفضيل العرض).
  function isoDateText(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date) {
      var m = String(v.getMonth() + 1).padStart(2, '0');
      var day = String(v.getDate()).padStart(2, '0');
      return v.getFullYear() + '-' + m + '-' + day;
    }
    var s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return s;
  }

  // تطبيع تاريخ إلى نص حسب تفضيل تنسيق التاريخ:
  // iso ← YYYY-MM-DD (الافتراضي، كما قبل)، dmy ← DD/MM/YYYY،
  // long ← «17 تشرين الثاني 2026» (أسماء شامية كما في UI.fmtDate).
  function asDateText(v) {
    var iso = isoDateText(v);
    var parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!parts) return iso;
    var fmt = fmtNow();
    if (fmt.dateFormat === 'dmy') return parts[3] + '/' + parts[2] + '/' + parts[1];
    if (fmt.dateFormat === 'long') {
      return parseInt(parts[3], 10) + ' ' + LEVANT_MONTHS[parseInt(parts[2], 10) - 1] + ' ' + parts[1];
    }
    return iso;
  }

  // تطبيع طابع زمني إلى نص (التاريخ حسب التفضيل + الوقت بنظام 12 ساعة)
  function asDateTimeText(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date) {
      return asDateText(v) + ' ' + fmt12(
        String(v.getHours()).padStart(2, '0') + ':' + String(v.getMinutes()).padStart(2, '0'));
    }
    var s = String(v).trim();
    var m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
    if (m) return asDateText(m[1]) + ' ' + fmt12(m[2]);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return asDateText(s);
    return s;
  }

  // تحويل قيمة إلى رقم حقيقي (أو صفر عند التعذّر)
  function asNumber(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  // نص آمن (سلسلة فارغة بدل null/undefined)
  function asText(v) {
    return v == null ? '' : String(v);
  }

  /* ---------- مقارنات الفرز (v2.3 — L) ---------- */
  // مقارنة نصية بالترتيب العربي (localeCompare('ar') مع احتياطي).
  function cmpText(a, b) {
    var sa = String(a == null ? '' : a), sb = String(b == null ? '' : b);
    try { return sa.localeCompare(sb, 'ar'); }
    catch (e) { return sa < sb ? -1 : sa > sb ? 1 : 0; }
  }

  // مقارنة تاريخين (ISO أو أي صيغة يقبلها isoDateText).
  function cmpDateVal(a, b) {
    var da = isoDateText(a), db = isoDateText(b);
    return da < db ? -1 : da > db ? 1 : 0;
  }

  // دقائق بداية الوقت من نصوص «09:00–11:00» أو «09:00 ص - 11:00 ص»
  // أو «09:00»؛ نص بلا وقت يُعامل كآخر اليوم.
  function startMinutes(text) {
    var m = /(\d{1,2}):(\d{2})\s*(ص|م)?/.exec(String(text == null ? '' : text));
    if (!m) return 9999;
    var h = parseInt(m[1], 10), min = parseInt(m[2], 10);
    if (m[3] === 'م' && h < 12) h += 12;
    if (m[3] === 'ص' && h === 12) h = 0;
    return h * 60 + min;
  }

  function cmpTimeText(a, b) {
    return startMinutes(a) - startMinutes(b);
  }

  // رقم منسّق لتضمينه داخل نص — حسب تفضيلات التصدير (فاصل الآلاف
  // والأرقام المشرقية). الخلايا الرقمية في إكسل تبقى أرقاماً حقيقية
  // (لتبقى قابلة للجمع والفرز)؛ فاصل الآلاف فيها عبر numFmt في
  // writeDataRow، والأرقام المشرقية لا تنطبق عليها لأن إكسل يعرض
  // الأرقام حسب لغة العارض لا حسب النص المخزّن.
  function fmtExportNum(n) {
    var fmt = fmtNow();
    var v = asNumber(n);
    var s = fmt.thousands ? v.toLocaleString('en-US') : String(v);
    if (fmt.numbers === 'eastern') {
      s = s.replace(/[0-9]/g, function (d) { return EASTERN_DIGITS[+d]; });
    }
    return s;
  }

  // رقم بفواصل الآلاف لتضمينه داخل نص (يستخدم fmtExportNum)
  function fmtNumber(v) {
    return fmtExportNum(v);
  }

  // المبرر: حقل justification إن وُجد، وإلا الملاحظة عند الاعتذار (توافق مع الشكل القديم)
  function justificationOf(r) {
    if (!r) return '';
    if (r.justification != null && r.justification !== '') return asText(r.justification);
    if (r.status === 'معتذر') return asText(r.note);
    return '';
  }

  // تسمية حالة الحضور المعروضة (v2.3): القيم الإنكليزية الخام
  // تُترجم (ملغي/لم يحضر)، والتسميات العربية تمر كما هي — فالسجلات
  // الإرثية تحتفظ بتسمياتها الأصلية في التصدير.
  function attStatusLabel(s) {
    if (s === 'cancelled') return 'ملغي';
    if (s === 'did-not-attend') return 'لم يحضر';
    if (s === 'present') return 'موجود';
    if (s === 'absent') return 'غائب';
    if (s === 'excused') return 'معتذر';
    return asText(s);
  }

  // الأجر المستحق للمدرب من عقد التعاقد (ثابت أو بالساعة) — أو null عند غياب العقد
  function trainerFeeDue(contract) {
    contract = contract || {};
    if (contract.type === 'fixed' && contract.amount != null) return asNumber(contract.amount);
    if (contract.type === 'hourly' && contract.rate != null && contract.hours != null) {
      return asNumber(contract.rate) * asNumber(contract.hours);
    }
    return null;
  }

  // وصف نصي لعقد المدرب
  function trainerFeeText(contract) {
    contract = contract || {};
    if (contract.type === 'fixed') {
      return 'أجرة ثابتة لمجموعة التدريب كاملة: ' + fmtNumber(contract.amount) + ' ل.س';
    }
    if (contract.type === 'hourly') {
      return 'أجر بالساعة: ' + fmtNumber(contract.rate) + ' ل.س — إجمالي الساعات: ' +
        asNumber(contract.hours) + ' — الإجمالي المستحق: ' +
        fmtNumber(asNumber(contract.rate) * asNumber(contract.hours)) + ' ل.س';
    }
    return '';
  }

  // عناوين ورقة المجموعات التدريبية (مشتركة بين الدليل والنسخة الاحتياطية)
  var GROUP_HEADERS = ['اسم المجموعة', 'المديرية', 'عدد مجموعات التدريب', 'الملاحظة'];

  // صفوف ورقة المجموعات التدريبية من {name, directorate, courses, note}
  // عدد مجموعات التدريب رقم دائماً: رقم مباشر، أو طول المصفوفة إن كانت قائمة مجموعات تدريب
  function groupRows(groups) {
    return (Array.isArray(groups) ? groups : []).map(function (g) {
      g = g || {};
      var count = Array.isArray(g.courses) ? g.courses.length
        : (g.courses != null ? asNumber(g.courses) : '');
      return [asText(g.name), asText(g.directorate), count, asText(g.note)];
    });
  }

  /* ---------- مساعدات ExcelJS والتنسيق ---------- */

  function getExcelJS() {
    if (typeof ExcelJS !== 'undefined') return ExcelJS;
    if (typeof window !== 'undefined' && window.ExcelJS) return window.ExcelJS;
    throw new Error('مكتبة ExcelJS غير محمّلة');
  }

  // مصنّف جديد
  function newWorkbook() {
    var E = getExcelJS();
    var wb = new E.Workbook();
    wb.creator = 'تدريب';
    wb.created = new Date();
    return wb;
  }

  // حدود رفيعة جديدة لكل خلية
  function thinBorder() {
    return {
      top: { style: 'thin', color: { argb: BORDER_GREY } },
      left: { style: 'thin', color: { argb: BORDER_GREY } },
      bottom: { style: 'thin', color: { argb: BORDER_GREY } },
      right: { style: 'thin', color: { argb: BORDER_GREY } }
    };
  }

  // سطر التفاصيل (v2.3 — L): «التصفية: … — عدد الصفوف: N — إجماليات…».
  // filters: نص التصفية المطبقة؛ بلا نص يُستخدم subtitle (النطاق)
  // إن وُجد، وإلا «بدون تصفية». count: عدد صفوف البيانات (null
  // يُحذف الجزء). totals: نص إجماليات اختياري جاهز.
  function buildDetailsText(filters, subtitle, count, totals) {
    var parts = ['التصفية: ' + (filters || subtitle || 'بدون تصفية')];
    if (count != null) parts.push('عدد الصفوف: ' + fmtNumber(count));
    if (totals) parts.push(totals);
    return parts.join(' — ');
  }

  // إنشاء ورقة مع كتلة العنوان: الصف 1 عنوان، الصف 2 سطر الإنشاء
  // (+ نطاق)، الصف 3 سطر التفاصيل. عند إيقاف «تضمين صف العنوان»
  // يُترك الصف 1 فارغاً ويبقى سطر الإنشاء وسطر التفاصيل وصف
  // العناوين (4) والتجميد كما هي تماماً. details: نص سطر التفاصيل
  // الجاهز (يُبنى افتراضياً من subtitle بلا عدد).
  function createSheet(wb, name, title, subtitle, colCount, details) {
    var ws = wb.addWorksheet(name);
    var gen = 'تاريخ الإنشاء: ' + nowString();
    if (subtitle) gen += ' — ' + subtitle;
    if (fmtNow().title !== false) {
      if (colCount > 1) ws.mergeCells(1, 1, 1, colCount);
      var titleCell = ws.getCell(1, 1);
      titleCell.value = title;
      titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: NAVY } };
      titleCell.alignment = { horizontal: 'right', vertical: 'middle' };
      ws.getRow(1).height = 24;
    }
    if (colCount > 1) ws.mergeCells(2, 1, 2, colCount);
    var genCell = ws.getCell(2, 1);
    genCell.value = gen;
    genCell.font = { name: 'Calibri', size: 10, color: { argb: GREY } };
    genCell.alignment = { horizontal: 'right', vertical: 'middle' };
    ws.getRow(2).height = 18;
    if (colCount > 1) ws.mergeCells(DETAILS_ROW, 1, DETAILS_ROW, colCount);
    var detailsCell = ws.getCell(DETAILS_ROW, 1);
    detailsCell.value = details || buildDetailsText(null, subtitle, null, null);
    detailsCell.font = { name: 'Calibri', size: 10, color: { argb: GREY } };
    detailsCell.alignment = { horizontal: 'right', vertical: 'middle' };
    ws.getRow(DETAILS_ROW).height = 18;
    return ws;
  }

  // صف عناوين منسّق: تعبئة كحلية، نص أبيض عريض، في المنتصف، حدود رفيعة
  function writeHeaderRow(ws, rowNum, headers) {
    var row = ws.getRow(rowNum);
    headers.forEach(function (h, i) {
      var cell = row.getCell(i + 1);
      cell.value = h;
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: WHITE } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = thinBorder();
    });
    row.height = 22;
  }

  // صف بيانات: حدود رفيعة + تنسيق أرقام بفواصل الآلاف للخلايا الرقمية
  // (أو بلا فواصل عند إيقاف «فاصل الآلاف» — ينطبق على كل الأوراق).
  function writeDataRow(ws, rowNum, values) {
    var row = ws.getRow(rowNum);
    values.forEach(function (v, i) {
      var cell = row.getCell(i + 1);
      cell.value = v == null ? '' : v;
      cell.border = thinBorder();
      cell.alignment = { vertical: 'middle', wrapText: true };
      if (typeof v === 'number') cell.numFmt = fmtNow().thousands ? NUM_FMT : '0';
    });
  }

  // ملاءمة عرض الأعمدة من أطول محتوى (من صف العناوين فصاعداً؛ حد أدنى 12، حد أقصى 42)
  function fitWidths(ws, colCount) {
    for (var c = 1; c <= colCount; c++) {
      var maxLen = 0;
      for (var r = HEADER_ROW; r <= ws.rowCount; r++) {
        var v = ws.getRow(r).getCell(c).value;
        if (v == null || v === '') continue;
        var len = (typeof v === 'number') ? fmtNumber(v).length : String(v).length;
        if (len > maxLen) maxLen = len;
      }
      ws.getColumn(c).width = Math.min(Math.max(maxLen + 2, 12), 42);
    }
  }

  // إنهاء الورقة: عرض الأعمدة + تجميد أسفل صف العناوين + RTL + إعداد طباعة
  function finishSheet(ws, colCount) {
    fitWidths(ws, colCount);
    ws.views = [{ state: 'frozen', ySplit: HEADER_ROW, rightToLeft: true }];
    ws.pageSetup = {
      orientation: colCount > 5 ? 'landscape' : 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
      // تكرار صفوف العنوان/التفاصيل/الترويسة في كل صفحة مطبوعة.
      // (اسم الخاصية في حزمة ExcelJS هذه: printTitlesRow — المفرد؛
      // السطر القديم ws.printTitleRows كان لا يفعل شيئاً.)
      printTitlesRow: '1:' + HEADER_ROW
    };
  }

  // ورقة جدول كاملة دفعة واحدة (عنوان + إنشاء + تفاصيل + عناوين +
  // بيانات). extra اختياري: {filters, totals} — يُبنى سطر التفاصيل
  // تلقائياً (التصفية + عدد الصفوف + الإجماليات).
  function addTableSheet(wb, name, title, subtitle, headers, rows, extra) {
    extra = extra || {};
    var ws = createSheet(wb, name, title, subtitle, headers.length,
      buildDetailsText(extra.filters, subtitle, rows.length, extra.totals));
    writeHeaderRow(ws, HEADER_ROW, headers);
    rows.forEach(function (values, i) { writeDataRow(ws, DATA_ROW + i, values); });
    finishSheet(ws, headers.length);
    return ws;
  }

  /* ---------- كتابة المصنّف (التنزيل) ---------- */

  var bufferSink = null; // للاختبار فقط: تستقبل (buffer, filename) بدل التنزيل
  var lastWrite = null; // وعد آخر كتابة — للاختبار فقط

  function downloadBlob(buffer, filename) {
    var URLObj = window.URL || window.webkitURL;
    var blob = new Blob([buffer], { type: MIME_XLSX });
    var url = URLObj.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URLObj.revokeObjectURL(url); }, 1000);
  }

  // كتابة غير متزامنة (ExcelJS)؛ تُعيد اسم الملف فوراً كما قبل.
  // اسم الملف يُنظَّف من أحرف المسارات دائماً (شبكة أمان لأي تنسيق
  // تاريخ يصل إلى اسم الملف — الافتراضي لا يتغير أبداً).
  function writeWorkbook(wb, filename) {
    filename = String(filename || '').replace(/[\/\\?%*:|"<>]/g, '-');
    lastWrite = wb.xlsx.writeBuffer().then(function (buffer) {
      if (bufferSink) {
        bufferSink(buffer, filename);
      } else if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof Blob !== 'undefined') {
        downloadBlob(buffer, filename);
      }
      return filename;
    });
    lastWrite.catch(function (err) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('[تدريب] فشل تصدير إكسل:', err);
      }
    });
    api._lastWrite = lastWrite;
    return filename;
  }

  /* ---------- 1. تصدير الحضور ---------- */
  function exportAttendance(opts) {
    opts = opts || {};
    activeFmt = resolveFmt(opts);
    // الترتيب: بالاسم (قائمة أشخاص).
    var rows = (Array.isArray(opts.rows) ? opts.rows : []).slice().sort(function (a, b) {
      return cmpText((a || {}).name, (b || {}).name);
    });
    var wb = newWorkbook();

    var present = 0, absent = 0, excused = 0, cancelled = 0;
    rows.forEach(function (r) {
      var st = attStatusLabel(r.status);
      if (st === 'موجود') present++;
      else if (st === 'غائب' || st === 'لم يحضر') absent++;
      else if (st === 'معتذر') excused++;
      else if (st === 'ملغي') cancelled++;
    });

    var scope = 'مجموعة التدريب: ' + asText(opts.displayName || opts.courseName);
    if (opts.sessionDate) scope += ' — التاريخ: ' + asDateText(opts.sessionDate);
    if (opts.periodLabel) scope += ' — الفترة: ' + asText(opts.periodLabel);
    if (opts.hallName) scope += ' — القاعة: ' + asText(opts.hallName);
    if (opts.trainerName) scope += ' — المدرب: ' + asText(opts.trainerName);

    var headers = ['الرقم', 'الاسم', 'المديرية', 'الحالة', 'المبرر', 'تاريخ الجلسة', 'الفترة', 'القاعة', 'المدرب', 'الملاحظة'];
    var ws = createSheet(wb, 'الحضور', 'سجل الحضور والغياب', scope, headers.length,
      buildDetailsText(scope, null, rows.length, null));
    writeHeaderRow(ws, HEADER_ROW, headers);
    rows.forEach(function (r, i) {
      writeDataRow(ws, DATA_ROW + i, [
        i + 1,
        asText(r.name),
        asText(r.directorate),
        attStatusLabel(r.status),
        justificationOf(r),
        asDateText(r.sessionDate || opts.sessionDate),
        asText(r.period || opts.periodLabel),
        asText(r.hall || opts.hallName),
        asText(r.trainer || opts.trainerName),
        // الملاحظة: تُعرض هنا فقط إن لم تكن هي المبرر نفسه (عند الاعتذار)
        r.status === 'معتذر' ? '' : asText(r.note)
      ]);
    });

    // كتلة الملخص أسفل الجدول
    var next = DATA_ROW + rows.length + 1;
    writeHeaderRow(ws, next, ['الملخص', 'العدد']);
    writeDataRow(ws, next + 1, ['إجمالي المتدربين', rows.length]);
    writeDataRow(ws, next + 2, ['موجود', present]);
    writeDataRow(ws, next + 3, ['غائب', absent]);
    writeDataRow(ws, next + 4, ['معتذر', excused]);
    writeDataRow(ws, next + 5, ['ملغي', cancelled]);

    finishSheet(ws, headers.length);
    var filename = 'tadreeb-attendance-' + sanitizeFilename(opts.courseName) +
      '-' + (isoDateText(opts.sessionDate) || todayString()) + '.xlsx';
    return writeWorkbook(wb, filename);
  }

  /* ---------- 1-ب. تقرير الحضور والغياب (عدة جلسات) ---------- */
  function exportAttendanceReport(data) {
    data = data || {};
    activeFmt = resolveFmt(data);
    // الترتيب: الجلسات بالتاريخ، وصفوف كل جلسة بالاسم.
    // (نسخ محلية — لا تُمسّ بيانات المتصل.)
    var sessions = (Array.isArray(data.sessions) ? data.sessions : []).map(function (s) {
      var copy = Object.assign({}, s || {});
      copy.rows = (Array.isArray(copy.rows) ? copy.rows : []).slice().sort(function (a, b) {
        return cmpText((a || {}).name, (b || {}).name);
      });
      return copy;
    });
    sessions.sort(function (a, b) {
      return cmpDateVal((a || {}).sessionDate, (b || {}).sessionDate);
    });
    var totalRows = 0;
    sessions.forEach(function (s) { totalRows += s.rows.length; });
    var wb = newWorkbook();

    var scope = 'مجموعة التدريب: ' + asText(data.displayName || data.courseName);
    if (data.groupName) scope += ' — المجموعة: ' + asText(data.groupName);

    var headers = ['التاريخ', 'الفترة', 'الاسم', 'المديرية', 'الحالة', 'المبرر', 'الملاحظة'];
    var ws = createSheet(wb, 'الحضور والغياب', 'سجل الحضور والغياب', scope, headers.length,
      buildDetailsText(scope, null, totalRows, null));
    writeHeaderRow(ws, HEADER_ROW, headers);

    var rowNum = DATA_ROW;
    var totals = { present: 0, absent: 0, excused: 0, cancelled: 0, unrecorded: 0 };
    var perSession = [];
    sessions.forEach(function (s) {
      s = s || {};
      var rows = Array.isArray(s.rows) ? s.rows : [];
      var counts = { present: 0, absent: 0, excused: 0, cancelled: 0, unrecorded: 0 };
      rows.forEach(function (r) {
        r = r || {};
        var st = r.status ? attStatusLabel(r.status) : 'بلا تسجيل';
        if (st === 'موجود') counts.present++;
        else if (st === 'غائب' || st === 'لم يحضر') counts.absent++;
        else if (st === 'معتذر') counts.excused++;
        else if (st === 'ملغي') counts.cancelled++;
        else counts.unrecorded++;
        writeDataRow(ws, rowNum, [
          asDateText(s.sessionDate),
          asText(s.periodLabel),
          asText(r.name),
          asText(r.directorate),
          st,
          justificationOf(r),
          // الملاحظة: تُعرض هنا فقط إن لم تكن هي المبرر نفسه (عند الاعتذار)
          st === 'معتذر' ? '' : asText(r.note)
        ]);
        rowNum++;
      });
      perSession.push({ date: asDateText(s.sessionDate), counts: counts });
      totals.present += counts.present;
      totals.absent += counts.absent;
      totals.excused += counts.excused;
      totals.cancelled += counts.cancelled;
      totals.unrecorded += counts.unrecorded;
    });

    // كتلة الملخص أسفل الجدول: عدد كل جلسة ثم الإجمالي الكلي
    var next = rowNum + 1;
    writeHeaderRow(ws, next, ['الملخص', 'موجود', 'غائب', 'معتذر', 'ملغي', 'بلا تسجيل', 'الإجمالي']);
    perSession.forEach(function (ps, i) {
      var c = ps.counts;
      writeDataRow(ws, next + 1 + i, [
        'جلسة ' + ps.date,
        c.present, c.absent, c.excused, c.cancelled, c.unrecorded,
        c.present + c.absent + c.excused + c.cancelled + c.unrecorded
      ]);
    });
    var grand = totals.present + totals.absent + totals.excused + totals.cancelled + totals.unrecorded;
    writeDataRow(ws, next + 1 + perSession.length, [
      'الإجمالي', totals.present, totals.absent, totals.excused, totals.cancelled, totals.unrecorded, grand
    ]);

    finishSheet(ws, headers.length);
    var filename = 'tadreeb-attendance-report-' + sanitizeFilename(data.courseName) +
      '-' + todayString() + '.xlsx';
    return writeWorkbook(wb, filename);
  }

  /* ---------- 2. تصدير أوقات اليوم ---------- */
  function exportToday(opts) {
    opts = opts || {};
    activeFmt = resolveFmt(opts);
    // الترتيب: بوقت البدء ثم اسم الفترة.
    var sessions = (Array.isArray(opts.sessions) ? opts.sessions : []).slice().sort(function (a, b) {
      var t = cmpTimeText((a || {}).time, (b || {}).time);
      return t !== 0 ? t : cmpText((a || {}).period, (b || {}).period);
    });
    var wb = newWorkbook();

    var rows = sessions.map(function (s) {
      return [asText(s.period), asText(s.time), asText(s.course), asText(s.hall), asText(s.trainer)];
    });
    addTableSheet(wb, 'أوقات اليوم', 'أوقات اليوم',
      'التاريخ: ' + (asDateText(opts.date) || todayString()),
      ['الفترة', 'الوقت', 'الدورة', 'القاعة', 'المدرب'], rows);
    var filename = 'tadreeb-today-' + (isoDateText(opts.date) || todayString()) + '.xlsx';
    return writeWorkbook(wb, filename);
  }

  /* ---------- 3. تصدير ملف مجموعة التدريب ---------- */

  function addCourseInfoSheet(wb, data) {
    var info = data.info || {};
    var directorates = Array.isArray(info.directorates) ? info.directorates.join('، ') : asText(info.directorates);
    var rows = [
      ['اسم مجموعة التدريب', asText(info.displayName || info.name)],
      ['اسم الدورة', asText(info.name)],
      ['رقم المجموعة', info.groupNumber != null ? asNumber(info.groupNumber) : ''],
      ['المعرّف', asText(info.code)],
      ['المستوى', asText(info.level)],
      ['المدرب', asText(info.trainer)],
      ['المجموعة', asText(info.group)],
      ['المديرية المعيّنة', asText(info.directorate)],
      ['عقد المدرب', trainerFeeText(info.trainerContract)],
      ['الأيام', asText(info.days)],
      ['الفترة التدريبية', asText(info.period)],
      ['تاريخ بدء مجموعة التدريب', asDateText(info.startDate)],
      ['عدد الجلسات', info.sessionCount != null ? asNumber(info.sessionCount) : ''],
      ['الميزانية (ل.س)', info.budget != null ? asNumber(info.budget) : 'بدون ميزانية'],
      ['الحالة', asText(info.status)],
      ['المديريات', directorates]
    ];
    addTableSheet(wb, 'المعلومات', 'ملف مجموعة التدريب', asText(info.displayName || info.name), ['البند', 'التفاصيل'], rows);
  }

  function addCourseScheduleSheet(wb, data) {
    // الترتيب: بالتاريخ ثم الرقم التسلسلي.
    var schedule = (Array.isArray(data.schedule) ? data.schedule : []).slice().sort(function (a, b) {
      var d = cmpDateVal((a || {}).date, (b || {}).date);
      if (d !== 0) return d;
      var na = (a && a.n != null) ? asNumber(a.n) : 9999;
      var nb = (b && b.n != null) ? asNumber(b.n) : 9999;
      return na - nb;
    });
    var rows = schedule.map(function (s, i) {
      return [
        s.n != null ? s.n : i + 1,
        asDateText(s.date),
        asText(s.day),
        asText(s.period),
        asText(s.hall),
        asText(s.trainer),
        asText(s.state),
        asText(s.note)
      ];
    });
    addTableSheet(wb, 'الجدول', 'جدول الجلسات', asText((data.info || {}).displayName || (data.info || {}).name),
      ['الرقم', 'التاريخ', 'اليوم', 'الفترة', 'القاعة', 'المدرب', 'الحالة', 'الملاحظة'], rows);
  }

  function addCourseTraineesSheet(wb, data) {
    // الترتيب: بالاسم.
    var trainees = (Array.isArray(data.trainees) ? data.trainees : []).slice().sort(function (a, b) {
      return cmpText((a || {}).name, (b || {}).name);
    });
    var rows = trainees.map(function (t, i) {
      // بلا عمود حالة: حالة المتدرب لا تُصدَّر بعد الآن (بند 9 — الحالة
      // موجودة فقط في تفقد الجلسة)؛ القيم المخزَّنة القديمة تبقى في قاعدة البيانات.
      return [i + 1, asText(t.name), asText(t.directorate), asText(t.phone), asText(t.notes || t.note)];
    });
    addTableSheet(wb, 'المتدربون', 'المتدربون', asText((data.info || {}).displayName || (data.info || {}).name),
      ['الرقم', 'الاسم', 'المديرية', 'رقم الهاتف', 'الملاحظات'], rows);
  }

  function addCourseAttendanceSheet(wb, data) {
    // الترتيب: بالتاريخ ثم اسم المتدرب.
    var attendance = (Array.isArray(data.attendance) ? data.attendance : []).slice().sort(function (a, b) {
      var d = cmpDateVal((a || {}).sessionDate, (b || {}).sessionDate);
      return d !== 0 ? d : cmpText((a || {}).traineeName, (b || {}).traineeName);
    });
    var rows = attendance.map(function (a) {
      return [
        asDateText(a.sessionDate),
        asText(a.traineeName),
        attStatusLabel(a.status),
        justificationOf(a),
        a.status === 'معتذر' ? '' : asText(a.note)
      ];
    });
    addTableSheet(wb, 'الحضور', 'سجل الحضور', asText((data.info || {}).displayName || (data.info || {}).name),
      ['التاريخ', 'اسم المتدرب', 'الحالة', 'المبرر', 'الملاحظة'], rows);
  }

  // ورقة الميزانية (مشتركة بين ملف الدورة وتصدير الميزانية):
  // ملخص + أجور المدربين المستحقة (محسوبة) مقابل المسجلة + الفئات + المصاريف (إن وُجدت)
  function addBudgetSheet(wb, name, title, subtitle, budget, contract, expenses) {
    budget = budget || {};
    var byCategory = budget.byCategory || {};
    var feeDue = budget.trainerFeeDue != null ? asNumber(budget.trainerFeeDue) : trainerFeeDue(contract);
    var recordedFee = byCategory['أجور المدربين'] != null ? asNumber(byCategory['أجور المدربين']) : null;
    // v2.3.1 — ميزانية اختيارية: بلا ميزانية تُعرض «بدون ميزانية»
    // بدل الأصفار في المخصصة والمتبقي؛ المصروف يُعرض دائماً.
    var noBudget = budget.hasBudget === false;
    var allocText = noBudget ? 'بدون ميزانية' : fmtNumber(budget.allocated) + ' ل.س';
    var remText = noBudget ? 'بدون ميزانية' : fmtNumber(budget.remaining) + ' ل.س';
    var colCount = expenses ? 4 : 2;
    var ws = createSheet(wb, name, title, subtitle, colCount,
      buildDetailsText(null, subtitle, null,
        'الميزانية المخصصة: ' + allocText + ' — إجمالي المصروف: ' +
        fmtNumber(budget.totalSpent) + ' ل.س — المتبقي: ' + remText));
    var r = HEADER_ROW;
    writeHeaderRow(ws, r, ['البند', 'المبلغ (ل.س)']);
    r++;
    var summary = [
      ['الميزانية المخصصة', noBudget ? 'بدون ميزانية' : asNumber(budget.allocated)],
      ['إجمالي المصاريف', asNumber(budget.totalSpent)],
      ['المتبقي', noBudget ? 'بدون ميزانية' : asNumber(budget.remaining)]
    ];
    if (feeDue != null) summary.push(['أجور المدربين المستحقة (محسوبة)', feeDue]);
    if (feeDue != null && recordedFee != null) summary.push(['أجور المدربين المسجلة كمصروف', recordedFee]);
    summary.forEach(function (row) { writeDataRow(ws, r, row); r++; });
    r++; // صف فارغ
    writeHeaderRow(ws, r, ['الفئة', 'المصروف (ل.س)']);
    r++;
    // الفئات مرتبة بالاسم.
    Object.keys(byCategory).sort(cmpText).forEach(function (cat) {
      writeDataRow(ws, r, [cat, asNumber(byCategory[cat])]); r++;
    });
    if (expenses) {
      r++; // صف فارغ
      writeHeaderRow(ws, r, ['التاريخ', 'الفئة', 'البيان', 'المبلغ (ل.س)']);
      r++;
      // المصاريف مرتبة بالتاريخ.
      expenses.slice().sort(function (a, b) { return cmpDateVal((a || {}).date, (b || {}).date); }).forEach(function (e) {
        writeDataRow(ws, r, [asDateText(e.date), asText(e.category), asText(e.description), asNumber(e.amount)]); r++;
      });
    }
    finishSheet(ws, colCount);
    return ws;
  }

  function buildCourseWorkbook(data, sections) {
    sections = sections || {};
    var wb = newWorkbook();
    var include = function (key) {
      // الافتراضي: تضمين كل الأقسام
      return sections[key] !== false;
    };
    if (include('info')) addCourseInfoSheet(wb, data);
    if (include('schedule')) addCourseScheduleSheet(wb, data);
    if (include('trainees')) addCourseTraineesSheet(wb, data);
    if (include('attendance')) addCourseAttendanceSheet(wb, data);
    if (include('budget')) {
      var budget = data.budget || {};
      addBudgetSheet(wb, 'الميزانية', 'ميزانية مجموعة التدريب', asText((data.info || {}).displayName || (data.info || {}).name),
        budget, (data.info || {}).trainerContract, Array.isArray(budget.expenses) ? budget.expenses : []);
    }
    return wb;
  }

  function exportCourseFile(data, options) {
    data = data || {};
    activeFmt = resolveFmt(data);
    options = options || {};
    var sections = options.sections || {};
    var wb = buildCourseWorkbook(data, sections);
    var name = (data.info && data.info.name) || '';
    var filename = 'tadreeb-course-' + sanitizeFilename(name) + '-' + todayString() + '.xlsx';
    return writeWorkbook(wb, filename);
  }

  /* ---------- 4. كالندر الأسبوع ---------- */

  // نص خلية الجلسة: الدورة — القاعة — المدرب (يُحذف ما غاب)
  function formatSessionCell(s) {
    var parts = [asText(s.course)];
    if (s.hall) parts.push(asText(s.hall));
    if (s.trainer) parts.push(asText(s.trainer));
    return parts.join(' — ');
  }

  function formatWeekCell(cell) {
    if (!cell || cell === 'free' || (Array.isArray(cell) && cell.length === 0)) {
      return 'متاحة';
    }
    if (Array.isArray(cell)) {
      return cell.map(formatSessionCell).join(' / ');
    }
    return asText(cell);
  }

  function exportWeekCalendar(opts) {
    opts = opts || {};
    activeFmt = resolveFmt(opts);
    var periods = Array.isArray(opts.periods) ? opts.periods : [];
    var days = Array.isArray(opts.days) ? opts.days : [];
    var cells = opts.cells || {};
    var wb = newWorkbook();

    var header = ['الفترة'];
    days.forEach(function (d) { header.push(asText(d.label) + (d.date ? ' — ' + asDateText(d.date) : '')); });
    // شبكة موضعية (صف لكل فترة) — بلا فرز.
    var ws = createSheet(wb, 'كالندر الأسبوع', 'كالندر الأسبوع', asText(opts.weekLabel), header.length,
      buildDetailsText(asText(opts.weekLabel), null, periods.length, null));
    writeHeaderRow(ws, HEADER_ROW, header);
    periods.forEach(function (p, pi) {
      var row = [asText(p.label) + (p.time ? ' (' + asText(p.time) + ')' : '')];
      days.forEach(function (d, di) {
        row.push(formatWeekCell(cells[pi + '|' + di]));
      });
      writeDataRow(ws, DATA_ROW + pi, row);
    });
    finishSheet(ws, header.length);

    var startDate = (days[0] && days[0].date) ? isoDateText(days[0].date) : todayString();
    var filename = 'tadreeb-week-' + startDate + '.xlsx';
    return writeWorkbook(wb, filename);
  }

  /* ---------- 5. كالندر الشهر ---------- */
  function exportMonthCalendar(opts) {
    opts = opts || {};
    activeFmt = resolveFmt(opts);
    var weeks = Array.isArray(opts.weeks) ? opts.weeks : [];
    var wb = newWorkbook();

    // شبكة موضعية (صف لكل أسبوع) — بلا فرز.
    var ws = createSheet(wb, 'كالندر الشهر', 'كالندر الشهر', asText(opts.monthLabel), 7,
      buildDetailsText(asText(opts.monthLabel), null, weeks.length, null));
    writeHeaderRow(ws, HEADER_ROW, ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة']);
    weeks.forEach(function (week, wi) {
      var row = [];
      for (var i = 0; i < 7; i++) {
        var cell = week && week[i];
        if (!cell) {
          row.push('');
        } else {
          var text = String(cell.dayNumber != null ? cell.dayNumber : '');
          var sessions = Array.isArray(cell.sessions) ? cell.sessions : [];
          if (sessions.length) {
            text += ' — ' + sessions.map(function (s) {
              return asText(s.course) +
                (s.period ? ' (' + asText(s.period) + ')' : '') +
                (s.trainer ? ' — ' + asText(s.trainer) : '');
            }).join(' / ');
          }
          row.push(text);
        }
      }
      writeDataRow(ws, DATA_ROW + wi, row);
    });
    finishSheet(ws, 7);

    var yyyymm = '';
    outer:
    for (var w = 0; w < weeks.length; w++) {
      for (var d = 0; d < 7; d++) {
        var c = weeks[w] && weeks[w][d];
        if (c && c.date) { yyyymm = isoDateText(c.date).slice(0, 7); break outer; }
      }
    }
    if (!yyyymm) yyyymm = todayString().slice(0, 7);
    var filename = 'tadreeb-month-' + yyyymm + '.xlsx';
    return writeWorkbook(wb, filename);
  }

  /* ---------- 5أ. جدول اليوم ---------- */
  function exportDaySchedule(opts) {
    opts = opts || {};
    activeFmt = resolveFmt(opts);
    var days = Array.isArray(opts.days) ? opts.days : [];
    var date = asDateText(opts.date) || (days[0] ? asDateText(days[0].date) : todayString());
    var dateIso = isoDateText(opts.date) || (days[0] ? isoDateText(days[0].date) : todayString());
    var wb = newWorkbook();

    // الترتيب: مدخلات اليوم بوقت البدء.
    var totalEntries = 0;
    days.forEach(function (day) {
      totalEntries += Array.isArray(day.sessions) ? day.sessions.length : 0;
    });
    var headers = ['الفترة', 'الدورة', 'المدرب', 'القاعة', 'الحالة'];
    var ws = createSheet(wb, 'جدول اليوم', 'جدول يوم ' + date, asText(opts.label), headers.length,
      buildDetailsText(asText(opts.label) || ('التاريخ: ' + date), null, totalEntries, null));
    writeHeaderRow(ws, HEADER_ROW, headers);
    var row = DATA_ROW;
    days.forEach(function (day) {
      var entries = (Array.isArray(day.sessions) ? day.sessions : []).slice().sort(function (a, b) {
        var t = cmpTimeText((a || {}).time, (b || {}).time);
        return t !== 0 ? t : cmpText((a || {}).course || (a || {}).title, (b || {}).course || (b || {}).title);
      });
      entries.forEach(function (e) {
        var period = asText(e.period) + (e.time ? ' (' + asText(e.time) + ')' : '');
        if (e.kind === 'meeting') {
          writeDataRow(ws, row++, [period, 'اجتماع: ' + asText(e.title || e.course), '', asText(e.hall), 'مجدول']);
        } else {
          writeDataRow(ws, row++, [period, asText(e.course), asText(e.trainer),
            asText(e.hall) || 'بلا قاعة', asText(e.stateLabel || e.state)]);
        }
      });
    });
    finishSheet(ws, headers.length);

    var filename = 'tadreeb-day-schedule-' + dateIso + '.xlsx';
    return writeWorkbook(wb, filename);
  }

  /* ---------- 5ب. جدول النطاق المخصص ---------- */
  function exportRangeSchedule(opts) {
    opts = opts || {};
    activeFmt = resolveFmt(opts);
    var days = (Array.isArray(opts.days) ? opts.days : []).slice().sort(function (a, b) {
      return (a.date || '') < (b.date || '') ? -1 : (a.date || '') > (b.date || '') ? 1 : 0;
    });
    var from = asDateText(opts.from) || (days[0] ? asDateText(days[0].date) : todayString());
    var to = asDateText(opts.to) || (days.length ? asDateText(days[days.length - 1].date) : from);
    var fromIso = isoDateText(opts.from) || (days[0] ? isoDateText(days[0].date) : todayString());
    var toIso = isoDateText(opts.to) || (days.length ? isoDateText(days[days.length - 1].date) : fromIso);
    var wb = newWorkbook();

    // الترتيب: الأيام بالتاريخ (أعلاه)، ومدخلات كل يوم بوقت البدء.
    var rangeEntries = 0;
    days.forEach(function (day) {
      rangeEntries += Array.isArray(day.sessions) ? day.sessions.length : 0;
    });
    var headers = ['التاريخ', 'الفترة', 'الدورة', 'المدرب', 'القاعة', 'الحالة'];
    var ws = createSheet(wb, 'جدول النطاق', 'جدول النطاق ' + from + ' — ' + to, '', headers.length,
      buildDetailsText('النطاق: ' + from + ' — ' + to, null, rangeEntries, null));
    writeHeaderRow(ws, HEADER_ROW, headers);
    var row = DATA_ROW;
    days.forEach(function (day) {
      var entries = (Array.isArray(day.sessions) ? day.sessions : []).slice().sort(function (a, b) {
        var t = cmpTimeText((a || {}).time, (b || {}).time);
        return t !== 0 ? t : cmpText((a || {}).course || (a || {}).title, (b || {}).course || (b || {}).title);
      });
      entries.forEach(function (e) {
        var period = asText(e.period) + (e.time ? ' (' + asText(e.time) + ')' : '');
        if (e.kind === 'meeting') {
          writeDataRow(ws, row++, [asDateText(day.date), period, 'اجتماع: ' + asText(e.title || e.course), '', asText(e.hall), 'مجدول']);
        } else {
          writeDataRow(ws, row++, [asDateText(day.date), period, asText(e.course), asText(e.trainer),
            asText(e.hall) || 'بلا قاعة', asText(e.stateLabel || e.state)]);
        }
      });
    });
    finishSheet(ws, headers.length);

    var filename = 'tadreeb-range-schedule-' + fromIso + '-to-' + toIso + '.xlsx';
    return writeWorkbook(wb, filename);
  }

  /* ---------- 6. قائمة مجموعات التدريب ---------- */
  function exportCoursesList(rows) {
    // الترتيب: بالاسم.
    rows = (Array.isArray(rows) ? rows : []).slice().sort(function (a, b) {
      return cmpText((a || {}).name, (b || {}).name);
    });
    activeFmt = resolveFmt(null);
    var wb = newWorkbook();

    var dataRows = rows.map(function (r) {
      var sessions = r.sessions != null ? asNumber(r.sessions) : null;
      var done = r.done != null ? asNumber(r.done) : null;
      var progress = (sessions != null && sessions > 0 && done != null)
        ? Math.round((done / sessions) * 100) : '';
      var budget = r.budget != null ? asNumber(r.budget) : null;
      var spent = (r.spent != null ? asNumber(r.spent) : (r.totalSpent != null ? asNumber(r.totalSpent) : null));
      var remaining = r.remaining != null ? asNumber(r.remaining)
        : ((budget != null && spent != null) ? budget - spent : '');
      return [
        asText(r.displayName || r.name),
        asText(r.name),
        asText(r.trainer),
        asText(r.days),
        asText(r.period),
        sessions != null ? sessions : '',
        done != null ? done : '',
        progress,
        asText(r.status),
        r.trainees != null ? asNumber(r.trainees) : '',
        budget != null ? budget : '',
        spent != null ? spent : '',
        remaining
      ];
    });
    var totalBudget = 0, totalSpent = 0, hasMoney = false;
    rows.forEach(function (r) {
      if (r.budget != null) { totalBudget += asNumber(r.budget); hasMoney = true; }
      var sp = r.spent != null ? r.spent : r.totalSpent;
      if (sp != null) { totalSpent += asNumber(sp); hasMoney = true; }
    });
    addTableSheet(wb, 'مجموعات التدريب', 'قائمة مجموعات التدريب', '',
      ['مجموعة التدريب', 'الدورة', 'المدرب', 'الأيام', 'الفترة', 'عدد الجلسات', 'المنجزة', 'نسبة الإنجاز %',
       'الحالة', 'عدد المتدربين', 'الميزانية (ل.س)', 'المصروف (ل.س)', 'المتبقي (ل.س)'], dataRows,
      hasMoney ? { totals: 'إجمالي الميزانيات: ' + fmtNumber(totalBudget) + ' ل.س — إجمالي المصروف: ' + fmtNumber(totalSpent) + ' ل.س' } : null);
    var filename = 'tadreeb-courses-' + todayString() + '.xlsx';
    return writeWorkbook(wb, filename);
  }

  /* ---------- إحصائيات مجموعات التدريب (إدارة مجموعات التدريب v1.1) ---------- */
  // data: {courses: [{name, code, level, group, trainer, directorate, startDate,
  // total, done, remaining, pct, trainees, attendanceRate, budget, spent,
  // budgetRemaining}], summary: {...}} — كما يبنيه App.buildCoursesStatsData.
  // النسب أرقام عادية مع «%» في الترويسة (كما في قائمة الدورات).
  function exportCoursesStats(data) {
    data = data || {};
    // الترتيب: بالاسم.
    var courses = (Array.isArray(data.courses) ? data.courses : []).slice().sort(function (a, b) {
      return cmpText((a || {}).name, (b || {}).name);
    });
    var summary = data.summary || {};
    var wb = newWorkbook();
    var statsTotals = (summary.budgetTotal != null || summary.spentTotal != null)
      ? 'إجمالي الميزانيات: ' + fmtNumber(summary.budgetTotal) + ' ل.س — إجمالي المصروف: ' + fmtNumber(summary.spentTotal) + ' ل.س' : null;

    addTableSheet(wb, 'إحصائيات مجموعات التدريب', 'إحصائيات مجموعات التدريب', '',
      ['مجموعة التدريب', 'الدورة', 'المعرّف', 'المستوى', 'المجموعة', 'المدرب', 'المديرية', 'تاريخ البدء',
       'إجمالي الجلسات', 'المكتملة', 'المتبقية', 'نسبة الإنجاز %', 'عدد المتدربين',
       'نسبة الحضور %', 'الميزانية المعتمدة', 'المصروف', 'المتبقي'],
      courses.map(function (c) {
        c = c || {};
        var budget = c.budget != null ? asNumber(c.budget) : null;
        var spent = c.spent != null ? asNumber(c.spent) : null;
        var budgetRemaining = c.budgetRemaining != null ? asNumber(c.budgetRemaining)
          : ((budget != null && spent != null) ? budget - spent : 'بدون ميزانية');
        return [
          asText(c.displayName || c.name),
          asText(c.name),
          asText(c.code),
          asText(c.level),
          asText(c.group),
          asText(c.trainer),
          asText(c.directorate),
          asDateText(c.startDate),
          c.total != null ? asNumber(c.total) : '',
          c.done != null ? asNumber(c.done) : '',
          c.remaining != null ? asNumber(c.remaining) : '',
          c.pct != null ? asNumber(c.pct) : '',
          c.trainees != null ? asNumber(c.trainees) : '',
          c.attendanceRate != null ? asNumber(c.attendanceRate) : '',
          budget != null ? budget : 'بدون ميزانية',
          spent != null ? spent : '',
          budgetRemaining
        ];
      }), statsTotals ? { totals: statsTotals } : null);

    addTableSheet(wb, 'ملخص عام', 'ملخص عام', '', ['البند', 'القيمة'], [
      ['عدد مجموعات التدريب', summary.courses != null ? asNumber(summary.courses) : ''],
      ['مكتملة', summary.completed != null ? asNumber(summary.completed) : ''],
      ['جارية', summary.inProgress != null ? asNumber(summary.inProgress) : ''],
      ['ملغاة', summary.cancelled != null ? asNumber(summary.cancelled) : ''],
      ['متوقفة', summary.paused != null ? asNumber(summary.paused) : ''],
      ['إجمالي الجلسات', summary.sessionsTotal != null ? asNumber(summary.sessionsTotal) : ''],
      ['الجلسات المكتملة', summary.sessionsDone != null ? asNumber(summary.sessionsDone) : ''],
      ['نسبة الإنجاز الإجمالية %', summary.overallPct != null ? asNumber(summary.overallPct) : ''],
      ['إجمالي المتدربين', summary.traineesTotal != null ? asNumber(summary.traineesTotal) : ''],
      ['نسبة الحضور الإجمالية %', summary.overallAttendanceRate != null ? asNumber(summary.overallAttendanceRate) : ''],
      ['إجمالي الميزانيات', summary.budgetTotal != null ? asNumber(summary.budgetTotal) : ''],
      ['إجمالي المصروف', summary.spentTotal != null ? asNumber(summary.spentTotal) : ''],
      ['إجمالي المتبقي', summary.remainingTotal != null ? asNumber(summary.remainingTotal) : '']
    ]);

    var filename = 'tadreeb-courses-stats-' + todayString() + '.xlsx';
    return writeWorkbook(wb, filename);
  }

  /* ---------- 7. الدليل ---------- */
  function exportDirectory(opts) {
    opts = opts || {};
    activeFmt = resolveFmt(opts);
    var wb = newWorkbook();
    var added = 0;

    // الترتيب: كل قائمة بالاسم.
    var trainers = (Array.isArray(opts.trainers) ? opts.trainers : []).slice().sort(function (a, b) {
      return cmpText((a || {}).name, (b || {}).name);
    });
    if (trainers.length) {
      addTableSheet(wb, 'المدربون', 'المدربون', '', ['الاسم', 'التخصص', 'رقم الهاتف', 'الملاحظة'],
        trainers.map(function (t) {
          return [asText(t.name), asText(t.specialty), asText(t.phone), asText(t.note)];
        }));
      added++;
    }

    var halls = (Array.isArray(opts.halls) ? opts.halls : []).slice().sort(function (a, b) {
      return cmpText((a || {}).name, (b || {}).name);
    });
    if (halls.length) {
      addTableSheet(wb, 'القاعات', 'القاعات', '', ['اسم القاعة', 'السعة', 'الموقع', 'الملاحظة'],
        halls.map(function (h) {
          return [asText(h.name), h.capacity != null ? asNumber(h.capacity) : '', asText(h.location), asText(h.note)];
        }));
      added++;
    }

    var directorates = (Array.isArray(opts.directorates) ? opts.directorates : []).slice().sort(function (a, b) {
      var na = typeof a === 'string' ? a : (a || {}).name;
      var nb = typeof b === 'string' ? b : (b || {}).name;
      return cmpText(na, nb);
    });
    if (directorates.length) {
      addTableSheet(wb, 'المديريات', 'المديريات', '', ['اسم المديرية', 'الملاحظة'],
        directorates.map(function (d) {
          if (typeof d === 'string') return [d, ''];
          return [asText(d.name), asText(d.note)];
        }));
      added++;
    }

    var groups = (Array.isArray(opts.groups) ? opts.groups : []).slice().sort(function (a, b) {
      return cmpText((a || {}).name, (b || {}).name);
    });
    if (groups.length) {
      addTableSheet(wb, 'المجموعات التدريبية', 'المجموعات التدريبية', '', GROUP_HEADERS, groupRows(groups));
      added++;
    }

    var trainees = (Array.isArray(opts.trainees) ? opts.trainees : []).slice().sort(function (a, b) {
      return cmpText((a || {}).name, (b || {}).name);
    });
    if (trainees.length) {
      addTableSheet(wb, 'المتدربون', 'المتدربون', '',
        ['الاسم', 'المديرية', 'رقم الهاتف', 'الملاحظات'],
        trainees.map(function (t) {
          return [asText(t.name), asText(t.directorate), asText(t.phone), asText(t.notes || t.note)];
        }));
      added++;
    }

    if (added === 0) {
      var ws = createSheet(wb, 'الدليل', 'الدليل', '', 1,
        buildDetailsText(null, null, 0, null));
      writeDataRow(ws, HEADER_ROW, ['لا توجد بيانات في الدليل']);
      finishSheet(ws, 1);
    }

    var filename = 'tadreeb-directory-' + todayString() + '.xlsx';
    return writeWorkbook(wb, filename);
  }

  /* ---------- 8. الميزانية ---------- */
  function exportBudget(opts) {
    opts = opts || {};
    activeFmt = resolveFmt(opts);
    var wb = newWorkbook();
    addBudgetSheet(wb, 'ملخص الميزانية', 'ملخص الميزانية', asText(opts.displayName || opts.courseName),
      opts, opts.trainerContract, null);
    // الترتيب: بالتاريخ.
    var expenses = (Array.isArray(opts.expenses) ? opts.expenses : []).slice().sort(function (a, b) {
      return cmpDateVal((a || {}).date, (b || {}).date);
    });
    var expensesTotal = 0;
    expenses.forEach(function (e) { expensesTotal += asNumber(e.amount); });
    addTableSheet(wb, 'تفاصيل المصاريف', 'تفاصيل المصاريف', asText(opts.displayName || opts.courseName),
      ['التاريخ', 'الفئة', 'البيان', 'التفاصيل', 'المبلغ (ل.س)'],
      expenses.map(function (e) {
        return [asDateText(e.date), asText(e.category), asText(e.description), asText(e.details), asNumber(e.amount)];
      }),
      { totals: 'إجمالي المصروف: ' + fmtNumber(expensesTotal) + ' ل.س' });
    var filename = 'tadreeb-budget-' + sanitizeFilename(opts.courseName) + '-' + todayString() + '.xlsx';
    return writeWorkbook(wb, filename);
  }

  /* ---------- 9. التقرير الختامي ---------- */
  function exportClosingReport(courseFileData) {
    courseFileData = courseFileData || {};
    activeFmt = resolveFmt(courseFileData);
    var wb = buildCourseWorkbook(courseFileData, {});
    var info = courseFileData.info || {};
    var budget = courseFileData.budget || {};
    var schedule = Array.isArray(courseFileData.schedule) ? courseFileData.schedule : [];
    var trainees = Array.isArray(courseFileData.trainees) ? courseFileData.trainees : [];
    var attendance = Array.isArray(courseFileData.attendance) ? courseFileData.attendance : [];

    var doneSessions = 0, cancelledSessions = 0;
    schedule.forEach(function (s) {
      if (s.state === 'منجزة' || s.state === 'done') doneSessions++;
      else if (s.state === 'ملغاة' || s.state === 'cancelled') cancelledSessions++;
    });
    var presentCount = 0, absentCount = 0, excusedCount = 0, cancelledCount = 0;
    attendance.forEach(function (a) {
      var st = attStatusLabel(a.status);
      if (st === 'موجود') presentCount++;
      else if (st === 'غائب' || st === 'لم يحضر') absentCount++;
      else if (st === 'معتذر') excusedCount++;
      else if (st === 'ملغي') cancelledCount++;
    });
    // لا عدّ للناجحين من حالة المتدرب بعد الآن (بند 9 — الحالة موجودة
    // فقط في تفقد الجلسة)؛ عدد المتدربين الإجمالي في الصف أدناه يكفي.
    // v2.3: «ملغي» مُبطل يُستثنى من مقام نسبة الحضور.
    var totalAttendance = presentCount + absentCount + excusedCount;
    var attendanceRate = totalAttendance ? Math.round((presentCount / totalAttendance) * 100) : 0;

    var rows = [
      ['مجموعة التدريب', asText(info.displayName || info.name)],
      ['اسم الدورة', asText(info.name)],
      ['المدرب', asText(info.trainer)],
      ['الحالة', asText(info.status)],
      ['إجمالي الجلسات', schedule.length],
      ['الجلسات المنجزة', doneSessions],
      ['الجلسات الملغاة', cancelledSessions],
      ['عدد المتدربين', trainees.length],
      ['إجمالي سجلات الحضور', totalAttendance],
      ['موجود', presentCount],
      ['غائب', absentCount],
      ['معتذر', excusedCount],
      ['ملغي', cancelledCount],
      ['نسبة الحضور %', attendanceRate]
    ];
    var ws = createSheet(wb, 'ملخص ختامي', 'الملخص الختامي', asText(info.displayName || info.name), 2,
      buildDetailsText('مجموعة التدريب: ' + asText(info.displayName || info.name), null, rows.length,
        'عدد الجلسات: ' + fmtNumber(schedule.length) + ' — عدد المتدربين: ' + fmtNumber(trainees.length)));
    writeHeaderRow(ws, HEADER_ROW, ['البند', 'القيمة']);
    rows.forEach(function (row, i) { writeDataRow(ws, DATA_ROW + i, row); });
    var next = DATA_ROW + rows.length + 1;
    writeHeaderRow(ws, next, ['النتيجة الكاملة للميزانية', 'المبلغ (ل.س)']);
    var closingNoBudget = budget.hasBudget === false;
    writeDataRow(ws, next + 1, ['الميزانية المخصصة', closingNoBudget ? 'بدون ميزانية' : asNumber(budget.allocated)]);
    writeDataRow(ws, next + 2, ['إجمالي المصاريف', asNumber(budget.totalSpent)]);
    writeDataRow(ws, next + 3, ['المتبقي', closingNoBudget ? 'بدون ميزانية' : asNumber(budget.remaining)]);
    finishSheet(ws, 2);

    var filename = 'tadreeb-closing-' + sanitizeFilename(info.name) + '-' + todayString() + '.xlsx';
    return writeWorkbook(wb, filename);
  }

  /* ---------- 10. التقرير الملخّص ---------- */
  function exportSummary(data) {
    data = data || {};
    activeFmt = resolveFmt(data);
    var totals = data.totals || {};
    var wb = newWorkbook();

    // ملخص عام: الأرقام الرئيسة
    var remaining = (totals.totalBudget != null && totals.totalSpent != null)
      ? asNumber(totals.totalBudget) - asNumber(totals.totalSpent) : '';
    addTableSheet(wb, 'ملخص عام', 'ملخص عام', '', ['المؤشر', 'القيمة'], [
      ['عدد مجموعات التدريب', totals.courses != null ? asNumber(totals.courses) : ''],
      ['مجموعات التدريب النشطة', totals.activeCourses != null ? asNumber(totals.activeCourses) : ''],
      ['عدد المتدربين', totals.trainees != null ? asNumber(totals.trainees) : ''],
      ['عدد المدربين', totals.trainers != null ? asNumber(totals.trainers) : ''],
      ['عدد القاعات', totals.halls != null ? asNumber(totals.halls) : ''],
      ['الجلسات المنجزة', totals.sessionsDone != null ? asNumber(totals.sessionsDone) : ''],
      ['الجلسات المجدولة', totals.sessionsScheduled != null ? asNumber(totals.sessionsScheduled) : ''],
      ['الجلسات الملغاة', totals.sessionsCancelled != null ? asNumber(totals.sessionsCancelled) : ''],
      ['نسبة الحضور %', totals.attendanceRate != null ? asNumber(totals.attendanceRate) : ''],
      ['إجمالي الميزانية (ل.س)', totals.totalBudget != null ? asNumber(totals.totalBudget) : ''],
      ['إجمالي المصروف (ل.س)', totals.totalSpent != null ? asNumber(totals.totalSpent) : ''],
      ['المتبقي (ل.س)', remaining]
    ]);

    // مجموعات التدريب: صف لكل مجموعة — مرتبة حسب اسم الدورة.
    var courses = (Array.isArray(data.courses) ? data.courses : []).slice().sort(function (a, b) {
      return cmpText((a || {}).name, (b || {}).name);
    });
    var sumBudget = 0, sumSpent = 0, sumHasMoney = false;
    courses.forEach(function (c) {
      if (c.budget != null) { sumBudget += asNumber(c.budget); sumHasMoney = true; }
      if (c.spent != null) { sumSpent += asNumber(c.spent); sumHasMoney = true; }
    });
    addTableSheet(wb, 'مجموعات التدريب', 'مجموعات التدريب', '',
      ['مجموعة التدريب', 'الدورة', 'المدرب', 'نسبة التقدم %', 'المنجزة', 'إجمالي الجلسات',
       'الميزانية (ل.س)', 'المصروف (ل.س)', 'المتبقي (ل.س)', 'الحالة'],
      courses.map(function (c) {
        var rem = c.remaining != null ? asNumber(c.remaining)
          : (c.budget != null && c.spent != null ? asNumber(c.budget) - asNumber(c.spent) : 'بدون ميزانية');
        return [
          asText(c.displayName || c.name),
          asText(c.name),
          asText(c.trainer),
          c.progress != null ? asNumber(c.progress) : '',
          c.done != null ? asNumber(c.done) : '',
          c.total != null ? asNumber(c.total) : '',
          c.budget != null ? asNumber(c.budget) : 'بدون ميزانية',
          c.spent != null ? asNumber(c.spent) : '',
          rem,
          asText(c.status)
        ];
      }), sumHasMoney ? { totals: 'إجمالي الميزانيات: ' + fmtNumber(sumBudget) + ' ل.س — إجمالي المصروف: ' + fmtNumber(sumSpent) + ' ل.س' } : null);

    // الحضور: أعداد الأسبوع
    var aw = data.attendanceWeek || {};
    var total = aw.total != null ? asNumber(aw.total)
      : asNumber(aw.present) + asNumber(aw.absent) + asNumber(aw.excused);
    var rate = total ? Math.round((asNumber(aw.present) / total) * 100) : '';
    var attWeekRows = [
      ['موجود', asNumber(aw.present)],
      ['غائب', asNumber(aw.absent)],
      ['معتذر', asNumber(aw.excused)]
    ];
    // v2.3: «ملغي» يُعرض صفاً خاصاً متى وُجد (مُبطل — خارج المقام).
    if (aw.cancelled != null) attWeekRows.push(['ملغي', asNumber(aw.cancelled)]);
    attWeekRows.push(['الإجمالي', total]);
    attWeekRows.push(['نسبة الحضور %', rate]);
    addTableSheet(wb, 'الحضور', 'الحضور الأسبوعي', '', ['الحالة', 'العدد'], attWeekRows);

    var filename = 'tadreeb-summary-' + todayString() + '.xlsx';
    return writeWorkbook(wb, filename);
  }

  /* ---------- 11. النسخة الاحتياطية الكاملة ---------- */
  function exportBackup(data) {
    data = data || {};
    activeFmt = resolveFmt(data);
    var wb = newWorkbook();
    var added = 0;

    function maybeAdd(name, title, headers, rows, extra) {
      if (!rows.length) return;
      addTableSheet(wb, name, title, '', headers, rows, extra);
      added++;
    }

    // الترتيب: مجموعات التدريب حسب اسم الدورة.
    var courses = (Array.isArray(data.courses) ? data.courses : []).slice().sort(function (a, b) {
      return cmpText((a || {}).name, (b || {}).name);
    });
    maybeAdd('مجموعات التدريب', 'مجموعات التدريب',
      ['مجموعة التدريب', 'الدورة', 'المدرب', 'الأيام', 'الفترة', 'عدد الجلسات', 'الحالة', 'الميزانية (ل.س)', 'الملاحظات'],
      courses.map(function (c) {
        return [
          asText(c.displayName || c.name), asText(c.name), asText(c.trainer), asText(c.days), asText(c.period),
          c.sessionCount != null ? asNumber(c.sessionCount) : (c.sessions != null ? asNumber(c.sessions) : ''),
          asText(c.status),
          c.budget != null ? asNumber(c.budget) : 'بدون ميزانية',
          asText(c.notes || c.note)
        ];
      }));

    // الترتيب: الجلسات بالتاريخ ثم الفترة ثم مجموعة التدريب.
    var sessions = (Array.isArray(data.sessions) ? data.sessions : []).slice().sort(function (a, b) {
      var d = cmpDateVal((a || {}).date, (b || {}).date);
      if (d !== 0) return d;
      var p = cmpText((a || {}).period, (b || {}).period);
      return p !== 0 ? p : cmpText((a || {}).course || (a || {}).courseName, (b || {}).course || (b || {}).courseName);
    });
    maybeAdd('الجلسات', 'الجلسات',
      ['مجموعة التدريب', 'التاريخ', 'اليوم', 'الفترة', 'القاعة', 'المدرب', 'الحالة', 'الملاحظة'],
      sessions.map(function (s) {
        return [
          asText(s.course || s.courseName), asDateText(s.date), asText(s.day), asText(s.period),
          asText(s.hall), asText(s.trainer), asText(s.state || s.status), asText(s.note)
        ];
      }));

    // الترتيب: المتدربون بالاسم.
    var trainees = (Array.isArray(data.trainees) ? data.trainees : []).slice().sort(function (a, b) {
      return cmpText((a || {}).name, (b || {}).name);
    });
    maybeAdd('المتدربون', 'المتدربون',
      ['الاسم', 'المديرية', 'رقم الهاتف', 'مجموعة التدريب', 'الملاحظات'],
      trainees.map(function (t) {
        return [
          asText(t.name), asText(t.directorate), asText(t.phone), asText(t.course || t.courseName),
          asText(t.notes || t.note)
        ];
      }));

    var trainers = (Array.isArray(data.trainers) ? data.trainers : []).slice().sort(function (a, b) {
      return cmpText((a || {}).name, (b || {}).name);
    });
    maybeAdd('المدربون', 'المدربون',
      ['الاسم', 'التخصص', 'رقم الهاتف', 'الملاحظة'],
      trainers.map(function (t) {
        return [asText(t.name), asText(t.specialty), asText(t.phone), asText(t.note)];
      }));

    var directorates = (Array.isArray(data.directorates) ? data.directorates : []).slice().sort(function (a, b) {
      var na = typeof a === 'string' ? a : (a || {}).name;
      var nb = typeof b === 'string' ? b : (b || {}).name;
      return cmpText(na, nb);
    });
    maybeAdd('المديريات', 'المديريات',
      ['اسم المديرية', 'الملاحظة'],
      directorates.map(function (d) {
        if (typeof d === 'string') return [d, ''];
        return [asText(d.name), asText(d.note)];
      }));

    var groups = (Array.isArray(data.groups) ? data.groups : []).slice().sort(function (a, b) {
      return cmpText((a || {}).name, (b || {}).name);
    });
    maybeAdd('المجموعات التدريبية', 'المجموعات التدريبية', GROUP_HEADERS, groupRows(groups));

    var halls = (Array.isArray(data.halls) ? data.halls : []).slice().sort(function (a, b) {
      return cmpText((a || {}).name, (b || {}).name);
    });
    maybeAdd('القاعات', 'القاعات',
      ['اسم القاعة', 'السعة', 'الموقع', 'الملاحظة'],
      halls.map(function (h) {
        return [asText(h.name), h.capacity != null ? asNumber(h.capacity) : '', asText(h.location), asText(h.note)];
      }));

    // الترتيب: الفترات بوقت البدء.
    var periods = (Array.isArray(data.periods) ? data.periods : []).slice().sort(function (a, b) {
      var t = cmpTimeText((a || {}).time, (b || {}).time);
      return t !== 0 ? t : cmpText((a || {}).label || (a || {}).name, (b || {}).label || (b || {}).name);
    });
    maybeAdd('الفترات', 'الفترات التدريبية',
      ['اسم الفترة', 'الوقت', 'الملاحظة'],
      periods.map(function (p) {
        return [asText(p.label || p.name), asText(p.time), asText(p.note)];
      }));

    // الترتيب: العطل بالتاريخ.
    var holidays = (Array.isArray(data.holidays) ? data.holidays : []).slice().sort(function (a, b) {
      return cmpDateVal((a || {}).date, (b || {}).date);
    });
    maybeAdd('العطل', 'أيام العطل',
      ['التاريخ', 'المناسبة', 'الملاحظة'],
      holidays.map(function (h) {
        return [asDateText(h.date), asText(h.name || h.label || h.reason), asText(h.note)];
      }));

    // الترتيب: المصاريف بالتاريخ.
    var expenses = (Array.isArray(data.expenses) ? data.expenses : []).slice().sort(function (a, b) {
      return cmpDateVal((a || {}).date, (b || {}).date);
    });
    var backupExpensesTotal = 0;
    expenses.forEach(function (e) { backupExpensesTotal += asNumber(e.amount); });
    maybeAdd('المصاريف', 'المصاريف',
      ['التاريخ', 'مجموعة التدريب', 'الفئة', 'البيان', 'التفاصيل', 'المبلغ (ل.س)'],
      expenses.map(function (e) {
        return [
          asDateText(e.date), asText(e.course || e.courseName), asText(e.category),
          asText(e.description), asText(e.details), asNumber(e.amount)
        ];
      }),
      { totals: 'إجمالي المصروف: ' + fmtNumber(backupExpensesTotal) + ' ل.س' });

    // المستخدمون: اسم المستخدم والدور فقط — أبداً كلمات المرور
    // الترتيب: المستخدمون باسم المستخدم.
    var users = (Array.isArray(data.users) ? data.users : []).slice().sort(function (a, b) {
      return cmpText((a || {}).username, (b || {}).username);
    });
    maybeAdd('المستخدمون', 'المستخدمون',
      ['اسم المستخدم', 'الدور'],
      users.map(function (u) {
        return [asText(u.username), asText(u.role)];
      }));

    // سجل التدقيق: فقط إذا وُفّر — الأحدث أولاً (سجل نشاط).
    if (Array.isArray(data.audit)) {
      var auditRows = data.audit.slice().sort(function (a, b) {
        var ta = (a || {}).timestamp || (a || {}).date || (a || {}).time || '';
        var tb = (b || {}).timestamp || (b || {}).date || (b || {}).time || '';
        var ma = ta instanceof Date ? ta.getTime() : Date.parse(String(ta));
        var mb = tb instanceof Date ? tb.getTime() : Date.parse(String(tb));
        if (!isNaN(ma) && !isNaN(mb)) return mb - ma;
        return String(tb) < String(ta) ? -1 : String(tb) > String(ta) ? 1 : 0;
      });
      addTableSheet(wb, 'سجل التدقيق', 'سجل التدقيق', '',
        ['التاريخ والوقت', 'المستخدم', 'الإجراء', 'التفاصيل'],
        auditRows.map(function (a) {
          return [
            asDateTimeText(a.timestamp || a.date || a.time),
            asText(a.user || a.username),
            asText(a.action),
            asText(a.details || a.detail)
          ];
        }));
      added++;
    }

    if (added === 0) {
      var ws = createSheet(wb, 'النسخة الاحتياطية', 'النسخة الاحتياطية', '', 1,
        buildDetailsText(null, null, 0, null));
      writeDataRow(ws, HEADER_ROW, ['لا توجد بيانات للنسخ الاحتياطي']);
      finishSheet(ws, 1);
    }

    var filename = 'tadreeb-backup-' + todayString() + '.xlsx';
    return writeWorkbook(wb, filename);
  }

  /* ---------- مساعدات تصدير الإحصاءات (v2.1 — بند 10) ----------
   * كل قسم له تصدير إحصاءات مخصص لبياناته (لا تفريغ عام واحد).
   * الأعمدة قابلة للاختيار: كل عمود {id, label, get(row)}؛ options.columns
   * خريطة id ← bool من نافذة المنتقي (false يُخفي العمود). بلا خيارات
   * تُصدَّر كل الأعمدة، وعمود واحد على الأقل يبقى دائماً. */
  function visibleColumns(columns, options) {
    var map = options && options.columns;
    if (!map || typeof map !== 'object') return columns.slice();
    var visible = columns.filter(function (c) { return map[c.id] !== false; });
    return visible.length ? visible : columns.slice(0, 1);
  }

  // ورقة جدول إحصاءات من تعريفات أعمدة + صفوف بيانات خام.
  function addStatsSheet(wb, name, title, subtitle, columns, rows, options, extra) {
    var cols = visibleColumns(columns, options);
    var headers = cols.map(function (c) { return c.label; });
    var dataRows = (Array.isArray(rows) ? rows : []).map(function (r) {
      return cols.map(function (c) { return c.get(r); });
    });
    return addTableSheet(wb, name, title, subtitle, headers, dataRows, extra);
  }

  // ورقة «ملخص عام» من أزواج [البند، القيمة] (الأرقام خلايا رقمية حقيقية).
  function addSummarySheet(wb, title, subtitle, pairs, extra) {
    return addTableSheet(wb, 'ملخص عام', title, subtitle, ['البند', 'القيمة'],
      (Array.isArray(pairs) ? pairs : []).map(function (p) {
        return [asText(p[0]), p[1] == null ? '' : p[1]];
      }), extra);
  }

  // سطر نطاق زمني للعنوان الفرعي («النطاق: 2026-11-01 — 2026-11-30»).
  function rangeSubtitle(from, to) {
    var f = asDateText(from), t = asDateText(to);
    if (f && t) return 'النطاق: ' + f + ' — ' + t;
    if (f) return 'من: ' + f;
    if (t) return 'إلى: ' + t;
    return '';
  }

  // أعمدة إشغال القاعات (مشتركة بين إحصاءات القاعات والرزنامة).
  function hallUsageColumns() {
    return [
      { id: 'name', label: 'القاعة', get: function (r) { return asText(r.name); } },
      { id: 'code', label: 'المعرّف', get: function (r) { return asText(r.code); } },
      { id: 'sessions', label: 'عدد الجلسات', get: function (r) { return asNumber(r.sessions); } },
      { id: 'meetings', label: 'عدد الاجتماعات', get: function (r) { return asNumber(r.meetings); } },
      { id: 'busySlots', label: 'الفتحات المشغولة', get: function (r) { return asNumber(r.busySlots); } },
      { id: 'totalSlots', label: 'إجمالي الفتحات', get: function (r) { return asNumber(r.totalSlots); } },
      { id: 'occupancy', label: 'نسبة الإشغال %', get: function (r) { return r.occupancy != null ? asNumber(r.occupancy) : ''; } }
    ];
  }

  /* ---------- 11أ. إحصاءات القاعات ---------- */
  // data: {from, to, halls: [{name, code, capacity, sessions, meetings,
  // busySlots, totalSlots, occupancy}], summary: {halls, capacity, sessions,
  // meetings, occupancy, busiestHall}} — كما يبنيه TadreebStats.exportData('halls-stats').
  function exportHallsStats(data, options) {
    data = data || {};
    activeFmt = resolveFmt(data);
    // الترتيب: بالاسم.
    var halls = (Array.isArray(data.halls) ? data.halls : []).slice().sort(function (a, b) {
      return cmpText((a || {}).name, (b || {}).name);
    });
    var summary = data.summary || {};
    var wb = newWorkbook();
    var columns = [
      { id: 'name', label: 'القاعة', get: function (r) { return asText(r.name); } },
      { id: 'code', label: 'المعرّف', get: function (r) { return asText(r.code); } },
      { id: 'capacity', label: 'السعة', get: function (r) { return r.capacity != null ? asNumber(r.capacity) : ''; } }
    ].concat(hallUsageColumns().slice(2));
    addStatsSheet(wb, 'إحصاءات القاعات', 'إحصاءات القاعات', rangeSubtitle(data.from, data.to),
      columns, halls, options);
    addSummarySheet(wb, 'ملخص إشغال القاعات', rangeSubtitle(data.from, data.to), [
      ['عدد القاعات', summary.halls != null ? asNumber(summary.halls) : ''],
      ['إجمالي السعة', summary.capacity != null ? asNumber(summary.capacity) : ''],
      ['إجمالي الجلسات', summary.sessions != null ? asNumber(summary.sessions) : ''],
      ['إجمالي الاجتماعات', summary.meetings != null ? asNumber(summary.meetings) : ''],
      ['نسبة الإشغال الإجمالية %', summary.occupancy != null ? asNumber(summary.occupancy) : ''],
      ['القاعة الأكثر استخداماً', asText(summary.busiestHall)]
    ]);
    var filename = 'tadreeb-halls-stats-' + todayString() + '.xlsx';
    return writeWorkbook(wb, filename);
  }

  /* ---------- 11ب. تفاصيل قاعة واحدة ---------- */
  // data: {hall: {name, code, capacity}, from, to, stats: {sessions, meetings,
  // occupancy, capacity, courses}, sessions: [{date, period, course, trainer,
  // state}], meetings: [{date, period, title, organizer, status}]}.
  function exportHallDetail(data, options) {
    data = data || {};
    activeFmt = resolveFmt(data);
    var hall = data.hall || {};
    var stats = data.stats || {};
    // الترتيب: الجلسات والاجتماعات بالتاريخ ثم الفترة.
    var sessions = (Array.isArray(data.sessions) ? data.sessions : []).slice().sort(function (a, b) {
      var d = cmpDateVal((a || {}).date, (b || {}).date);
      return d !== 0 ? d : cmpText((a || {}).period, (b || {}).period);
    });
    var meetings = (Array.isArray(data.meetings) ? data.meetings : []).slice().sort(function (a, b) {
      var d = cmpDateVal((a || {}).date, (b || {}).date);
      return d !== 0 ? d : cmpText((a || {}).period, (b || {}).period);
    });
    var wb = newWorkbook();
    addTableSheet(wb, 'إحصاءات القاعة', 'إحصاءات القاعة', asText(hall.name),
      ['البند', 'القيمة'], [
        ['القاعة', asText(hall.name)],
        ['المعرّف', asText(hall.code)],
        ['السعة', hall.capacity != null ? asNumber(hall.capacity) : ''],
        ['عدد الجلسات', stats.sessions != null ? asNumber(stats.sessions) : ''],
        ['عدد الاجتماعات', stats.meetings != null ? asNumber(stats.meetings) : ''],
        ['نسبة الإشغال %', stats.occupancy != null ? asNumber(stats.occupancy) : ''],
        ['عدد مجموعات التدريب', stats.courses != null ? asNumber(stats.courses) : ''],
        ['النطاق', rangeSubtitle(data.from, data.to)]
      ]);
    addStatsSheet(wb, 'الجلسات', 'جلسات القاعة', asText(hall.name), [
      { id: 'date', label: 'التاريخ', get: function (r) { return asDateText(r.date); } },
      { id: 'period', label: 'الفترة', get: function (r) { return asText(r.period); } },
      { id: 'course', label: 'الدورة', get: function (r) { return asText(r.course); } },
      { id: 'trainer', label: 'المدرب', get: function (r) { return asText(r.trainer); } },
      { id: 'state', label: 'الحالة', get: function (r) { return asText(r.state); } }
    ], sessions, options);
    if (meetings.length) {
      addStatsSheet(wb, 'الاجتماعات', 'اجتماعات القاعة', asText(hall.name), [
        { id: 'date', label: 'التاريخ', get: function (r) { return asDateText(r.date); } },
        { id: 'period', label: 'الفترة', get: function (r) { return asText(r.period); } },
        { id: 'title', label: 'العنوان', get: function (r) { return asText(r.title); } },
        { id: 'organizer', label: 'المنظم', get: function (r) { return asText(r.organizer); } },
        { id: 'status', label: 'الحالة', get: function (r) { return asText(r.status); } }
      ], meetings, options);
    }
    var filename = 'tadreeb-hall-' + sanitizeFilename(hall.name) + '-' + todayString() + '.xlsx';
    return writeWorkbook(wb, filename);
  }

  /* ---------- 11ج. إحصاءات المدربين ---------- */
  // data: {trainers: [{name, code, specialty, courses, sessions, hours,
  // feeDue}], summary: {trainers, withCourses, withoutCourses, totalSessions,
  // totalHours, totalFeesDue}}.
  function exportTrainersStats(data, options) {
    data = data || {};
    activeFmt = resolveFmt(data);
    // الترتيب: بالاسم.
    var trainers = (Array.isArray(data.trainers) ? data.trainers : []).slice().sort(function (a, b) {
      return cmpText((a || {}).name, (b || {}).name);
    });
    var summary = data.summary || {};
    var wb = newWorkbook();
    addStatsSheet(wb, 'إحصاءات المدربين', 'إحصاءات المدربين', '', [
      { id: 'name', label: 'المدرب', get: function (r) { return asText(r.name); } },
      { id: 'code', label: 'المعرّف', get: function (r) { return asText(r.code); } },
      { id: 'specialty', label: 'التخصص', get: function (r) { return asText(r.specialty); } },
      { id: 'courses', label: 'عدد مجموعات التدريب', get: function (r) { return asNumber(r.courses); } },
      { id: 'sessions', label: 'عدد الجلسات', get: function (r) { return asNumber(r.sessions); } },
      { id: 'hours', label: 'إجمالي الساعات', get: function (r) { return r.hours != null ? asNumber(r.hours) : ''; } },
      { id: 'feeDue', label: 'الأجور المستحقة (ل.س)', get: function (r) { return r.feeDue != null ? asNumber(r.feeDue) : ''; } }
    ], trainers, options,
      summary.totalFeesDue != null ? { totals: 'إجمالي الأجور المستحقة: ' + fmtNumber(summary.totalFeesDue) + ' ل.س' } : null);
    addSummarySheet(wb, 'ملخص المدربين', '', [
      ['عدد المدربين', summary.trainers != null ? asNumber(summary.trainers) : ''],
      ['مدربون لهم مجموعات تدريب', summary.withCourses != null ? asNumber(summary.withCourses) : ''],
      ['مدربون بلا مجموعات تدريب', summary.withoutCourses != null ? asNumber(summary.withoutCourses) : ''],
      ['إجمالي الجلسات', summary.totalSessions != null ? asNumber(summary.totalSessions) : ''],
      ['إجمالي الساعات', summary.totalHours != null ? asNumber(summary.totalHours) : ''],
      ['إجمالي الأجور المستحقة (ل.س)', summary.totalFeesDue != null ? asNumber(summary.totalFeesDue) : '']
    ]);
    var filename = 'tadreeb-trainers-stats-' + todayString() + '.xlsx';
    return writeWorkbook(wb, filename);
  }

  /* ---------- 11د. إحصاءات المجموعات التدريبية ---------- */
  // data: {groups: [{name, code, directorate, members, courses, sessions}],
  // summary: {groups, members, courses, emptyGroups, groupsWithoutCourses}}.
  function exportGroupsStats(data, options) {
    data = data || {};
    activeFmt = resolveFmt(data);
    // الترتيب: بالاسم.
    var groups = (Array.isArray(data.groups) ? data.groups : []).slice().sort(function (a, b) {
      return cmpText((a || {}).name, (b || {}).name);
    });
    var summary = data.summary || {};
    var wb = newWorkbook();
    addStatsSheet(wb, 'إحصاءات المجموعات', 'إحصاءات المجموعات التدريبية', '', [
      { id: 'name', label: 'المجموعة', get: function (r) { return asText(r.name); } },
      { id: 'code', label: 'المعرّف', get: function (r) { return asText(r.code); } },
      { id: 'directorate', label: 'المديرية', get: function (r) { return asText(r.directorate); } },
      { id: 'members', label: 'عدد الأعضاء', get: function (r) { return asNumber(r.members); } },
      { id: 'courses', label: 'عدد مجموعات التدريب', get: function (r) { return asNumber(r.courses); } },
      { id: 'sessions', label: 'عدد الجلسات', get: function (r) { return asNumber(r.sessions); } }
    ], groups, options);
    addSummarySheet(wb, 'ملخص المجموعات', '', [
      ['عدد المجموعات', summary.groups != null ? asNumber(summary.groups) : ''],
      ['إجمالي الأعضاء', summary.members != null ? asNumber(summary.members) : ''],
      ['إجمالي مجموعات التدريب', summary.courses != null ? asNumber(summary.courses) : ''],
      ['مجموعات بلا أعضاء', summary.emptyGroups != null ? asNumber(summary.emptyGroups) : ''],
      ['مجموعات غير معيّنة', summary.groupsWithoutCourses != null ? asNumber(summary.groupsWithoutCourses) : '']
    ]);
    var filename = 'tadreeb-groups-stats-' + todayString() + '.xlsx';
    return writeWorkbook(wb, filename);
  }

  /* ---------- 11هـ. إحصاءات المديريات ---------- */
  // data: {directorates: [{name, code, trainees, groups, courses, sessions}],
  // summary: {directorates, trainees, groups, courses, topDirectorate}}.
  function exportDirectoratesStats(data, options) {
    data = data || {};
    activeFmt = resolveFmt(data);
    // الترتيب: بالاسم.
    var directorates = (Array.isArray(data.directorates) ? data.directorates : []).slice().sort(function (a, b) {
      return cmpText((a || {}).name, (b || {}).name);
    });
    var summary = data.summary || {};
    var wb = newWorkbook();
    addStatsSheet(wb, 'إحصاءات المديريات', 'إحصاءات المديريات', '', [
      { id: 'name', label: 'المديرية', get: function (r) { return asText(r.name); } },
      { id: 'code', label: 'المعرّف', get: function (r) { return asText(r.code); } },
      { id: 'trainees', label: 'عدد المتدربين', get: function (r) { return asNumber(r.trainees); } },
      { id: 'groups', label: 'عدد المجموعات', get: function (r) { return asNumber(r.groups); } },
      { id: 'courses', label: 'عدد مجموعات التدريب', get: function (r) { return asNumber(r.courses); } },
      { id: 'sessions', label: 'عدد الجلسات', get: function (r) { return asNumber(r.sessions); } }
    ], directorates, options);
    addSummarySheet(wb, 'ملخص المديريات', '', [
      ['عدد المديريات', summary.directorates != null ? asNumber(summary.directorates) : ''],
      ['إجمالي المتدربين', summary.trainees != null ? asNumber(summary.trainees) : ''],
      ['إجمالي المجموعات', summary.groups != null ? asNumber(summary.groups) : ''],
      ['إجمالي مجموعات التدريب', summary.courses != null ? asNumber(summary.courses) : ''],
      ['المديرية الأكثر متدربين', asText(summary.topDirectorate)]
    ]);
    var filename = 'tadreeb-directorates-stats-' + todayString() + '.xlsx';
    return writeWorkbook(wb, filename);
  }

  /* ---------- 11و. إحصاءات الفترات التدريبية ---------- */
  // data: {periods: [{label, code, time, duration, sessions, share}],
  // summary: {periods, sessions, busiestPeriod, totalHours}}.
  function exportPeriodsStats(data, options) {
    data = data || {};
    activeFmt = resolveFmt(data);
    // الترتيب: بوقت البدء.
    var periods = (Array.isArray(data.periods) ? data.periods : []).slice().sort(function (a, b) {
      var t = cmpTimeText((a || {}).time, (b || {}).time);
      return t !== 0 ? t : cmpText((a || {}).label, (b || {}).label);
    });
    var summary = data.summary || {};
    var wb = newWorkbook();
    addStatsSheet(wb, 'إحصاءات الفترات', 'إحصاءات الفترات التدريبية', '', [
      { id: 'label', label: 'الفترة', get: function (r) { return asText(r.label); } },
      { id: 'code', label: 'المعرّف', get: function (r) { return asText(r.code); } },
      { id: 'time', label: 'الوقت', get: function (r) { return asText(r.time); } },
      { id: 'duration', label: 'المدة (دقيقة)', get: function (r) { return r.duration != null ? asNumber(r.duration) : ''; } },
      { id: 'sessions', label: 'عدد الجلسات', get: function (r) { return asNumber(r.sessions); } },
      { id: 'share', label: 'الحصة %', get: function (r) { return r.share != null ? asNumber(r.share) : ''; } }
    ], periods, options);
    addSummarySheet(wb, 'ملخص الفترات', '', [
      ['عدد الفترات', summary.periods != null ? asNumber(summary.periods) : ''],
      ['إجمالي الجلسات', summary.sessions != null ? asNumber(summary.sessions) : ''],
      ['الفترة الأكثر استخداماً', asText(summary.busiestPeriod)],
      ['مجموع ساعات الفترات', summary.totalHours != null ? asNumber(summary.totalHours) : '']
    ]);
    var filename = 'tadreeb-periods-stats-' + todayString() + '.xlsx';
    return writeWorkbook(wb, filename);
  }

  /* ---------- 11ز. إحصاءات المستويات ---------- */
  // data: {levels: [{level, courses, sessions, trainees}],
  // summary: {levels, courses, withoutLevel, topLevel}}.
  function exportLevelsStats(data, options) {
    data = data || {};
    activeFmt = resolveFmt(data);
    // الترتيب: بالاسم.
    var levels = (Array.isArray(data.levels) ? data.levels : []).slice().sort(function (a, b) {
      return cmpText((a || {}).level, (b || {}).level);
    });
    var summary = data.summary || {};
    var wb = newWorkbook();
    addStatsSheet(wb, 'إحصاءات المستويات', 'إحصاءات مستويات مجموعات التدريب', '', [
      { id: 'level', label: 'المستوى', get: function (r) { return asText(r.level); } },
      { id: 'courses', label: 'عدد مجموعات التدريب', get: function (r) { return asNumber(r.courses); } },
      { id: 'sessions', label: 'عدد الجلسات', get: function (r) { return asNumber(r.sessions); } },
      { id: 'trainees', label: 'عدد المتدربين', get: function (r) { return asNumber(r.trainees); } }
    ], levels, options);
    addSummarySheet(wb, 'ملخص المستويات', '', [
      ['عدد المستويات', summary.levels != null ? asNumber(summary.levels) : ''],
      ['إجمالي مجموعات التدريب', summary.courses != null ? asNumber(summary.courses) : ''],
      ['مجموعات تدريب بلا مستوى', summary.withoutLevel != null ? asNumber(summary.withoutLevel) : ''],
      ['المستوى الأكثر مجموعات تدريب', asText(summary.topLevel)]
    ]);
    var filename = 'tadreeb-levels-stats-' + todayString() + '.xlsx';
    return writeWorkbook(wb, filename);
  }

  /* ---------- 11ح. الاجتماعات العارضة ---------- */
  // data: {from, to, meetings: [{date, period, hall, title, organizer,
  // status, note}], summary: {total, scheduled, cancelled, upcoming, topHall}}.
  function exportMeetings(data, options) {
    data = data || {};
    activeFmt = resolveFmt(data);
    // الترتيب: بالتاريخ ثم الفترة.
    var meetings = (Array.isArray(data.meetings) ? data.meetings : []).slice().sort(function (a, b) {
      var d = cmpDateVal((a || {}).date, (b || {}).date);
      return d !== 0 ? d : cmpText((a || {}).period, (b || {}).period);
    });
    var summary = data.summary || {};
    var wb = newWorkbook();
    var columns = visibleColumns([
      { id: 'date', label: 'التاريخ', get: function (r) { return asDateText(r.date); } },
      { id: 'period', label: 'الفترة', get: function (r) { return asText(r.period); } },
      { id: 'hall', label: 'القاعة', get: function (r) { return asText(r.hall); } },
      { id: 'title', label: 'العنوان', get: function (r) { return asText(r.title); } },
      { id: 'organizer', label: 'المنظم', get: function (r) { return asText(r.organizer); } },
      { id: 'status', label: 'الحالة', get: function (r) { return asText(r.status); } },
      { id: 'note', label: 'الملاحظة', get: function (r) { return asText(r.note); } }
    ], options);
    var ws = createSheet(wb, 'الاجتماعات العارضة', 'الاجتماعات العارضة',
      rangeSubtitle(data.from, data.to), columns.length,
      buildDetailsText(rangeSubtitle(data.from, data.to), null, meetings.length, null));
    writeHeaderRow(ws, HEADER_ROW, columns.map(function (c) { return c.label; }));
    meetings.forEach(function (m, i) {
      writeDataRow(ws, DATA_ROW + i, columns.map(function (c) { return c.get(m); }));
    });
    // كتلة الملخص أسفل الجدول (كما في تصدير الحضور).
    var next = DATA_ROW + meetings.length + 1;
    writeHeaderRow(ws, next, ['الملخص', 'العدد']);
    writeDataRow(ws, next + 1, ['إجمالي الاجتماعات', meetings.length]);
    writeDataRow(ws, next + 2, ['مجدولة', summary.scheduled != null ? asNumber(summary.scheduled) : '']);
    writeDataRow(ws, next + 3, ['ملغاة', summary.cancelled != null ? asNumber(summary.cancelled) : '']);
    writeDataRow(ws, next + 4, ['قادمة', summary.upcoming != null ? asNumber(summary.upcoming) : '']);
    finishSheet(ws, columns.length);
    var filename = 'tadreeb-meetings-' + todayString() + '.xlsx';
    return writeWorkbook(wb, filename);
  }

  /* ---------- 11ط. إحصاءات المستخدمين ----------
   * المستخدمون: اسم المستخدم والدور فقط — أبداً كلمات المرور
   * (كما في النسخة الاحتياطية). */
  // data: {users: [{username, role}], summary: {total, admins, editors,
  // viewers, disabled}}.
  function exportUsersStats(data, options) {
    data = data || {};
    activeFmt = resolveFmt(data);
    // الترتيب: باسم المستخدم.
    var users = (Array.isArray(data.users) ? data.users : []).slice().sort(function (a, b) {
      return cmpText((a || {}).username, (b || {}).username);
    });
    var summary = data.summary || {};
    var wb = newWorkbook();
    addStatsSheet(wb, 'المستخدمون', 'المستخدمون', '', [
      { id: 'username', label: 'اسم المستخدم', get: function (r) { return asText(r.username); } },
      { id: 'role', label: 'الدور', get: function (r) { return asText(r.role); } }
    ], users, options);
    addSummarySheet(wb, 'ملخص المستخدمين', '', [
      ['عدد المستخدمين', summary.total != null ? asNumber(summary.total) : ''],
      ['مدراء', summary.admins != null ? asNumber(summary.admins) : ''],
      ['محررون', summary.editors != null ? asNumber(summary.editors) : ''],
      ['عارضون', summary.viewers != null ? asNumber(summary.viewers) : ''],
      ['حسابات معطلة', summary.disabled != null ? asNumber(summary.disabled) : '']
    ]);
    var filename = 'tadreeb-users-stats-' + todayString() + '.xlsx';
    return writeWorkbook(wb, filename);
  }

  /* ---------- 11ي. إحصاءات المصاريف (كل المنصة) ---------- */
  // data: {byCategory: [{category, count, total}], byCourse: [{course,
  // count, total}], summary: {totalSpent, count, avgExpense,
  // categoriesCount, topCategory, topCourse}}.
  function exportExpensesStats(data, options) {
    data = data || {};
    activeFmt = resolveFmt(data);
    // الترتيب: بالإجمالي تنازلياً (الأعلى صرفاً أولاً).
    var byCategory = (Array.isArray(data.byCategory) ? data.byCategory : []).slice().sort(function (a, b) {
      return asNumber((b || {}).total) - asNumber((a || {}).total);
    });
    var byCourse = (Array.isArray(data.byCourse) ? data.byCourse : []).slice().sort(function (a, b) {
      return asNumber((b || {}).total) - asNumber((a || {}).total);
    });
    var summary = data.summary || {};
    var wb = newWorkbook();
    var catTotal = 0, courseTotal = 0;
    byCategory.forEach(function (r) { catTotal += asNumber(r.total); });
    byCourse.forEach(function (r) { courseTotal += asNumber(r.total); });
    addStatsSheet(wb, 'المصاريف حسب الفئة', 'المصاريف حسب الفئة', '', [
      { id: 'category', label: 'الفئة', get: function (r) { return asText(r.category); } },
      { id: 'count', label: 'عدد المصاريف', get: function (r) { return asNumber(r.count); } },
      { id: 'total', label: 'الإجمالي (ل.س)', get: function (r) { return asNumber(r.total); } }
    ], byCategory, options, { totals: 'إجمالي المصروف: ' + fmtNumber(catTotal) + ' ل.س' });
    addStatsSheet(wb, 'المصاريف حسب مجموعة التدريب', 'المصاريف حسب مجموعة التدريب', '', [
      { id: 'course', label: 'مجموعة التدريب', get: function (r) { return asText(r.course); } },
      { id: 'count', label: 'عدد المصاريف', get: function (r) { return asNumber(r.count); } },
      { id: 'total', label: 'الإجمالي (ل.س)', get: function (r) { return asNumber(r.total); } }
    ], byCourse, options, { totals: 'إجمالي المصروف: ' + fmtNumber(courseTotal) + ' ل.س' });
    addSummarySheet(wb, 'ملخص المصاريف', '', [
      ['إجمالي المصروف (ل.س)', summary.totalSpent != null ? asNumber(summary.totalSpent) : ''],
      ['عدد المصاريف', summary.count != null ? asNumber(summary.count) : ''],
      ['متوسط المصروف (ل.س)', summary.avgExpense != null ? asNumber(summary.avgExpense) : ''],
      ['عدد الفئات المستخدمة', summary.categoriesCount != null ? asNumber(summary.categoriesCount) : ''],
      ['الفئة الأعلى صرفاً', asText(summary.topCategory)],
      ['مجموعة التدريب الأعلى صرفاً', asText(summary.topCourse)]
    ]);
    var filename = 'tadreeb-expenses-stats-' + todayString() + '.xlsx';
    return writeWorkbook(wb, filename);
  }

  /* ---------- 11ك. إحصاءات الحضور ---------- */
  // data: {scope: 'courses'|'groups'|'trainees', scopeLabel, nameLabel,
  // rows: [{name, present, absent, excused, unrecorded, total, rate}],
  // summary: {present, absent, excused, unrecorded, total, rate}}.
  function exportAttendanceStats(data, options) {
    data = data || {};
    activeFmt = resolveFmt(data);
    // الترتيب: بالاسم.
    var rows = (Array.isArray(data.rows) ? data.rows : []).slice().sort(function (a, b) {
      return cmpText((a || {}).name, (b || {}).name);
    });
    var summary = data.summary || {};
    var nameLabel = data.nameLabel || 'الاسم';
    var wb = newWorkbook();
    addStatsSheet(wb, 'إحصاءات الحضور', 'إحصاءات الحضور', asText(data.scopeLabel), [
      { id: 'name', label: nameLabel, get: function (r) { return asText(r.name); } },
      { id: 'present', label: 'موجود', get: function (r) { return asNumber(r.present); } },
      { id: 'absent', label: 'غائب', get: function (r) { return asNumber(r.absent); } },
      { id: 'excused', label: 'معتذر', get: function (r) { return asNumber(r.excused); } },
      { id: 'cancelled', label: 'ملغي', get: function (r) { return asNumber(r.cancelled); } },
      { id: 'unrecorded', label: 'بلا تسجيل', get: function (r) { return asNumber(r.unrecorded); } },
      { id: 'total', label: 'إجمالي المسجل', get: function (r) { return asNumber(r.total); } },
      { id: 'rate', label: 'نسبة الحضور %', get: function (r) { return r.rate != null ? asNumber(r.rate) : ''; } }
    ], rows, options);
    addSummarySheet(wb, 'ملخص الحضور', asText(data.scopeLabel), [
      ['موجود', summary.present != null ? asNumber(summary.present) : ''],
      ['غائب', summary.absent != null ? asNumber(summary.absent) : ''],
      ['معتذر', summary.excused != null ? asNumber(summary.excused) : ''],
      ['ملغي', summary.cancelled != null ? asNumber(summary.cancelled) : ''],
      ['بلا تسجيل', summary.unrecorded != null ? asNumber(summary.unrecorded) : ''],
      ['إجمالي المسجل', summary.total != null ? asNumber(summary.total) : ''],
      ['نسبة الحضور %', summary.rate != null ? asNumber(summary.rate) : '']
    ]);
    var scope = data.scope ? sanitizeFilename(data.scope) : 'all';
    var filename = 'tadreeb-attendance-stats-' + scope + '-' + todayString() + '.xlsx';
    return writeWorkbook(wb, filename);
  }

  /* ---------- 11ل. إحصاءات الرزنامة في نطاق ---------- */
  // data: {from, to, summary: {sessions, done, scheduled, cancelled,
  // trainerAbsent, holiday, meetings, occupancy, busiestHall, busiestPeriod},
  // byHall: [{name, code, sessions, meetings, busySlots, totalSlots,
  // occupancy}], byPeriod: [{label, time, sessions, share}]}.
  function exportCalendarStats(data, options) {
    data = data || {};
    activeFmt = resolveFmt(data);
    var summary = data.summary || {};
    // الترتيب: القاعات بالاسم، الفترات بوقت البدء.
    var byHall = (Array.isArray(data.byHall) ? data.byHall : []).slice().sort(function (a, b) {
      return cmpText((a || {}).name, (b || {}).name);
    });
    var byPeriod = (Array.isArray(data.byPeriod) ? data.byPeriod : []).slice().sort(function (a, b) {
      var t = cmpTimeText((a || {}).time, (b || {}).time);
      return t !== 0 ? t : cmpText((a || {}).label, (b || {}).label);
    });
    var wb = newWorkbook();
    addTableSheet(wb, 'ملخص النطاق', 'ملخص النطاق', rangeSubtitle(data.from, data.to),
      ['البند', 'القيمة'], [
        ['النطاق', rangeSubtitle(data.from, data.to)],
        ['إجمالي الجلسات', summary.sessions != null ? asNumber(summary.sessions) : ''],
        ['مكتملة', summary.done != null ? asNumber(summary.done) : ''],
        ['مجدولة', summary.scheduled != null ? asNumber(summary.scheduled) : ''],
        ['ملغاة', summary.cancelled != null ? asNumber(summary.cancelled) : ''],
        ['غياب مدرب', summary.trainerAbsent != null ? asNumber(summary.trainerAbsent) : ''],
        ['عطلة', summary.holiday != null ? asNumber(summary.holiday) : ''],
        ['اجتماعات عارضة', summary.meetings != null ? asNumber(summary.meetings) : ''],
        ['نسبة إشغال القاعات %', summary.occupancy != null ? asNumber(summary.occupancy) : ''],
        ['القاعة الأكثر استخداماً', asText(summary.busiestHall)],
        ['الفترة الأكثر استخداماً', asText(summary.busiestPeriod)]
      ]);
    addStatsSheet(wb, 'القاعات', 'إشغال القاعات في النطاق', rangeSubtitle(data.from, data.to),
      hallUsageColumns(), byHall, options);
    addStatsSheet(wb, 'الفترات', 'الجلسات حسب الفترة', rangeSubtitle(data.from, data.to), [
      { id: 'label', label: 'الفترة', get: function (r) { return asText(r.label); } },
      { id: 'time', label: 'الوقت', get: function (r) { return asText(r.time); } },
      { id: 'sessions', label: 'عدد الجلسات', get: function (r) { return asNumber(r.sessions); } },
      { id: 'share', label: 'الحصة %', get: function (r) { return r.share != null ? asNumber(r.share) : ''; } }
    ], byPeriod, options);
    var fromIso = isoDateText(data.from) || todayString();
    var toIso = isoDateText(data.to) || fromIso;
    var filename = 'tadreeb-calendar-stats-' + fromIso + '-to-' + toIso + '.xlsx';
    return writeWorkbook(wb, filename);
  }

  /* ---------- 11م. العطل ---------- */
  // data: {holidays: [{date, name, note}], summary: {total, upcoming, past,
  // holidaySessions}}.
  function exportHolidays(data, options) {
    data = data || {};
    activeFmt = resolveFmt(data);
    // الترتيب: بالتاريخ.
    var holidays = (Array.isArray(data.holidays) ? data.holidays : []).slice().sort(function (a, b) {
      return cmpDateVal((a || {}).date, (b || {}).date);
    });
    var summary = data.summary || {};
    var wb = newWorkbook();
    var columns = visibleColumns([
      { id: 'date', label: 'التاريخ', get: function (r) { return asDateText(r.date); } },
      { id: 'name', label: 'اسم العطلة', get: function (r) { return asText(r.name); } },
      { id: 'note', label: 'الملاحظة', get: function (r) { return asText(r.note); } }
    ], options);
    var ws = createSheet(wb, 'العطل', 'العطل', '', columns.length,
      buildDetailsText(null, null, holidays.length, null));
    writeHeaderRow(ws, HEADER_ROW, columns.map(function (c) { return c.label; }));
    holidays.forEach(function (h, i) {
      writeDataRow(ws, DATA_ROW + i, columns.map(function (c) { return c.get(h); }));
    });
    // كتلة الملخص أسفل الجدول (كما في تصدير الحضور).
    var next = DATA_ROW + holidays.length + 1;
    writeHeaderRow(ws, next, ['الملخص', 'العدد']);
    writeDataRow(ws, next + 1, ['إجمالي العطل', holidays.length]);
    writeDataRow(ws, next + 2, ['قادمة', summary.upcoming != null ? asNumber(summary.upcoming) : '']);
    writeDataRow(ws, next + 3, ['سابقة', summary.past != null ? asNumber(summary.past) : '']);
    writeDataRow(ws, next + 4, ['جلسات مسجلة عطلة', summary.holidaySessions != null ? asNumber(summary.holidaySessions) : '']);
    finishSheet(ws, columns.length);
    var filename = 'tadreeb-holidays-' + todayString() + '.xlsx';
    return writeWorkbook(wb, filename);
  }

  /* ---------- 12. نافذة خيارات التصدير ---------- */
  function openExportPicker(opts) {
    opts = opts || {};
    if (typeof document === 'undefined') {
      throw new Error('openExportPicker requires a DOM');
    }

    var title = opts.title || 'خيارات التصدير';
    var sections = Array.isArray(opts.sections) ? opts.sections : [];
    var columns = Array.isArray(opts.columns) ? opts.columns : [];
    var scopeOptions = Array.isArray(opts.scopeOptions) ? opts.scopeOptions : [];
    var showDateRange = opts.dateRange === true;
    var onConfirm = typeof opts.onConfirm === 'function' ? opts.onConfirm : function () {};
    var onCancel = typeof opts.onCancel === 'function' ? opts.onCancel : function () {};

    var closed = false;

    var overlay = document.createElement('div');
    overlay.className = 'tadreeb-export-overlay';
    overlay.setAttribute('role', 'presentation');

    var dialog = document.createElement('div');
    dialog.className = 'tadreeb-export-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', title);
    dialog.setAttribute('dir', 'rtl');
    dialog.setAttribute('tabindex', '-1');

    function el(tag, className, text) {
      var n = document.createElement(tag);
      if (className) n.className = className;
      if (text != null) n.textContent = text;
      return n;
    }

    // العنوان
    var header = el('div', 'tadreeb-export-header');
    header.appendChild(el('h2', 'tadreeb-export-title', title));
    var closeBtn = el('button', 'tadreeb-export-close', '✕');
    closeBtn.setAttribute('type', 'button');
    closeBtn.setAttribute('aria-label', 'إغلاق');
    closeBtn.addEventListener('click', closeCancelled);
    header.appendChild(closeBtn);
    dialog.appendChild(header);

    var body = el('div', 'tadreeb-export-body');

    // الأقسام
    var sectionInputs = {};
    if (sections.length) {
      body.appendChild(el('h3', 'tadreeb-export-group-title', 'الأقسام'));
      var secList = el('div', 'tadreeb-export-list');
      sections.forEach(function (s, i) {
        var label = el('label', 'tadreeb-export-check');
        var input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = s.checked !== false;
        input.id = 'tadreeb-export-sec-' + i;
        sectionInputs[s.id] = input;
        label.appendChild(input);
        label.appendChild(document.createTextNode(' ' + s.label));
        secList.appendChild(label);
      });
      body.appendChild(secList);
    }

    // الأعمدة
    var columnInputs = {};
    if (columns.length) {
      body.appendChild(el('h3', 'tadreeb-export-group-title', 'الأعمدة'));
      var colList = el('div', 'tadreeb-export-list');
      columns.forEach(function (c, i) {
        var label = el('label', 'tadreeb-export-check');
        var input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = c.checked !== false;
        input.id = 'tadreeb-export-col-' + i;
        columnInputs[c.id] = input;
        label.appendChild(input);
        label.appendChild(document.createTextNode(' ' + c.label));
        colList.appendChild(label);
      });
      body.appendChild(colList);
    }

    // النطاق
    var scopeInputs = [];
    if (scopeOptions.length) {
      body.appendChild(el('h3', 'tadreeb-export-group-title', 'النطاق'));
      var scopeList = el('div', 'tadreeb-export-list');
      scopeOptions.forEach(function (sc, i) {
        var label = el('label', 'tadreeb-export-radio');
        var input = document.createElement('input');
        input.type = 'radio';
        input.name = 'tadreeb-export-scope';
        input.value = sc.id;
        input.checked = i === 0;
        input.id = 'tadreeb-export-scope-' + i;
        scopeInputs.push(input);
        label.appendChild(input);
        label.appendChild(document.createTextNode(' ' + sc.label));
        scopeList.appendChild(label);
      });
      body.appendChild(scopeList);
    }

    // النطاق الزمني
    var fromInput = null, toInput = null;
    if (showDateRange) {
      body.appendChild(el('h3', 'tadreeb-export-group-title', 'النطاق الزمني'));
      var rangeWrap = el('div', 'tadreeb-export-range');
      var fromLabel = el('label', 'tadreeb-export-date-label', 'من');
      fromInput = document.createElement('input');
      fromInput.type = 'date';
      fromInput.className = 'tadreeb-export-date';
      fromInput.setAttribute('aria-label', 'من تاريخ');
      fromLabel.appendChild(fromInput);
      var toLabel = el('label', 'tadreeb-export-date-label', 'إلى');
      toInput = document.createElement('input');
      toInput.type = 'date';
      toInput.className = 'tadreeb-export-date';
      toInput.setAttribute('aria-label', 'إلى تاريخ');
      toLabel.appendChild(toInput);
      rangeWrap.appendChild(fromLabel);
      rangeWrap.appendChild(toLabel);
      body.appendChild(rangeWrap);
    }

    dialog.appendChild(body);

    // الأزرار
    var footer = el('div', 'tadreeb-export-footer');
    var confirmBtn = el('button', 'tadreeb-export-btn tadreeb-export-btn-primary', 'تأكيد');
    confirmBtn.setAttribute('type', 'button');
    confirmBtn.addEventListener('click', function () {
      var result = { sections: {}, columns: {}, scope: null, dateFrom: '', dateTo: '' };
      Object.keys(sectionInputs).forEach(function (id) { result.sections[id] = !!sectionInputs[id].checked; });
      Object.keys(columnInputs).forEach(function (id) { result.columns[id] = !!columnInputs[id].checked; });
      scopeInputs.forEach(function (input) { if (input.checked) result.scope = input.value; });
      if (fromInput) result.dateFrom = fromInput.value || '';
      if (toInput) result.dateTo = toInput.value || '';
      closeDialog();
      onConfirm(result);
    });
    var cancelBtn = el('button', 'tadreeb-export-btn tadreeb-export-btn-secondary', 'إلغاء');
    cancelBtn.setAttribute('type', 'button');
    cancelBtn.addEventListener('click', closeCancelled);
    footer.appendChild(confirmBtn);
    footer.appendChild(cancelBtn);
    dialog.appendChild(footer);

    overlay.appendChild(dialog);

    function onBackdropClick(event) {
      if (event.target === overlay) closeCancelled();
    }
    function onKeyDown(event) {
      if (event.key === 'Escape' || event.key === 'Esc') closeCancelled();
    }
    function closeDialog() {
      if (closed) return;
      closed = true;
      overlay.removeEventListener('click', onBackdropClick);
      document.removeEventListener('keydown', onKeyDown);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }
    function closeCancelled() {
      if (closed) return;
      closeDialog();
      onCancel();
    }

    overlay.addEventListener('click', onBackdropClick);
    document.addEventListener('keydown', onKeyDown);
    document.body.appendChild(overlay);
    if (typeof dialog.focus === 'function') dialog.focus();

    return {
      close: closeDialog,
      element: dialog
    };
  }

  /* ---------- 13. التصدير السريع ---------- */
  function quickExport(kind, data) {
    switch (kind) {
      case 'attendance': return exportAttendance(data);
      case 'attendance-report': return exportAttendanceReport(data);
      case 'today': return exportToday(data);
      case 'course': return exportCourseFile(data);
      case 'week': return exportWeekCalendar(data);
      case 'month': return exportMonthCalendar(data);
      case 'day-schedule': return exportDaySchedule(data);
      case 'range-schedule': return exportRangeSchedule(data);
      case 'courses': return exportCoursesList(data);
      case 'courses-stats': return exportCoursesStats(data);
      case 'directory': return exportDirectory(data);
      case 'budget': return exportBudget(data);
      case 'closing': return exportClosingReport(data);
      case 'summary': return exportSummary(data);
      case 'backup': return exportBackup(data);
      case 'halls-stats': return exportHallsStats(data);
      case 'hall-detail': return exportHallDetail(data);
      case 'trainers-stats': return exportTrainersStats(data);
      case 'groups-stats': return exportGroupsStats(data);
      case 'directorates-stats': return exportDirectoratesStats(data);
      case 'periods-stats': return exportPeriodsStats(data);
      case 'levels-stats': return exportLevelsStats(data);
      case 'meetings': return exportMeetings(data);
      case 'users-stats': return exportUsersStats(data);
      case 'expenses-stats': return exportExpensesStats(data);
      case 'attendance-stats': return exportAttendanceStats(data);
      case 'calendar-stats': return exportCalendarStats(data);
      case 'holidays': return exportHolidays(data);
      default: throw new Error('نوع تصدير غير معروف: ' + kind);
    }
  }

  /* ---------- 14. استيراد المتدربين من إكسل (v2.3 — M) ----------
   * العمود A = الاسم، العمود B = رقم الهاتف. الصف الأول يُتخطى إن
   * كان ترويسة (كلمة «الاسم»/«name» في A أو «الهاتف»/«phone» في B)؛
   * عند الشك يُعامل الصف الأول كبيانات ويكشف التحقق الصفوف الرديئة.
   * الصفوف الفارغة تماماً تُتجاهل بصمت. المديرية ليست في الملف —
   * تُترك فارغة دائماً (تُعدَّل لاحقاً من بطاقة المتدرب).
   *
   * قاعدة التكرار: الهاتف المُطبَّع (تُحذف المسافات والواصلات
   * والأقواس والنقاط، وتُحوَّل الأرقام المشرقية إلى لاتينية، ويُبقى
   * + البادئة) يطابق هاتف متدرب محدد حالياً في المجموعة/الدورة
   * المستهدفة، أو هاتفاً قُبل سابقاً في الملف نفسه. لا يُفحص
   * التكرار على مستوى الدليل كاملاً (التطبيق نفسه لا يفرض فرادة
   * الهاتف). صيغتا «099…» و«9639…+» تُعاملان كرقمين مختلفين.
   * قاعدة الهاتف: بعد التطبيع «+؟» + 9–15 رقماً (لا تحقق أشد
   * للهاتف في التطبيق حالياً).
   */
  var IMPORT_HEADER_A = ['الاسم', 'اسم المتدرب', 'المتدرب', 'الاسم الكامل', 'الأسماء',
    'name', 'full name', 'trainee', 'trainee name'];
  var IMPORT_HEADER_B = ['رقم الهاتف', 'الهاتف', 'الجوال', 'رقم الجوال',
    'phone', 'mobile', 'telephone', 'phone number'];

  var IMPORT_SKIP_REASONS = {
    'duplicate': 'مكرر — رقم الهاتف موجود مسبقاً',
    'missing-name': 'الاسم مفقود',
    'missing-phone': 'رقم الهاتف مفقود',
    'invalid-phone': 'رقم الهاتف غير صالح'
  };

  // تطبيع رقم هاتف للمقارنة والتحقق والحفظ.
  function normalizeImportPhone(raw) {
    var s = String(raw == null ? '' : raw).trim();
    s = s.replace(/[٠-٩]/g, function (d) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)); });
    return s.replace(/[\s\-().]/g, '');
  }

  function isValidImportPhone(phone) {
    return /^\+?[0-9]{9,15}$/.test(phone || '');
  }

  function isImportHeaderRow(a, b) {
    var la = String(a || '').trim().toLowerCase();
    var lb = String(b || '').trim().toLowerCase();
    return IMPORT_HEADER_A.indexOf(la) !== -1 || IMPORT_HEADER_B.indexOf(lb) !== -1;
  }

  // نص خلية (الأرقام تُحوَّل نصاً — الهاتف قد يُخزَّن رقماً في إكسل).
  function importCellText(ws, r, c) {
    var v = ws.getRow(r).getCell(c).value;
    if (v == null) return '';
    if (typeof v === 'object') {
      if (v.text != null) return String(v.text).trim();
      if (v.result != null) return String(v.result).trim();
      return '';
    }
    return String(v).trim();
  }

  // تحليل مصنّف محمّل (الورقة الأولى فقط):
  // {added: [{row, name, phone}], skipped: [{row, name, phone, reason}],
  //  headerSkipped: bool} — row رقم الصف في ملف إكسل (يبدأ من 1).
  // existingPhones: هواتف (خام) المتدربين المحددين حالياً في
  // المجموعة/الدورة المستهدفة.
  function parseTraineeWorkbook(wb, existingPhones) {
    var ws = wb && wb.worksheets && wb.worksheets[0];
    var added = [], skipped = [];
    var seen = {};
    (Array.isArray(existingPhones) ? existingPhones : []).forEach(function (p) {
      var n = normalizeImportPhone(p);
      if (n) seen[n] = true;
    });
    if (!ws) return { added: added, skipped: skipped, headerSkipped: false };
    var firstRow = 1;
    var headerSkipped = isImportHeaderRow(importCellText(ws, 1, 1), importCellText(ws, 1, 2));
    if (headerSkipped) firstRow = 2;
    for (var r = firstRow; r <= ws.rowCount; r++) {
      var name = importCellText(ws, r, 1);
      var phoneRaw = importCellText(ws, r, 2);
      if (!name && !phoneRaw) continue; // صف فارغ تماماً — يُتجاهل بصمت
      if (!name) { skipped.push({ row: r, name: '', phone: phoneRaw, reason: 'missing-name' }); continue; }
      if (!phoneRaw) { skipped.push({ row: r, name: name, phone: '', reason: 'missing-phone' }); continue; }
      var phone = normalizeImportPhone(phoneRaw);
      if (!isValidImportPhone(phone)) {
        skipped.push({ row: r, name: name, phone: phoneRaw, reason: 'invalid-phone' });
        continue;
      }
      if (seen[phone]) {
        skipped.push({ row: r, name: name, phone: phoneRaw, reason: 'duplicate' });
        continue;
      }
      seen[phone] = true;
      added.push({ row: r, name: name, phone: phone });
    }
    return { added: added, skipped: skipped, headerSkipped: headerSkipped };
  }

  // قراءة مصنّف من ArrayBuffer/Buffer (المتصفح وNode).
  function importTraineesFromBuffer(buffer, existingPhones) {
    try {
      var E = getExcelJS();
      var wb = new E.Workbook();
      return wb.xlsx.load(buffer).then(function () {
        return parseTraineeWorkbook(wb, existingPhones);
      });
    } catch (err) {
      return Promise.reject(err);
    }
  }

  // قراءة ملف ‎.xlsx من حقل إدخال ملفات (FileReader → ArrayBuffer).
  function importTraineesFromFile(file, existingPhones) {
    if (typeof FileReader === 'undefined') {
      return Promise.reject(new Error('متصفحك لا يدعم قراءة الملفات'));
    }
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        importTraineesFromBuffer(reader.result, existingPhones).then(resolve, reject);
      };
      reader.onerror = function () {
        reject(new Error('تعذّرت قراءة الملف'));
      };
      reader.readAsArrayBuffer(file);
    });
  }

  /* ---------- 15. استيراد المديريات من إكسل (v2.3 — N) ----------
   * العمود A = اسم المديرية (عمود واحد فقط). الصف الأول يُتخطى إن
   * كان ترويسة (كلمة «المديرية»/«directorate» في A)؛ عند الشك
   * يُعامل الصف الأول كبيانات. الصفوف الفارغة تماماً تُتجاهل بصمت.
   * قاعدة التكرار: الاسم المُطبَّع (تقليم + أحرف لاتينية بلا تمييز
   * حالة) يطابق مديرية محفوظة أو اسماً قُبل سابقاً في الملف نفسه.
   */
  var IMPORT_DIRECTORATE_HEADERS = ['المديرية', 'اسم المديرية', 'المديريات',
    'directorate', 'directorate name', 'directorates'];

  var IMPORT_DIRECTORATE_SKIP_REASONS = {
    'duplicate': 'مكررة — المديرية موجودة مسبقاً',
    'missing-name': 'الاسم مفقود'
  };

  // تطبيع اسم مديرية للمقارنة (تقليم + حالة لاتينية صغرى).
  function normalizeDirectorateName(raw) {
    return String(raw == null ? '' : raw).trim().toLowerCase();
  }

  function isDirectorateHeaderRow(a) {
    return IMPORT_DIRECTORATE_HEADERS.indexOf(normalizeDirectorateName(a)) !== -1;
  }

  // تحليل مصنّف محمّل (الورقة الأولى فقط):
  // {added: [{row, name}], skipped: [{row, name, reason}],
  //  headerSkipped: bool} — row رقم الصف في ملف إكسل (يبدأ من 1).
  // existingNames: أسماء المديريات المحفوظة حالياً.
  function parseDirectorateWorkbook(wb, existingNames) {
    var ws = wb && wb.worksheets && wb.worksheets[0];
    var added = [], skipped = [];
    var seen = {};
    (Array.isArray(existingNames) ? existingNames : []).forEach(function (n) {
      var norm = normalizeDirectorateName(n);
      if (norm) seen[norm] = true;
    });
    if (!ws) return { added: added, skipped: skipped, headerSkipped: false };
    var firstRow = 1;
    var headerSkipped = isDirectorateHeaderRow(importCellText(ws, 1, 1));
    if (headerSkipped) firstRow = 2;
    for (var r = firstRow; r <= ws.rowCount; r++) {
      var name = importCellText(ws, r, 1);
      if (!name) continue; // صف فارغ — يُتجاهل بصمت
      var norm = normalizeDirectorateName(name);
      if (seen[norm]) {
        skipped.push({ row: r, name: name, reason: 'duplicate' });
        continue;
      }
      seen[norm] = true;
      added.push({ row: r, name: name });
    }
    return { added: added, skipped: skipped, headerSkipped: headerSkipped };
  }

  // قراءة مصنّف من ArrayBuffer/Buffer (المتصفح وNode).
  function importDirectoratesFromBuffer(buffer, existingNames) {
    try {
      var E = getExcelJS();
      var wb = new E.Workbook();
      return wb.xlsx.load(buffer).then(function () {
        return parseDirectorateWorkbook(wb, existingNames);
      });
    } catch (err) {
      return Promise.reject(err);
    }
  }

  // قراءة ملف ‎.xlsx من حقل إدخال ملفات (FileReader → ArrayBuffer).
  function importDirectoratesFromFile(file, existingNames) {
    if (typeof FileReader === 'undefined') {
      return Promise.reject(new Error('متصفحك لا يدعم قراءة الملفات'));
    }
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        importDirectoratesFromBuffer(reader.result, existingNames).then(resolve, reject);
      };
      reader.onerror = function () {
        reject(new Error('تعذّرت قراءة الملف'));
      };
      reader.readAsArrayBuffer(file);
    });
  }

  /* ---------- الواجهة العامة ---------- */
  var api = {
    exportAttendance: exportAttendance,
    exportAttendanceReport: exportAttendanceReport,
    exportToday: exportToday,
    exportCourseFile: exportCourseFile,
    exportWeekCalendar: exportWeekCalendar,
    exportMonthCalendar: exportMonthCalendar,
    exportDaySchedule: exportDaySchedule,
    exportRangeSchedule: exportRangeSchedule,
    exportCoursesList: exportCoursesList,
    exportCoursesStats: exportCoursesStats,
    exportDirectory: exportDirectory,
    exportBudget: exportBudget,
    exportClosingReport: exportClosingReport,
    exportSummary: exportSummary,
    exportBackup: exportBackup,
    exportHallsStats: exportHallsStats,
    exportHallDetail: exportHallDetail,
    exportTrainersStats: exportTrainersStats,
    exportGroupsStats: exportGroupsStats,
    exportDirectoratesStats: exportDirectoratesStats,
    exportPeriodsStats: exportPeriodsStats,
    exportLevelsStats: exportLevelsStats,
    exportMeetings: exportMeetings,
    exportUsersStats: exportUsersStats,
    exportExpensesStats: exportExpensesStats,
    exportAttendanceStats: exportAttendanceStats,
    exportCalendarStats: exportCalendarStats,
    exportHolidays: exportHolidays,
    openExportPicker: openExportPicker,
    quickExport: quickExport,
    importTraineesFromFile: importTraineesFromFile,
    importTraineesFromBuffer: importTraineesFromBuffer,
    parseTraineeWorkbook: parseTraineeWorkbook,
    IMPORT_SKIP_REASONS: IMPORT_SKIP_REASONS,
    importDirectoratesFromFile: importDirectoratesFromFile,
    importDirectoratesFromBuffer: importDirectoratesFromBuffer,
    parseDirectorateWorkbook: parseDirectorateWorkbook,
    IMPORT_DIRECTORATE_SKIP_REASONS: IMPORT_DIRECTORATE_SKIP_REASONS,
    // أدوات داخلية مكشوفة للاختبار فقط
    _sanitizeFilename: sanitizeFilename,
    _asDateText: asDateText,
    _normalizeImportPhone: normalizeImportPhone,
    _isValidImportPhone: isValidImportPhone,
    _isImportHeaderRow: isImportHeaderRow,
    _normalizeDirectorateName: normalizeDirectorateName,
    _lastWrite: null,
    _setSink: function (fn) { bufferSink = fn; }
  };

  if (typeof window !== 'undefined') {
    window.TadreebExport = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
