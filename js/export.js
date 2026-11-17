/* تدريب — محرّك تصدير إكسل
 * وحدة نقية: تأخذ بيانات جافاسكربت عادية وتُنتج ملفات .xlsx
 * تعتمد على المكتبة العالمية ExcelJS (4.4.0) المحمّلة قبل هذا الملف.
 * لا تعتمد على Firebase ولا على أي وحدة أخرى في التطبيق.
 * جميع العناوين والتسميات بالعربية الفصحى. أسماء الملفات ASCII آمنة.
 *
 * التنسيق الاحترافي (كل ورقة في كل مصنّف):
 * الصف 1: عنوان — عريض 14 نقطة بلون كحلي. الصف 2: سطر الإنشاء.
 * الصف 3: صف العناوين — تعبئة كحلية، نص أبيض عريض، في المنتصف.
 * البيانات من الصف 4. تجميد أسفل صف العناوين، حدود رفيعة،
 * أرقام بفواصل الآلاف، اتجاه RTL، إعداد طباعة جاهز.
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

  // التاريخ والوقت الآن بصيغة YYYY-MM-DD HH:MM
  function nowString() {
    var d = new Date();
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    return todayString() + ' ' + hh + ':' + mm;
  }

  // تطبيع تاريخ إلى نص YYYY-MM-DD (نص صريح لتفادي أرقام إكسل التسلسلية)
  function asDateText(v) {
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

  // تطبيع طابع زمني إلى نص YYYY-MM-DD HH:MM
  function asDateTimeText(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date) {
      return asDateText(v) + ' ' +
        String(v.getHours()).padStart(2, '0') + ':' + String(v.getMinutes()).padStart(2, '0');
    }
    var s = String(v).trim();
    var m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
    if (m) return m[1] + ' ' + m[2];
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
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

  // رقم بفواصل الآلاف لتضمينه داخل نص
  function fmtNumber(v) {
    return asNumber(v).toLocaleString('en-US');
  }

  // المبرر: حقل justification إن وُجد، وإلا الملاحظة عند الاعتذار (توافق مع الشكل القديم)
  function justificationOf(r) {
    if (!r) return '';
    if (r.justification != null && r.justification !== '') return asText(r.justification);
    if (r.status === 'معتذر') return asText(r.note);
    return '';
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
      return 'أجرة ثابتة للدورة كاملة: ' + fmtNumber(contract.amount) + ' ل.س';
    }
    if (contract.type === 'hourly') {
      return 'أجر بالساعة: ' + fmtNumber(contract.rate) + ' ل.س — إجمالي الساعات: ' +
        asNumber(contract.hours) + ' — الإجمالي المستحق: ' +
        fmtNumber(asNumber(contract.rate) * asNumber(contract.hours)) + ' ل.س';
    }
    return '';
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

  // إنشاء ورقة مع كتلة العنوان: الصف 1 عنوان، الصف 2 سطر الإنشاء (+ نطاق)
  function createSheet(wb, name, title, subtitle, colCount) {
    var ws = wb.addWorksheet(name);
    var gen = 'تاريخ الإنشاء: ' + nowString();
    if (subtitle) gen += ' — ' + subtitle;
    if (colCount > 1) ws.mergeCells(1, 1, 1, colCount);
    var titleCell = ws.getCell(1, 1);
    titleCell.value = title;
    titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: NAVY } };
    titleCell.alignment = { horizontal: 'right', vertical: 'middle' };
    ws.getRow(1).height = 24;
    if (colCount > 1) ws.mergeCells(2, 1, 2, colCount);
    var genCell = ws.getCell(2, 1);
    genCell.value = gen;
    genCell.font = { name: 'Calibri', size: 10, color: { argb: GREY } };
    genCell.alignment = { horizontal: 'right', vertical: 'middle' };
    ws.getRow(2).height = 18;
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
  function writeDataRow(ws, rowNum, values) {
    var row = ws.getRow(rowNum);
    values.forEach(function (v, i) {
      var cell = row.getCell(i + 1);
      cell.value = v == null ? '' : v;
      cell.border = thinBorder();
      cell.alignment = { vertical: 'middle', wrapText: true };
      if (typeof v === 'number') cell.numFmt = NUM_FMT;
    });
  }

  // ملاءمة عرض الأعمدة من أطول محتوى (الصفوف من 3 فصاعداً؛ حد أدنى 12، حد أقصى 42)
  function fitWidths(ws, colCount) {
    for (var c = 1; c <= colCount; c++) {
      var maxLen = 0;
      for (var r = 3; r <= ws.rowCount; r++) {
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
    ws.views = [{ state: 'frozen', ySplit: 3, rightToLeft: true }];
    ws.pageSetup = {
      orientation: colCount > 5 ? 'landscape' : 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9
    };
    ws.printTitleRows = '1:3';
  }

  // ورقة جدول كاملة دفعة واحدة (عنوان + إنشاء + عناوين + بيانات)
  function addTableSheet(wb, name, title, subtitle, headers, rows) {
    var ws = createSheet(wb, name, title, subtitle, headers.length);
    writeHeaderRow(ws, 3, headers);
    rows.forEach(function (values, i) { writeDataRow(ws, 4 + i, values); });
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

  // كتابة غير متزامنة (ExcelJS)؛ تُعيد اسم الملف فوراً كما قبل
  function writeWorkbook(wb, filename) {
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
    var rows = Array.isArray(opts.rows) ? opts.rows : [];
    var wb = newWorkbook();

    var present = 0, absent = 0, excused = 0;
    rows.forEach(function (r) {
      if (r.status === 'موجود') present++;
      else if (r.status === 'غائب') absent++;
      else if (r.status === 'معتذر') excused++;
    });

    var scope = 'الدورة: ' + asText(opts.courseName);
    if (opts.sessionDate) scope += ' — التاريخ: ' + asDateText(opts.sessionDate);
    if (opts.periodLabel) scope += ' — الفترة: ' + asText(opts.periodLabel);
    if (opts.hallName) scope += ' — القاعة: ' + asText(opts.hallName);
    if (opts.trainerName) scope += ' — المدرب: ' + asText(opts.trainerName);

    var headers = ['الرقم', 'الاسم', 'المديرية', 'الحالة', 'المبرر', 'تاريخ الجلسة', 'الفترة', 'القاعة', 'المدرب', 'الملاحظة'];
    var ws = createSheet(wb, 'الحضور', 'سجل الحضور والغياب', scope, headers.length);
    writeHeaderRow(ws, 3, headers);
    rows.forEach(function (r, i) {
      writeDataRow(ws, 4 + i, [
        i + 1,
        asText(r.name),
        asText(r.directorate),
        asText(r.status),
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
    var next = 4 + rows.length + 1;
    writeHeaderRow(ws, next, ['الملخص', 'العدد']);
    writeDataRow(ws, next + 1, ['إجمالي المتدربين', rows.length]);
    writeDataRow(ws, next + 2, ['موجود', present]);
    writeDataRow(ws, next + 3, ['غائب', absent]);
    writeDataRow(ws, next + 4, ['معتذر', excused]);

    finishSheet(ws, headers.length);
    var filename = 'tadreeb-attendance-' + sanitizeFilename(opts.courseName) +
      '-' + (asDateText(opts.sessionDate) || todayString()) + '.xlsx';
    return writeWorkbook(wb, filename);
  }

  /* ---------- 2. تصدير أوقات اليوم ---------- */
  function exportToday(opts) {
    opts = opts || {};
    var sessions = Array.isArray(opts.sessions) ? opts.sessions : [];
    var wb = newWorkbook();

    var rows = sessions.map(function (s) {
      return [asText(s.period), asText(s.time), asText(s.course), asText(s.hall), asText(s.trainer)];
    });
    addTableSheet(wb, 'أوقات اليوم', 'أوقات اليوم',
      'التاريخ: ' + (asDateText(opts.date) || todayString()),
      ['الفترة', 'الوقت', 'الدورة', 'القاعة', 'المدرب'], rows);
    var filename = 'tadreeb-today-' + (asDateText(opts.date) || todayString()) + '.xlsx';
    return writeWorkbook(wb, filename);
  }

  /* ---------- 3. تصدير ملف الدورة ---------- */

  function addCourseInfoSheet(wb, data) {
    var info = data.info || {};
    var directorates = Array.isArray(info.directorates) ? info.directorates.join('، ') : asText(info.directorates);
    var rows = [
      ['اسم الدورة', asText(info.name)],
      ['المدرب', asText(info.trainer)],
      ['عقد المدرب', trainerFeeText(info.trainerContract)],
      ['الأيام', asText(info.days)],
      ['الفترة التدريبية', asText(info.period)],
      ['عدد الجلسات', info.sessionCount != null ? asNumber(info.sessionCount) : ''],
      ['الميزانية (ل.س)', info.budget != null ? asNumber(info.budget) : ''],
      ['الحالة', asText(info.status)],
      ['المديريات', directorates]
    ];
    addTableSheet(wb, 'المعلومات', 'ملف الدورة', asText(info.name), ['البند', 'التفاصيل'], rows);
  }

  function addCourseScheduleSheet(wb, data) {
    var schedule = Array.isArray(data.schedule) ? data.schedule : [];
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
    addTableSheet(wb, 'الجدول', 'جدول الجلسات', asText((data.info || {}).name),
      ['الرقم', 'التاريخ', 'اليوم', 'الفترة', 'القاعة', 'المدرب', 'الحالة', 'الملاحظة'], rows);
  }

  function addCourseTraineesSheet(wb, data) {
    var trainees = Array.isArray(data.trainees) ? data.trainees : [];
    var rows = trainees.map(function (t, i) {
      return [i + 1, asText(t.name), asText(t.directorate), asText(t.phone), asText(t.status), asText(t.notes || t.note)];
    });
    addTableSheet(wb, 'المتدربون', 'المتدربون', asText((data.info || {}).name),
      ['الرقم', 'الاسم', 'المديرية', 'رقم الهاتف', 'الحالة', 'الملاحظات'], rows);
  }

  function addCourseAttendanceSheet(wb, data) {
    var attendance = Array.isArray(data.attendance) ? data.attendance : [];
    var rows = attendance.map(function (a) {
      return [
        asDateText(a.sessionDate),
        asText(a.traineeName),
        asText(a.status),
        justificationOf(a),
        a.status === 'معتذر' ? '' : asText(a.note)
      ];
    });
    addTableSheet(wb, 'الحضور', 'سجل الحضور', asText((data.info || {}).name),
      ['التاريخ', 'اسم المتدرب', 'الحالة', 'المبرر', 'الملاحظة'], rows);
  }

  // ورقة الميزانية (مشتركة بين ملف الدورة وتصدير الميزانية):
  // ملخص + أجور المدربين المستحقة (محسوبة) مقابل المسجلة + الفئات + المصاريف (إن وُجدت)
  function addBudgetSheet(wb, name, title, subtitle, budget, contract, expenses) {
    budget = budget || {};
    var byCategory = budget.byCategory || {};
    var feeDue = budget.trainerFeeDue != null ? asNumber(budget.trainerFeeDue) : trainerFeeDue(contract);
    var recordedFee = byCategory['أجور المدربين'] != null ? asNumber(byCategory['أجور المدربين']) : null;
    var colCount = expenses ? 4 : 2;
    var ws = createSheet(wb, name, title, subtitle, colCount);
    var r = 3;
    writeHeaderRow(ws, r, ['البند', 'المبلغ (ل.س)']);
    r++;
    var summary = [
      ['الميزانية المخصصة', asNumber(budget.allocated)],
      ['إجمالي المصاريف', asNumber(budget.totalSpent)],
      ['المتبقي', asNumber(budget.remaining)]
    ];
    if (feeDue != null) summary.push(['أجور المدربين المستحقة (محسوبة)', feeDue]);
    if (feeDue != null && recordedFee != null) summary.push(['أجور المدربين المسجلة كمصروف', recordedFee]);
    summary.forEach(function (row) { writeDataRow(ws, r, row); r++; });
    r++; // صف فارغ
    writeHeaderRow(ws, r, ['الفئة', 'المصروف (ل.س)']);
    r++;
    Object.keys(byCategory).forEach(function (cat) {
      writeDataRow(ws, r, [cat, asNumber(byCategory[cat])]); r++;
    });
    if (expenses) {
      r++; // صف فارغ
      writeHeaderRow(ws, r, ['التاريخ', 'الفئة', 'البيان', 'المبلغ (ل.س)']);
      r++;
      expenses.forEach(function (e) {
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
      addBudgetSheet(wb, 'الميزانية', 'ميزانية الدورة', asText((data.info || {}).name),
        budget, (data.info || {}).trainerContract, Array.isArray(budget.expenses) ? budget.expenses : []);
    }
    return wb;
  }

  function exportCourseFile(data, options) {
    data = data || {};
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
    var periods = Array.isArray(opts.periods) ? opts.periods : [];
    var days = Array.isArray(opts.days) ? opts.days : [];
    var cells = opts.cells || {};
    var wb = newWorkbook();

    var header = ['الفترة'];
    days.forEach(function (d) { header.push(asText(d.label) + (d.date ? ' — ' + asDateText(d.date) : '')); });
    var ws = createSheet(wb, 'كالندر الأسبوع', 'كالندر الأسبوع', asText(opts.weekLabel), header.length);
    writeHeaderRow(ws, 3, header);
    periods.forEach(function (p, pi) {
      var row = [asText(p.label) + (p.time ? ' (' + asText(p.time) + ')' : '')];
      days.forEach(function (d, di) {
        row.push(formatWeekCell(cells[pi + '|' + di]));
      });
      writeDataRow(ws, 4 + pi, row);
    });
    finishSheet(ws, header.length);

    var startDate = (days[0] && days[0].date) ? asDateText(days[0].date) : todayString();
    var filename = 'tadreeb-week-' + startDate + '.xlsx';
    return writeWorkbook(wb, filename);
  }

  /* ---------- 5. كالندر الشهر ---------- */
  function exportMonthCalendar(opts) {
    opts = opts || {};
    var weeks = Array.isArray(opts.weeks) ? opts.weeks : [];
    var wb = newWorkbook();

    var ws = createSheet(wb, 'كالندر الشهر', 'كالندر الشهر', asText(opts.monthLabel), 7);
    writeHeaderRow(ws, 3, ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة']);
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
      writeDataRow(ws, 4 + wi, row);
    });
    finishSheet(ws, 7);

    var yyyymm = '';
    outer:
    for (var w = 0; w < weeks.length; w++) {
      for (var d = 0; d < 7; d++) {
        var c = weeks[w] && weeks[w][d];
        if (c && c.date) { yyyymm = asDateText(c.date).slice(0, 7); break outer; }
      }
    }
    if (!yyyymm) yyyymm = todayString().slice(0, 7);
    var filename = 'tadreeb-month-' + yyyymm + '.xlsx';
    return writeWorkbook(wb, filename);
  }

  /* ---------- 6. قائمة الدورات ---------- */
  function exportCoursesList(rows) {
    rows = Array.isArray(rows) ? rows : [];
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
    addTableSheet(wb, 'الدورات', 'قائمة الدورات', '',
      ['اسم الدورة', 'المدرب', 'الأيام', 'الفترة', 'عدد الجلسات', 'المنجزة', 'نسبة الإنجاز %',
       'الحالة', 'عدد المتدربين', 'الميزانية (ل.س)', 'المصروف (ل.س)', 'المتبقي (ل.س)'], dataRows);
    var filename = 'tadreeb-courses-' + todayString() + '.xlsx';
    return writeWorkbook(wb, filename);
  }

  /* ---------- 7. الدليل ---------- */
  function exportDirectory(opts) {
    opts = opts || {};
    var wb = newWorkbook();
    var added = 0;

    var trainers = Array.isArray(opts.trainers) ? opts.trainers : [];
    if (trainers.length) {
      addTableSheet(wb, 'المدربون', 'المدربون', '', ['الاسم', 'التخصص', 'رقم الهاتف', 'الملاحظة'],
        trainers.map(function (t) {
          return [asText(t.name), asText(t.specialty), asText(t.phone), asText(t.note)];
        }));
      added++;
    }

    var halls = Array.isArray(opts.halls) ? opts.halls : [];
    if (halls.length) {
      addTableSheet(wb, 'القاعات', 'القاعات', '', ['اسم القاعة', 'السعة', 'الموقع', 'الملاحظة'],
        halls.map(function (h) {
          return [asText(h.name), h.capacity != null ? asNumber(h.capacity) : '', asText(h.location), asText(h.note)];
        }));
      added++;
    }

    var directorates = Array.isArray(opts.directorates) ? opts.directorates : [];
    if (directorates.length) {
      addTableSheet(wb, 'المديريات', 'المديريات', '', ['اسم المديرية', 'الملاحظة'],
        directorates.map(function (d) {
          if (typeof d === 'string') return [d, ''];
          return [asText(d.name), asText(d.note)];
        }));
      added++;
    }

    var trainees = Array.isArray(opts.trainees) ? opts.trainees : [];
    if (trainees.length) {
      addTableSheet(wb, 'المتدربون', 'المتدربون', '',
        ['الاسم', 'المديرية', 'رقم الهاتف', 'الحالة', 'الملاحظات'],
        trainees.map(function (t) {
          return [asText(t.name), asText(t.directorate), asText(t.phone), asText(t.status), asText(t.notes || t.note)];
        }));
      added++;
    }

    if (added === 0) {
      var ws = createSheet(wb, 'الدليل', 'الدليل', '', 1);
      writeDataRow(ws, 3, ['لا توجد بيانات في الدليل']);
      finishSheet(ws, 1);
    }

    var filename = 'tadreeb-directory-' + todayString() + '.xlsx';
    return writeWorkbook(wb, filename);
  }

  /* ---------- 8. الميزانية ---------- */
  function exportBudget(opts) {
    opts = opts || {};
    var wb = newWorkbook();
    addBudgetSheet(wb, 'ملخص الميزانية', 'ملخص الميزانية', asText(opts.courseName),
      opts, opts.trainerContract, null);
    var expenses = Array.isArray(opts.expenses) ? opts.expenses : [];
    addTableSheet(wb, 'تفاصيل المصاريف', 'تفاصيل المصاريف', asText(opts.courseName),
      ['التاريخ', 'الفئة', 'البيان', 'التفاصيل', 'المبلغ (ل.س)'],
      expenses.map(function (e) {
        return [asDateText(e.date), asText(e.category), asText(e.description), asText(e.details), asNumber(e.amount)];
      }));
    var filename = 'tadreeb-budget-' + sanitizeFilename(opts.courseName) + '-' + todayString() + '.xlsx';
    return writeWorkbook(wb, filename);
  }

  /* ---------- 9. التقرير الختامي ---------- */
  function exportClosingReport(courseFileData) {
    courseFileData = courseFileData || {};
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
    var presentCount = 0, absentCount = 0, excusedCount = 0;
    attendance.forEach(function (a) {
      if (a.status === 'موجود') presentCount++;
      else if (a.status === 'غائب') absentCount++;
      else if (a.status === 'معتذر') excusedCount++;
    });
    var passedCount = 0;
    trainees.forEach(function (t) {
      if (t.status === 'ناجح في الدورة') passedCount++;
    });
    var totalAttendance = presentCount + absentCount + excusedCount;
    var attendanceRate = totalAttendance ? Math.round((presentCount / totalAttendance) * 100) : 0;

    var ws = createSheet(wb, 'ملخص ختامي', 'الملخص الختامي', asText(info.name), 2);
    writeHeaderRow(ws, 3, ['البند', 'القيمة']);
    var rows = [
      ['اسم الدورة', asText(info.name)],
      ['المدرب', asText(info.trainer)],
      ['الحالة', asText(info.status)],
      ['إجمالي الجلسات', schedule.length],
      ['الجلسات المنجزة', doneSessions],
      ['الجلسات الملغاة', cancelledSessions],
      ['عدد المتدربين', trainees.length],
      ['الناجحون في الدورة', passedCount],
      ['إجمالي سجلات الحضور', totalAttendance],
      ['موجود', presentCount],
      ['غائب', absentCount],
      ['معتذر', excusedCount],
      ['نسبة الحضور %', attendanceRate]
    ];
    rows.forEach(function (row, i) { writeDataRow(ws, 4 + i, row); });
    var next = 4 + rows.length + 1;
    writeHeaderRow(ws, next, ['النتيجة الكاملة للميزانية', 'المبلغ (ل.س)']);
    writeDataRow(ws, next + 1, ['الميزانية المخصصة', asNumber(budget.allocated)]);
    writeDataRow(ws, next + 2, ['إجمالي المصاريف', asNumber(budget.totalSpent)]);
    writeDataRow(ws, next + 3, ['المتبقي', asNumber(budget.remaining)]);
    finishSheet(ws, 2);

    var filename = 'tadreeb-closing-' + sanitizeFilename(info.name) + '-' + todayString() + '.xlsx';
    return writeWorkbook(wb, filename);
  }

  /* ---------- 10. التقرير الملخّص ---------- */
  function exportSummary(data) {
    data = data || {};
    var totals = data.totals || {};
    var wb = newWorkbook();

    // ملخص عام: الأرقام الرئيسة
    var remaining = (totals.totalBudget != null && totals.totalSpent != null)
      ? asNumber(totals.totalBudget) - asNumber(totals.totalSpent) : '';
    addTableSheet(wb, 'ملخص عام', 'ملخص عام', '', ['المؤشر', 'القيمة'], [
      ['عدد الدورات', totals.courses != null ? asNumber(totals.courses) : ''],
      ['الدورات النشطة', totals.activeCourses != null ? asNumber(totals.activeCourses) : ''],
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

    // الدورات: صف لكل دورة
    var courses = Array.isArray(data.courses) ? data.courses : [];
    addTableSheet(wb, 'الدورات', 'الدورات', '',
      ['اسم الدورة', 'المدرب', 'نسبة التقدم %', 'المنجزة', 'إجمالي الجلسات',
       'الميزانية (ل.س)', 'المصروف (ل.س)', 'المتبقي (ل.س)', 'الحالة'],
      courses.map(function (c) {
        var rem = c.remaining != null ? asNumber(c.remaining)
          : (c.budget != null && c.spent != null ? asNumber(c.budget) - asNumber(c.spent) : '');
        return [
          asText(c.name),
          asText(c.trainer),
          c.progress != null ? asNumber(c.progress) : '',
          c.done != null ? asNumber(c.done) : '',
          c.total != null ? asNumber(c.total) : '',
          c.budget != null ? asNumber(c.budget) : '',
          c.spent != null ? asNumber(c.spent) : '',
          rem,
          asText(c.status)
        ];
      }));

    // الحضور: أعداد الأسبوع
    var aw = data.attendanceWeek || {};
    var total = aw.total != null ? asNumber(aw.total)
      : asNumber(aw.present) + asNumber(aw.absent) + asNumber(aw.excused);
    var rate = total ? Math.round((asNumber(aw.present) / total) * 100) : '';
    addTableSheet(wb, 'الحضور', 'الحضور الأسبوعي', '', ['الحالة', 'العدد'], [
      ['موجود', asNumber(aw.present)],
      ['غائب', asNumber(aw.absent)],
      ['معتذر', asNumber(aw.excused)],
      ['الإجمالي', total],
      ['نسبة الحضور %', rate]
    ]);

    var filename = 'tadreeb-summary-' + todayString() + '.xlsx';
    return writeWorkbook(wb, filename);
  }

  /* ---------- 11. النسخة الاحتياطية الكاملة ---------- */
  function exportBackup(data) {
    data = data || {};
    var wb = newWorkbook();
    var added = 0;

    function maybeAdd(name, title, headers, rows) {
      if (!rows.length) return;
      addTableSheet(wb, name, title, '', headers, rows);
      added++;
    }

    var courses = Array.isArray(data.courses) ? data.courses : [];
    maybeAdd('الدورات', 'الدورات',
      ['الاسم', 'المدرب', 'الأيام', 'الفترة', 'عدد الجلسات', 'الحالة', 'الميزانية (ل.س)', 'الملاحظات'],
      courses.map(function (c) {
        return [
          asText(c.name), asText(c.trainer), asText(c.days), asText(c.period),
          c.sessionCount != null ? asNumber(c.sessionCount) : (c.sessions != null ? asNumber(c.sessions) : ''),
          asText(c.status),
          c.budget != null ? asNumber(c.budget) : '',
          asText(c.notes || c.note)
        ];
      }));

    var sessions = Array.isArray(data.sessions) ? data.sessions : [];
    maybeAdd('الجلسات', 'الجلسات',
      ['الدورة', 'التاريخ', 'اليوم', 'الفترة', 'القاعة', 'المدرب', 'الحالة', 'الملاحظة'],
      sessions.map(function (s) {
        return [
          asText(s.course || s.courseName), asDateText(s.date), asText(s.day), asText(s.period),
          asText(s.hall), asText(s.trainer), asText(s.state || s.status), asText(s.note)
        ];
      }));

    var trainees = Array.isArray(data.trainees) ? data.trainees : [];
    maybeAdd('المتدربون', 'المتدربون',
      ['الاسم', 'المديرية', 'رقم الهاتف', 'الدورة', 'الحالة', 'الملاحظات'],
      trainees.map(function (t) {
        return [
          asText(t.name), asText(t.directorate), asText(t.phone), asText(t.course || t.courseName),
          asText(t.status), asText(t.notes || t.note)
        ];
      }));

    var trainers = Array.isArray(data.trainers) ? data.trainers : [];
    maybeAdd('المدربون', 'المدربون',
      ['الاسم', 'التخصص', 'رقم الهاتف', 'الملاحظة'],
      trainers.map(function (t) {
        return [asText(t.name), asText(t.specialty), asText(t.phone), asText(t.note)];
      }));

    var directorates = Array.isArray(data.directorates) ? data.directorates : [];
    maybeAdd('المديريات', 'المديريات',
      ['اسم المديرية', 'الملاحظة'],
      directorates.map(function (d) {
        if (typeof d === 'string') return [d, ''];
        return [asText(d.name), asText(d.note)];
      }));

    var halls = Array.isArray(data.halls) ? data.halls : [];
    maybeAdd('القاعات', 'القاعات',
      ['اسم القاعة', 'السعة', 'الموقع', 'الملاحظة'],
      halls.map(function (h) {
        return [asText(h.name), h.capacity != null ? asNumber(h.capacity) : '', asText(h.location), asText(h.note)];
      }));

    var periods = Array.isArray(data.periods) ? data.periods : [];
    maybeAdd('الفترات', 'الفترات التدريبية',
      ['اسم الفترة', 'الوقت', 'الملاحظة'],
      periods.map(function (p) {
        return [asText(p.label || p.name), asText(p.time), asText(p.note)];
      }));

    var holidays = Array.isArray(data.holidays) ? data.holidays : [];
    maybeAdd('العطل', 'أيام العطل',
      ['التاريخ', 'المناسبة', 'الملاحظة'],
      holidays.map(function (h) {
        return [asDateText(h.date), asText(h.name || h.label || h.reason), asText(h.note)];
      }));

    var expenses = Array.isArray(data.expenses) ? data.expenses : [];
    maybeAdd('المصاريف', 'المصاريف',
      ['التاريخ', 'الدورة', 'الفئة', 'البيان', 'التفاصيل', 'المبلغ (ل.س)'],
      expenses.map(function (e) {
        return [
          asDateText(e.date), asText(e.course || e.courseName), asText(e.category),
          asText(e.description), asText(e.details), asNumber(e.amount)
        ];
      }));

    // المستخدمون: اسم المستخدم والدور فقط — أبداً كلمات المرور
    var users = Array.isArray(data.users) ? data.users : [];
    maybeAdd('المستخدمون', 'المستخدمون',
      ['اسم المستخدم', 'الدور'],
      users.map(function (u) {
        return [asText(u.username), asText(u.role)];
      }));

    // سجل التدقيق: فقط إذا وُفّر
    if (Array.isArray(data.audit)) {
      addTableSheet(wb, 'سجل التدقيق', 'سجل التدقيق', '',
        ['التاريخ والوقت', 'المستخدم', 'الإجراء', 'التفاصيل'],
        data.audit.map(function (a) {
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
      var ws = createSheet(wb, 'النسخة الاحتياطية', 'النسخة الاحتياطية', '', 1);
      writeDataRow(ws, 3, ['لا توجد بيانات للنسخ الاحتياطي']);
      finishSheet(ws, 1);
    }

    var filename = 'tadreeb-backup-' + todayString() + '.xlsx';
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
      case 'today': return exportToday(data);
      case 'course': return exportCourseFile(data);
      case 'week': return exportWeekCalendar(data);
      case 'month': return exportMonthCalendar(data);
      case 'courses': return exportCoursesList(data);
      case 'directory': return exportDirectory(data);
      case 'budget': return exportBudget(data);
      case 'closing': return exportClosingReport(data);
      case 'summary': return exportSummary(data);
      case 'backup': return exportBackup(data);
      default: throw new Error('نوع تصدير غير معروف: ' + kind);
    }
  }

  /* ---------- الواجهة العامة ---------- */
  var api = {
    exportAttendance: exportAttendance,
    exportToday: exportToday,
    exportCourseFile: exportCourseFile,
    exportWeekCalendar: exportWeekCalendar,
    exportMonthCalendar: exportMonthCalendar,
    exportCoursesList: exportCoursesList,
    exportDirectory: exportDirectory,
    exportBudget: exportBudget,
    exportClosingReport: exportClosingReport,
    exportSummary: exportSummary,
    exportBackup: exportBackup,
    openExportPicker: openExportPicker,
    quickExport: quickExport,
    // أدوات داخلية مكشوفة للاختبار فقط
    _sanitizeFilename: sanitizeFilename,
    _asDateText: asDateText,
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
