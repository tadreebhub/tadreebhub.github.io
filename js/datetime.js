// تدريب — وحدة التاريخ والوقت (توقيت دمشق).
// كل التواريخ والأوقات المعروضة في المنصة تُحسب بتوقيت آسيا/دمشق
// عبر Intl.DateTimeFormat، ولا تُستخدم ساعة الجهاز أبداً لتحديد اليوم
// أو الساعة المعروضة. بلا أي اعتماديات؛ تُحمَّل قبل app.js وتكشف
// window.TadreebTime. كل التنسيقات تفشل بلطف: إن غابت ميزة Intl
// يُستخدم تنسيق يدوي (أسماء شامية، أرقام لاتينية).
(function () {
  'use strict';

  var TZ = 'Asia/Damascus';
  var LOCALE_LONG = 'ar-SY-u-ca-gregory-nu-latn';

  // أسماء شامية (احتياطي إن لم تتوفر بيانات ar-SY).
  var LEVANT_MONTHS = [
    'كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران',
    'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'
  ];
  var WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function now() { return new Date(); }

  // تطبيع المدخل إلى كائن Date صالح؛ أي مدخل غير صالح يصبح الآن.
  function toDate(date) {
    if (date instanceof Date && !isNaN(date.getTime())) return date;
    if (typeof date === 'number' || typeof date === 'string') {
      var d = new Date(date);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  }

  // فحص لمرة واحدة: هل يعيد Intl فعلاً أسماء الأشهر الشامية؟
  // (بعض المتصفحات تملك ar-SY لكن بأسماء مشرقية أو غربية.)
  var intlLongOk = false;
  try {
    if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
      var probe = new Intl.DateTimeFormat(LOCALE_LONG, {
        timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric'
      });
      if (probe.format(new Date(2026, 10, 17)).indexOf('تشرين الثاني') !== -1) {
        intlLongOk = true;
      }
    }
  } catch (e) { intlLongOk = false; }

  // أجزاء التاريخ بتوقيت دمشق عبر formatToParts؛ احتياطياً أجزاء
  // الجهاز المحلية. weekday رقم: 0 = الأحد … 6 = السبت.
  function damascusParts(date) {
    var d = toDate(date);
    try {
      if (typeof Intl !== 'undefined' && Intl.DateTimeFormat &&
          typeof Intl.DateTimeFormat.prototype.formatToParts === 'function') {
        var fmt = new Intl.DateTimeFormat('en-US', {
          timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hour12: false
        });
        var parts = fmt.formatToParts(d);
        var out = { year: 0, month: 0, day: 0, hour: 0, minute: 0 };
        for (var i = 0; i < parts.length; i++) {
          if (parts[i].type === 'year') out.year = parseInt(parts[i].value, 10);
          else if (parts[i].type === 'month') out.month = parseInt(parts[i].value, 10);
          else if (parts[i].type === 'day') out.day = parseInt(parts[i].value, 10);
          else if (parts[i].type === 'hour') out.hour = parseInt(parts[i].value, 10);
          else if (parts[i].type === 'minute') out.minute = parseInt(parts[i].value, 10);
        }
        // بعض المتصفحات تعيد الساعة «24» عند منتصف الليل مع hour12:false.
        if (out.hour === 24) out.hour = 0;
        if (out.year && out.month && out.day) {
          out.weekday = new Date(Date.UTC(out.year, out.month - 1, out.day)).getUTCDay();
          return out;
        }
      }
    } catch (e) { /* احتياطي أدناه */ }
    return {
      weekday: d.getDay(), day: d.getDate(), month: d.getMonth() + 1,
      year: d.getFullYear(), hour: d.getHours(), minute: d.getMinutes()
    };
  }

  // تاريخ اليوم «YYYY-MM-DD» بتوقيت دمشق (لا بتوقيت الجهاز).
  function todayISO() {
    var p = damascusParts(new Date());
    return p.year + '-' + pad(p.month) + '-' + pad(p.day);
  }

  // «الثلاثاء 17 تشرين الثاني 2026» — أرقام لاتينية، شهر شامي، تقويم ميلادي.
  // ملاحظة: صيغة Intl العربية تُدرج فاصلة بعد اسم اليوم («الثلاثاء، 17 …»)،
  // فنحذفها ليتطابق الخرج مع صيغة المنصة المعتادة (UI.fmtDateFull) ومع
  // المسار الاحتياطي اليدوي أدناه.
  function formatDateLong(date) {
    var d = toDate(date);
    if (intlLongOk) {
      try {
        return new Intl.DateTimeFormat(LOCALE_LONG, {
          timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        }).format(d).replace('،', '');
      } catch (e) { /* احتياطي أدناه */ }
    }
    var p = damascusParts(d);
    return WEEKDAYS[p.weekday] + ' ' + p.day + ' ' + LEVANT_MONTHS[p.month - 1] + ' ' + p.year;
  }

  // تحويل ساعة/دقيقة (بنظام 24 ساعة) إلى صيغة 12 ساعة:
  // «09:00 ص»، «01:00 م»، «12:30 ص» (منتصف الليل)، «12:00 م» (الظهر).
  // أرقام لاتينية، ساعة برقمين (01–12)، وعلامتا ص/م فقط.
  function formatHourMinute12(hour, minute) {
    var h = ((hour % 24) + 24) % 24;
    var suffix = h < 12 ? 'ص' : 'م';
    var h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return pad(h12) + ':' + pad(minute) + ' ' + suffix;
  }

  // «HH:MM» بنظام 12 ساعة بتوقيت دمشق — مثال: «10:57 م».
  // تُحسب الأجزاء بتوقيت دمشق عبر damascusParts (مع احتياطي يدوي
  // عند غياب Intl)، ثم يُحوَّل العرض يدوياً ليطابق الصيغة المطلوبة
  // تماماً (أرقام لاتينية، ص/م) في كل المتصفحات.
  function formatTime(date) {
    var p = damascusParts(toDate(date));
    return formatHourMinute12(p.hour, p.minute);
  }

  // تنسيق وقت «HH:MM» (بنظام 24 ساعة) إلى 12 ساعة:
  // «13:00» ← «01:00 م»، «09:00» ← «09:00 ص»، «00:30» ← «12:30 ص»،
  // «12:00» ← «12:00 م». مدخل غير صالح يُعاد كما هو (بلا تعطّل).
  function formatTime12(hhmm) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
    if (!m) return String(hhmm == null ? '' : hhmm);
    var h = parseInt(m[1], 10);
    var min = parseInt(m[2], 10);
    if (h < 0 || h > 23 || min < 0 || min > 59) return String(hhmm);
    return formatHourMinute12(h, min);
  }

  // نطاق وقتين «HH:MM» بنظام 12 ساعة:
  // «01:00 م - 03:00 م»، «09:00 ص - 11:00 ص».
  // نطاق زمني بنظام 12 ساعة («09:00 ص - 11:00 ص») — ملفوف بعلامتي
  // LRE…PDF لأن النطاق غير المغلّف يُعرض مقلوباً في السياق العربي
  // (مُقاس في Playwright: «11:00 ص - 09:00 ص» بلا العلامتين).
  function formatTimeRange12(start, end) {
    return '\u202A' + formatTime12(start) + ' - ' + formatTime12(end) + '\u202C';
  }

  // «17/11/2026» — يوم/شهر/سنة بتوقيت دمشق.
  function formatDateShort(date) {
    var p = damascusParts(toDate(date));
    return pad(p.day) + '/' + pad(p.month) + '/' + p.year;
  }

  // التاريخ الطويل مع الوقت: «الثلاثاء 17 تشرين الثاني 2026، 09:49 م».
  function formatDateTime(date) {
    return formatDateLong(date) + '، ' + formatTime(date);
  }

  // أجزاء التاريخ والوقت بتوقيت دمشق:
  // {weekday, day, month, year, hour, minute} — كلها أرقام،
  // weekday رقم يوم الأسبوع (0 = الأحد … 6 = السبت).
  function parts(date) {
    var p = damascusParts(toDate(date));
    return {
      weekday: p.weekday, day: p.day, month: p.month,
      year: p.year, hour: p.hour, minute: p.minute
    };
  }

  // ساعة الترويسة الحية: تملأ العنصرين فوراً ثم تحدّثهما كل 20 ثانية.
  // آمنة إن كان أحد العنصرين غائباً (null)؛ تعيد معرّف الفاصل الزمني.
  function startClock(dateEl, clockEl) {
    function tick() {
      var d = new Date();
      try { if (dateEl) dateEl.textContent = formatDateLong(d); } catch (e) {}
      try { if (clockEl) clockEl.textContent = formatTime(d); } catch (e) {}
    }
    tick();
    return setInterval(tick, 20000);
  }

  window.TadreebTime = {
    TZ: TZ,
    now: now,
    todayISO: todayISO,
    formatDateLong: formatDateLong,
    formatTime: formatTime,
    formatTime12: formatTime12,
    formatTimeRange12: formatTimeRange12,
    formatDateShort: formatDateShort,
    formatDateTime: formatDateTime,
    startClock: startClock,
    parts: parts
  };
})();
