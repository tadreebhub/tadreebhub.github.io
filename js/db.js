// تدريب — طبقة البيانات (Firestore).
// يُحمَّل بعد firebase-init.js و js/auth.js. يكشف window.TadreebDB.
// كل الكتابات تتحقق من الدور على العميل (عارض = قراءة فقط) وتُسجَّل
// في سجل التدقيق. قواعد Firestore على الخادم هي الحماية الحقيقية؛
// فحص العميل هنا لتجربة استخدام واضحة فقط.
// ملاحظة: سجل التدقيق لا يسجّل نفسه (لا استدعاء متكرر).
(function () {
  'use strict';

  var COLLECTIONS = {
    META: 'meta',
    USERS: 'users',
    COURSES: 'courses',
    SESSIONS: 'sessions',
    MEETINGS: 'meetings',
    TRAINEES: 'trainees',
    TRAINERS: 'trainers',
    DIRECTORATES: 'directorates',
    GROUPS: 'groups',
    LEVELS: 'levels',
    COURSE_NAMES: 'courseNames',
    HALLS: 'halls',
    PERIODS: 'periods',
    HOLIDAYS: 'holidays',
    EXPENSES: 'expenses',
    BUDGET_CATEGORIES: 'budgetCategories',
    AUDIT: 'audit'
  };

  // حالات المتدرب — متميزة تماماً كما سمّاها بدر:
  // حالة الحضور في الجلسة: present/absent/excused/cancelled
  // (موجود/غائب/معتذر/ملغي) — معتذر مع مبرر في حقل note.
  // (حالة المتدرب على بطاقته أُزيلت في v2.1 — بند 9: الحالة تُسجَّل
  // في تفقد الجلسة فقط.) v2.3: «ملغي» حالة قابلة للاختيار (سجل
  // مُبطل — يُستثنى من مقام نسبة الحضور)؛ «معتذر» إرثي: يُقبل
  // كتابةً للتوافق مع السجلات القديمة لكنه لم يعد خياراً في الواجهة.
  // 'did-not-attend' (لم يحضر) قيمة إرثية محتملة تُعرض فقط ولا تُكتب.
  var ATTENDANCE_STATUSES = ['present', 'absent', 'excused', 'cancelled'];
  var SESSION_STATES = ['scheduled', 'done', 'cancelled', 'trainer-absent', 'holiday'];
  // حالات الاجتماع العارض: مجدول يشغل القاعة، ملغى يحرّرها.
  var MEETING_STATUSES = ['scheduled', 'cancelled'];
  var COURSE_STATUSES = ['active', 'completed', 'cancelled', 'paused'];

  // ---------- أنواع القاعات والدورات (v2.3 — W3؛ v2.3.1: مختلط) ----------
  // القاعة: 'admin' (إدارية) أو 'computer' (حاسوب) في حقل hallType.
  // الدورة: 'admin' (إداري) أو 'technical' (تقني) أو 'mixed' (مختلط)
  // في حقل courseType. المختلط (v2.3.1): جلسات إدارية أولاً ثم
  // تقنية — عدد كل نوع في حقلي adminSessions و techSessions
  // (يجب أن يساوي مجموعهما sessionCount). توافق رجعي: أي سجل بلا
  // حقل نوع (أو بقيمة غير معروفة) يُعامل كإداري في كل مكان — لا
  // يتعطل شيء على البيانات القديمة أبداً.
  var HALL_TYPES = { ADMIN: 'admin', COMPUTER: 'computer' };
  var COURSE_TYPES = { ADMIN: 'admin', TECHNICAL: 'technical', MIXED: 'mixed' };
  var HALL_TYPE_LABELS = { admin: 'إدارية', computer: 'حاسوب' };
  var COURSE_TYPE_LABELS = { admin: 'إداري', technical: 'تقني', mixed: 'مختلط' };

  function hallTypeOf(hall) {
    return (hall && hall.hallType === 'computer') ? 'computer' : 'admin';
  }

  function courseTypeOf(course) {
    if (!course) return 'admin';
    if (course.courseType === 'technical') return 'technical';
    if (course.courseType === 'mixed') return 'mixed';
    return 'admin';
  }

  // نوع القاعة المطابق لنوع دورة: تقني ← حاسوب، إداري ← إدارية.
  // المختلط بلا نوع قاعة واحد (يستخدم النوعين حسب ترتيب الجلسة)
  // فيُعاد null — والمستدعون يعاملون null كـ«كل القاعات».
  function hallTypeForCourseType(courseType) {
    if (courseType === 'technical') return 'computer';
    if (courseType === 'admin') return 'admin';
    return null;
  }

  // عدد الجلسات الإدارية في دورة مختلطة (حقل adminSessions)؛ قيمة
  // غير صالحة أو غائبة ← نصف عدد الجلسات (تقريباً لأعلى) — حتى لا
  // تتعطل دورة مختلطة قديمة بلا تقسيم مخزَّن.
  function mixedAdminCount(course) {
    var total = (course && Number(course.sessionCount)) || 0;
    var n = (course && Number(course.adminSessions));
    if (isFinite(n) && n >= 1 && total > 0 && n < total) return Math.floor(n);
    if (total > 0) return Math.ceil(total / 2);
    return 0;
  }

  // نوع جلسة ما في دورة حسب ترتيبها الزمني (0-based): المختلط —
  // الجلسات الأولى (حتى adminSessions) إدارية، والباقية تقنية؛
  // غير المختلط — نوع الدورة نفسه لكل الجلسات.
  function sessionCourseType(course, index) {
    if (courseTypeOf(course) !== 'mixed') return courseTypeOf(course);
    return (index >= 0 && index < mixedAdminCount(course)) ? 'admin' : 'technical';
  }

  // القاعات المطابقة لنوع دورة: قاعات النوع المطابق فقط (تقنية ←
  // حاسوب، إدارية ← إدارية). قاعدة الرجوع الآمن (موثقة): إن لم توجد
  // قاعة من النوع المطابق أصلاً تُرجع كل القاعات — حتى لا يصل
  // الإسناد التلقائي إلى طريق مسدود. بلا نوع محدد (null) أو نوع
  // مختلط (يستخدم النوعين) تُرجع كل القاعات دون تصفية.
  function matchingHalls(halls, courseType) {
    var list = (halls || []).slice();
    if (courseType == null || courseType === '') return list;
    var want = hallTypeForCourseType(courseType);
    if (want == null) return list;
    var typed = list.filter(function (h) { return hallTypeOf(h) === want; });
    return typed.length ? typed : list;
  }

  // تسميات عربية لسجل التدقيق (القيم الإنكليزية لا تظهر للمستخدم أبداً).
  var SESSION_STATE_LABELS = { scheduled: 'مجدولة', done: 'مكتملة', cancelled: 'ملغاة', 'trainer-absent': 'غياب المدرب', holiday: 'عطلة' };
  var ATTENDANCE_LABELS = { present: 'موجود', absent: 'غائب', excused: 'معتذر', cancelled: 'ملغي', 'did-not-attend': 'لم يحضر' };

  var DEFAULT_PERIODS = [
    { label: 'الفترة الأولى', start: '09:00', end: '11:00', order: 1 },
    { label: 'الفترة الثانية', start: '11:00', end: '13:00', order: 2 },
    { label: 'الفترة الثالثة', start: '13:00', end: '15:00', order: 3 }
  ];
  var DEFAULT_HALLS = [
    { name: 'القاعة الأولى', capacity: null },
    { name: 'القاعة الثانية', capacity: null },
    { name: 'القاعة الثالثة', capacity: null }
  ];
  var DEFAULT_BUDGET_CATEGORIES = [
    'قرطاسية', 'ضيافة', 'أدوات', 'إلكترونيات', 'أجور المدربين'
  ];
  var TRAINER_FEE_CATEGORY = 'أجور المدربين';

  function db() { return window.Tadreeb.getDb(); }
  function serverTs() { return firebase.firestore.FieldValue.serverTimestamp(); }

  function currentProfile() {
    if (window.TadreebAuth && typeof window.TadreebAuth.getCurrentProfile === 'function') {
      return window.TadreebAuth.getCurrentProfile();
    }
    return null;
  }

  function requireWrite() {
    if (!window.TadreebAuth || typeof window.TadreebAuth.canWrite !== 'function') {
      throw new Error('طبقة المصادقة غير محمّلة — لا يمكن الكتابة');
    }
    if (!window.TadreebAuth.canWrite()) {
      throw new Error('ليس لديك صلاحية الكتابة — حسابك للعرض فقط');
    }
  }

  function actorInfo() {
    var profile = currentProfile();
    var user = window.Tadreeb.auth.currentUser;
    return {
      userId: (profile && profile.uid) || (user && user.uid) || null,
      username: (profile && profile.username) || 'غير معروف'
    };
  }

  function describe(data) {
    if (!data) return '';
    return data.name || data.label || data.username || '';
  }

  function toList(snap) {
    var out = [];
    snap.forEach(function (doc) {
      var data = doc.data();
      data.id = doc.id;
      out.push(data);
    });
    return out;
  }

  // --- تواريخ (YYYY-MM-DD بالتوقيت المحلي) ---
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateStr(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function parseDate(s) {
    var parts = String(s).split('-');
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  }
  function todayStr() { return dateStr(new Date()); }

  function hoursBetween(start, end) {
    function mins(t) {
      var p = String(t).split(':');
      return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
    }
    var diff = mins(end) - mins(start);
    return diff > 0 ? diff / 60 : 0;
  }

  // --- سجل التدقيق (لا يرمي استثناءً أبداً، ولا يسجّل نفسه) ---
  function logAudit(action, entity, entityId, details) {
    try {
      var actor = actorInfo();
      return db().collection(COLLECTIONS.AUDIT).add({
        userId: actor.userId,
        username: actor.username,
        action: action,
        entity: entity,
        entityId: entityId || null,
        details: details || '',
        ts: serverTs()
      }).catch(function (err) {
        console.warn('[تدريب] تعذّر تسجيل التدقيق:', err && err.message);
      });
    } catch (err) {
      console.warn('[تدريب] تعذّر تسجيل التدقيق:', err && err.message);
      return Promise.resolve();
    }
  }

  // --- عمليات عامة ---
  function list(col, orderByField) {
    var q = db().collection(col);
    if (orderByField) q = q.orderBy(orderByField);
    return q.get().then(toList);
  }

  function get(col, id) {
    return db().collection(col).doc(id).get().then(function (snap) {
      if (!snap.exists) return null;
      var data = snap.data();
      data.id = snap.id;
      return data;
    });
  }

  function add(col, data) {
    // الاستثناءات: التدقيق يُنشأ عبر logAudit فقط؛ المستخدمون عبر auth.js؛
    // meta/setup عبر runFirstSetup في auth.js.
    if (col === COLLECTIONS.AUDIT) {
      return Promise.reject(new Error('سجل التدقيق يُنشأ عبر logAudit فقط'));
    }
    if (col === COLLECTIONS.USERS) {
      return Promise.reject(new Error('حسابات المستخدمين تُدار عبر TadreebAuth فقط'));
    }
    if (col === COLLECTIONS.META) {
      return Promise.reject(new Error('بيانات الإعداد تُدار عبر TadreebAuth فقط'));
    }
    try { requireWrite(); } catch (e) { return Promise.reject(e); }
    var actor = actorInfo();
    var payload = Object.assign({}, data, {
      createdAt: data.createdAt || serverTs(),
      createdBy: data.createdBy || actor.userId
    });
    return db().collection(col).add(payload).then(function (ref) {
      logAudit('create', col, ref.id, (col === COLLECTIONS.COURSES ? 'إنشاء مجموعة تدريب: ' : 'إنشاء: ') + (describe(data) || ref.id));
      return ref.id;
    });
  }

  function update(col, id, data) {
    if (col === COLLECTIONS.AUDIT) {
      return Promise.reject(new Error('سجل التدقيق لا يُعدَّل أبداً'));
    }
    if (col === COLLECTIONS.USERS) {
      return Promise.reject(new Error('حسابات المستخدمين تُدار عبر TadreebAuth فقط'));
    }
    if (col === COLLECTIONS.META) {
      return Promise.reject(new Error('بيانات الإعداد تُدار عبر TadreebAuth فقط'));
    }
    try { requireWrite(); } catch (e) { return Promise.reject(e); }
    return db().collection(col).doc(id).update(data).then(function () {
      logAudit('update', col, id, (col === COLLECTIONS.COURSES ? 'تعديل مجموعة تدريب: ' : 'تعديل: ') + (describe(data) || id));
    });
  }

  function remove(col, id) {
    if (col === COLLECTIONS.AUDIT) {
      return Promise.reject(new Error('سجل التدقيق لا يُحذف أبداً'));
    }
    if (col === COLLECTIONS.USERS) {
      return Promise.reject(new Error('حسابات المستخدمين تُدار عبر TadreebAuth فقط'));
    }
    if (col === COLLECTIONS.META) {
      return Promise.reject(new Error('بيانات الإعداد تُدار عبر TadreebAuth فقط'));
    }
    try { requireWrite(); } catch (e) { return Promise.reject(e); }
    return db().collection(col).doc(id).delete().then(function () {
      logAudit('delete', col, id, (col === COLLECTIONS.COURSES ? 'حذف مجموعة تدريب: ' : 'حذف: ') + id);
    });
  }

  // --- القيم الافتراضية (آمنة للتكرار — تُستدعى عند كل دخول مدير) ---
  function seedDefaults() {
    try { requireWrite(); } catch (e) { return Promise.reject(e); }
    var jobs = [];

    jobs.push(db().collection(COLLECTIONS.PERIODS).limit(1).get().then(function (snap) {
      if (!snap.empty) return 0;
      var batch = db().batch();
      DEFAULT_PERIODS.forEach(function (p) {
        batch.set(db().collection(COLLECTIONS.PERIODS).doc(), p);
      });
      return batch.commit().then(function () {
        logAudit('seed', COLLECTIONS.PERIODS, null, 'إنشاء الفترات التدريبية الافتراضية');
        return DEFAULT_PERIODS.length;
      });
    }));

    jobs.push(db().collection(COLLECTIONS.HALLS).limit(1).get().then(function (snap) {
      if (!snap.empty) return 0;
      var batch = db().batch();
      DEFAULT_HALLS.forEach(function (h) {
        batch.set(db().collection(COLLECTIONS.HALLS).doc(), h);
      });
      return batch.commit().then(function () {
        logAudit('seed', COLLECTIONS.HALLS, null, 'إنشاء القاعات الافتراضية');
        return DEFAULT_HALLS.length;
      });
    }));

    jobs.push(db().collection(COLLECTIONS.BUDGET_CATEGORIES).limit(1).get().then(function (snap) {
      if (!snap.empty) return 0;
      var batch = db().batch();
      DEFAULT_BUDGET_CATEGORIES.forEach(function (name) {
        batch.set(db().collection(COLLECTIONS.BUDGET_CATEGORIES).doc(), { name: name });
      });
      return batch.commit().then(function () {
        logAudit('seed', COLLECTIONS.BUDGET_CATEGORIES, null, 'إنشاء فئات الميزانية الافتراضية');
        return DEFAULT_BUDGET_CATEGORIES.length;
      });
    }));

    return Promise.all(jobs).then(function (counts) {
      return { periods: counts[0], halls: counts[1], budgetCategories: counts[2] };
    });
  }

  // --- توليد الجدول ---
  // يملأ الأسابيع أسبوعاً بعد أسبوع بدءاً من startDate (افتراضياً: اليوم)،
  // بحد أقصى 4 أسابيع، ويتوقف عند بلوغ sessionCount (باحتساب الجلسات
  // الموجودة). يتخطى العطل والأيام التي لها جلسة أصلاً — إعادة التشغيل
  // لا تنشئ تكرارات أبداً.
  function generateSchedule(courseId, weeks, startDate) {
    try { requireWrite(); } catch (e) { return Promise.reject(e); }
    var weeksNum = Math.max(1, Math.min(4, parseInt(weeks, 10) || 1));
    var start = startDate ? parseDate(startDate) : new Date();
    var end = new Date(start.getTime());
    end.setDate(end.getDate() + weeksNum * 7 - 1);
    var startS = dateStr(start);
    var endS = dateStr(end);

    var course, holidaysSet, existingDates, existingDateList, existingCount, halls, occupied;

    return get(COLLECTIONS.COURSES, courseId).then(function (c) {
      if (!c) throw new Error('مجموعة التدريب غير موجودة');
      if (!Array.isArray(c.days) || c.days.length === 0) {
        throw new Error('مجموعة التدريب بلا أيام أسبوعية — حدّد أيام مجموعة التدريب أولاً');
      }
      if (!c.periodId) throw new Error('مجموعة التدريب بلا فترة تدريبية — حدّد الفترة أولاً');
      if (!c.sessionCount || c.sessionCount < 1) {
        throw new Error('عدد جلسات مجموعة التدريب غير محدد');
      }
      course = c;
      return Promise.all([
        list(COLLECTIONS.HOLIDAYS),
        db().collection(COLLECTIONS.SESSIONS).where('courseId', '==', courseId).get(),
        db().collection(COLLECTIONS.SESSIONS)
          .where('date', '>=', startS).where('date', '<=', endS).get(),
        list(COLLECTIONS.HALLS, 'name'),
        // الاجتماعات العارضة المجدولة في النطاق: تشغل قاعاتها كالجلسات.
        db().collection(COLLECTIONS.MEETINGS)
          .where('date', '>=', startS).where('date', '<=', endS).get()
      ]);
    }).then(function (results) {
      holidaysSet = new Set(results[0].map(function (h) { return h.date; }));
      existingDates = new Set();
      existingDateList = [];
      existingCount = 0;
      results[1].forEach(function (doc) {
        existingDates.add(doc.data().date);
        existingDateList.push(doc.data().date);
        existingCount++;
      });
      occupied = {}; // "date|periodId" -> Set(hallId)
      results[2].forEach(function (doc) {
        var s = doc.data();
        if (!s.hallId) return;
        // الملغاة والعطلة لا تشغلان القاعة (كما في checkHallAvailability).
        if (s.state === 'cancelled' || s.state === 'holiday') return;
        var key = s.date + '|' + s.periodId;
        if (!occupied[key]) occupied[key] = new Set();
        occupied[key].add(s.hallId);
      });
      // الاجتماعات العارضة المجدولة تشغل قاعاتها؛ الملغاة لا تشغلها.
      results[4].forEach(function (doc) {
        var m = doc.data();
        if (!m.hallId) return;
        if (m.status === 'cancelled') return;
        var mkey = m.date + '|' + m.periodId;
        if (!occupied[mkey]) occupied[mkey] = new Set();
        occupied[mkey].add(m.hallId);
      });
      halls = results[3];
      // قاعات النوع المطابق للدورة فقط (تقنية ← حاسوب، إدارية ←
      // إدارية)، مع قاعدة الرجوع الآمن: إن لم توجد قاعة مطابقة أصلاً
      // تُستخدم كل القاعات (matchingHalls). القاعة المحددة صراحةً في
      // dayPlan تُحترم كما هي (انظر أدناه).
      var typeHalls = matchingHalls(halls, courseTypeOf(course));

      var created = 0;
      var skippedHolidays = 0;
      var skippedWeekend = 0;
      var unassignedHalls = [];
      var batch = db().batch();
      var total = existingCount;
      var actor = actorInfo();

      for (var i = 0; i < weeksNum * 7 && total < course.sessionCount; i++) {
        var d = new Date(start.getTime());
        d.setDate(d.getDate() + i);
        if (course.days.indexOf(d.getDay()) === -1) continue;
        var ds = dateStr(d);
        if (existingDates.has(ds)) continue; // جلسة موجودة — لا تكرار
        if (holidaysSet.has(ds)) { skippedHolidays++; continue; }
        // العطلة الأسبوعية (v2.3): بلا جلسات أبداً (الجمعة + السبت
        // افتراضياً، قابلة للتغيير من الإعدادات).
        if (getWeekendDays().indexOf(d.getDay()) !== -1) { skippedWeekend++; continue; }

        // الخطة الأسبوعية (v1.1): فترة وقاعة لكل يوم على حدة؛ الدورات
        // القديمة بلا dayPlan تأخذ الفترة الرئيسية وأول قاعة حرة كما قبل.
        // المختلط (v2.3.1): نوع القاعة حسب ترتيب الجلسة الزمني —
        // الجلسات الأولى (حتى adminSessions) إدارية ثم التقنية؛
        // الترتيب = الجلسات الموجودة قبل هذا التاريخ + المنشأة في
        // هذا التشغيل (كلها قبل هذا التاريخ — الحلقة تسير زمنياً).
        var slotHalls = typeHalls;
        if (courseTypeOf(course) === 'mixed') {
          var idxBefore = 0;
          existingDateList.forEach(function (ed) { if (ed < ds) idxBefore++; });
          slotHalls = matchingHalls(halls, sessionCourseType(course, idxBefore + created));
        }
        var plan = (course.dayPlan && course.dayPlan[d.getDay()]) || null;
        var periodId = plan && plan.periodId ? plan.periodId : course.periodId;
        var hallId = null;
        var key = ds + '|' + periodId;
        var busy = occupied[key] || new Set();
        if (plan && plan.hallId) {
          // قاعة مطلوبة صراحةً: تُستخدم إن كانت موجودة وحرة فقط — لا بديل
          // صامت عنها، والجلسة بلا قاعة تظهر في نافذة النتيجة للتعيين
          // اليدوي. أما إن حُذفت القاعة المطلوبة لاحقاً فالخيار غير قابل
          // للتنفيذ أصلاً، فنعود إلى أول قاعة حرة.
          var hallExists = halls.some(function (hh) { return hh.id === plan.hallId; });
          if (!hallExists) {
            // القاعة المطلوبة حُذفت: أول قاعة حرة من النوع المطابق.
            for (var hi = 0; hi < slotHalls.length; hi++) {
              if (!busy.has(slotHalls[hi].id)) { hallId = slotHalls[hi].id; break; }
            }
          } else if (!busy.has(plan.hallId)) {
            hallId = plan.hallId;
          }
        } else {
          // أول قاعة حرة من النوع المطابق في ذلك التاريخ والفترة.
          for (var h = 0; h < slotHalls.length; h++) {
            if (!busy.has(slotHalls[h].id)) { hallId = slotHalls[h].id; break; }
          }
        }
        if (hallId) {
          if (!occupied[key]) occupied[key] = new Set();
          occupied[key].add(hallId);
        } else {
          unassignedHalls.push(ds);
        }

        var ref = db().collection(COLLECTIONS.SESSIONS).doc();
        batch.set(ref, {
          courseId: courseId,
          date: ds,
          periodId: periodId,
          hallId: hallId,
          state: 'scheduled',
          note: '',
          trainerPresent: null,
          mergedFrom: null,
          createdAt: serverTs(),
          createdBy: actor.userId
        });
        created++;
        total++;
      }

      if (created === 0) {
        return { created: 0, skippedHolidays: skippedHolidays, skippedWeekend: skippedWeekend, unassignedHalls: unassignedHalls };
      }
      return batch.commit().then(function () {
        logAudit('schedule_generate', COLLECTIONS.COURSES, courseId,
          'توليد جدول: ' + created + ' جلسة جديدة، ' + skippedHolidays + ' يوم عطلة متخطى' +
          (skippedWeekend ? '، ' + skippedWeekend + ' يوم عطلة أسبوعية متخطى' : ''));
        return { created: created, skippedHolidays: skippedHolidays, skippedWeekend: skippedWeekend, unassignedHalls: unassignedHalls };
      });
    });
  }

  // --- تغيير تاريخ بدء الدورة (إعادة توليد الجدول) ---
  // تصنيف جلسات الدورة: مقفلة أم حرة. المقفلة = لها سجل حضور واحد
  // على الأقل، أو ملاحظة غير فارغة، أو mergedFrom غير فارغ، أو حالتها
  // غير «مجدولة». الحرة = مجدولة بلا حضور وبلا ملاحظة وبلا دمج.
  // الحضور يُقرأ جلسةً بعد جلسة (بالتسلسل، كما في buildCourseFileData)
  // لتجنب إغراق الطلبات.
  function classifyCourseSessions(courseId) {
    return db().collection(COLLECTIONS.SESSIONS).where('courseId', '==', courseId).get()
      .then(function (snap) {
        var sessions = toList(snap);
        var locked = [];
        var free = [];
        var chain = Promise.resolve();
        sessions.forEach(function (s) {
          chain = chain.then(function () {
            return getSessionAttendance(s.id).then(function (att) {
              var hasAttendance = Object.keys(att).length > 0;
              var hasNote = !!(s.note && String(s.note).trim());
              var hasMerged = Array.isArray(s.mergedFrom)
                ? s.mergedFrom.length > 0
                : !!s.mergedFrom;
              if (hasAttendance || hasNote || hasMerged || s.state !== 'scheduled') {
                locked.push(s);
              } else {
                free.push(s);
              }
            });
          });
        });
        return chain.then(function () {
          return { locked: locked, free: free };
        });
      });
  }

  function validateStartDate(newStartDate) {
    if (!newStartDate || typeof newStartDate !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(newStartDate)) {
      throw new Error('تاريخ البدء الجديد غير صالح — اختر تاريخاً صحيحاً');
    }
    var d = parseDate(newStartDate);
    if (isNaN(d.getTime()) || dateStr(d) !== newStartDate) {
      throw new Error('تاريخ البدء الجديد غير صالح — اختر تاريخاً صحيحاً');
    }
  }

  // معاينة إعادة التوليد: أعداد فقط، بلا أي كتابة.
  function rescheduleCoursePreview(courseId, newStartDate) {
    try { requireWrite(); } catch (e) { return Promise.reject(e); }
    try { validateStartDate(newStartDate); } catch (e) { return Promise.reject(e); }
    return classifyCourseSessions(courseId).then(function (cls) {
      var keptDates = cls.locked.map(function (s) { return s.date; }).sort();
      return {
        kept: cls.locked.length,
        removed: cls.free.length,
        keptDates: keptDates,
        newStartDate: newStartDate
      };
    });
  }

  // إعادة توليد الجدول من تاريخ بدء جديد: تحذف الجلسات الحرة فقط،
  // وتحتفظ بالمقفلة في مواعيدها، ثم تولّد من التاريخ الجديد على دفعات
  // 4 أسابيع حتى بلوغ sessionCount (باحتساب المقفلة، لأن
  // generateSchedule يحسب الجلسات الموجودة ويتخطى تواريخها).
  function rescheduleCourse(courseId, newStartDate) {
    try { requireWrite(); } catch (e) { return Promise.reject(e); }
    try { validateStartDate(newStartDate); } catch (e) { return Promise.reject(e); }
    var course, classification;
    var totals = { created: 0, skippedHolidays: 0, unassignedHalls: [] };
    return get(COLLECTIONS.COURSES, courseId).then(function (c) {
      if (!c) throw new Error('مجموعة التدريب غير موجودة');
      course = c;
      return classifyCourseSessions(courseId);
    }).then(function (cls) {
      classification = cls;
      // الجلسات الحرة بلا حضور أصلاً — حذفها لا يترك حضوراً يتيماً.
      var batch = db().batch();
      cls.free.forEach(function (s) {
        batch.delete(db().collection(COLLECTIONS.SESSIONS).doc(s.id));
      });
      batch.update(db().collection(COLLECTIONS.COURSES).doc(courseId), { startDate: newStartDate });
      return batch.commit();
    }).then(function () {
      var chunkStart = parseDate(newStartDate);
      var chunks = 0;
      function runChunk() {
        if (chunks >= 10) return Promise.resolve();
        chunks++;
        return generateSchedule(courseId, 4, dateStr(chunkStart)).then(function (res) {
          totals.created += res.created;
          totals.skippedHolidays += res.skippedHolidays;
          totals.unassignedHalls = totals.unassignedHalls.concat(res.unassignedHalls || []);
          if (res.created === 0) return;
          chunkStart.setDate(chunkStart.getDate() + 28);
          return db().collection(COLLECTIONS.SESSIONS).where('courseId', '==', courseId).get()
            .then(function (snap) {
              if (snap.size >= (Number(course.sessionCount) || 0)) return;
              return runChunk();
            });
        });
      }
      return runChunk();
    }).then(function () {
      logAudit('course_reschedule', COLLECTIONS.COURSES, courseId,
        'تغيير تاريخ بدء مجموعة التدريب إلى ' + newStartDate + ': الاحتفاظ بـ ' +
        classification.locked.length + ' جلسة، إعادة توليد ' + totals.created + ' جلسة');
      return {
        kept: classification.locked.length,
        removed: classification.free.length,
        created: totals.created,
        skippedHolidays: totals.skippedHolidays,
        unassignedHalls: totals.unassignedHalls
      };
    });
  }

  // --- معاينة حذف الدورة وحذفها (إدارة الدورات v1.1) ---
  // قاعدة الحماية (نهائية): الحضور سجل رسمي لا يُحذف أبداً. إن كان
  // لأي جلسة من جلسات الدورة سجل حضور واحد على الأقل، يُمنع حذف
  // الدورة كلياً — في المعاينة وفي دالة الحذف نفسها (الواجهة ليست
  // الحارس الوحيد). الدورة المحظور حذفها تُوقَف أو تُلغى بدلاً من ذلك.
  // الحذف يشمل: الجلسات + حضورها (فارغ حتماً بعد فحص الحماية) +
  // مصاريف الدورة + مستند الدورة نفسه. المتدربون سجلات دليل مستقلة
  // (قد ينتمون لدورات أخرى) فلا تُحذف، والملاحظات تبقى بلا عرض.
  function courseDeletePreview(courseId) {
    try { requireWrite(); } catch (e) { return Promise.reject(e); }
    return db().collection(COLLECTIONS.SESSIONS).where('courseId', '==', courseId).get()
      .then(function (snap) {
        var sessions = toList(snap);
        var withAttendance = 0;
        var chain = Promise.resolve();
        sessions.forEach(function (s) {
          chain = chain.then(function () {
            return getSessionAttendance(s.id).then(function (att) {
              if (Object.keys(att).length > 0) withAttendance++;
            });
          });
        });
        return chain.then(function () {
          return db().collection(COLLECTIONS.EXPENSES).where('courseId', '==', courseId).get()
            .then(function (expSnap) {
              return { sessions: sessions.length, withAttendance: withAttendance, expenses: expSnap.size };
            });
        });
      });
  }

  // حذف مراجع على دفعات متسلسلة: حد Firestore 500 عملية في الدفعة
  // الواحدة — نلتزم بـ 400 كحد أقصى لكل التزام.
  function commitDeleteRefsInChunks(refs) {
    var chain = Promise.resolve();
    for (var i = 0; i < refs.length; i += 400) {
      (function (chunk) {
        chain = chain.then(function () {
          var batch = db().batch();
          chunk.forEach(function (ref) { batch.delete(ref); });
          return batch.commit();
        });
      })(refs.slice(i, i + 400));
    }
    return chain;
  }

  // حذف دورة كاملة: يعيد فحص الحماية أولاً (قبل أي كتابة) ويرفض
  // برسالة عربية إن كان لأي جلسة حضور مسجل، ثم يحذف الجلسات
  // وحضورها والمصاريف والدورة نفسها على دفعات.
  function deleteCourse(courseId) {
    try { requireWrite(); } catch (e) { return Promise.reject(e); }
    var courseName = '';
    var sessions = [];
    var attendanceRefs = [];
    var expenseRefs = [];
    return get(COLLECTIONS.COURSES, courseId).then(function (c) {
      if (!c) throw new Error('مجموعة التدريب غير موجودة');
      courseName = c.name || courseId;
      return db().collection(COLLECTIONS.SESSIONS).where('courseId', '==', courseId).get();
    }).then(function (snap) {
      sessions = toList(snap);
      // إعادة فحص الحماية أولاً — قبل أي كتابة.
      var withAttendance = 0;
      var chain = Promise.resolve();
      sessions.forEach(function (s) {
        chain = chain.then(function () {
          return getSessionAttendance(s.id).then(function (att) {
            var keys = Object.keys(att);
            if (keys.length > 0) withAttendance++;
            keys.forEach(function (tid) {
              attendanceRefs.push(db().collection(COLLECTIONS.SESSIONS).doc(s.id)
                .collection('attendance').doc(tid));
            });
          });
        });
      });
      return chain.then(function () {
        if (withAttendance > 0) {
          throw new Error('لا يمكن حذف مجموعة التدريب هذه — تحتوي ' + withAttendance +
            ' جلسة على سجلات حضور. يمكنك إيقاف مجموعة التدريب أو إلغاؤها بدلاً من ذلك.');
        }
        // الحماية مرّت: لا حضور مسجل أصلاً — قائمة مراجع الحضور فارغة حتماً.
        return db().collection(COLLECTIONS.EXPENSES).where('courseId', '==', courseId).get();
      });
    }).then(function (expSnap) {
      expSnap.forEach(function (doc) { expenseRefs.push(doc.ref); });
      var refs = [];
      sessions.forEach(function (s) {
        refs.push(db().collection(COLLECTIONS.SESSIONS).doc(s.id));
      });
      refs = refs.concat(attendanceRefs, expenseRefs);
      refs.push(db().collection(COLLECTIONS.COURSES).doc(courseId));
      return commitDeleteRefsInChunks(refs);
    }).then(function () {
      logAudit('course_delete', COLLECTIONS.COURSES, courseId,
        'حذف مجموعة تدريب: ' + courseName + ' — ' + sessions.length + ' جلسة، ' + expenseRefs.length + ' مصروف');
      return { sessions: sessions.length, expenses: expenseRefs.length };
    });
  }

  // --- توفر القاعات ---
  // القاعة مشغولة بجلسة مجدولة (غير ملغاة ولا عطلة) أو باجتماع عارض
  // مجدول (غير ملغى). كل صف: {hallId, hallName, free, sessionCourse,
  // meetingTitle, occupantKind}. حقل sessionCourse هو التسمية المعروضة
  // في قوائم «مشغولة» عند كل المستدعين: اسم الدورة للجلسة، أو
  // «اجتماع: <العنوان>» للاجتماع — فيبقى نص القوائم صحيحاً دون تغييرها.
  // (v2.3) كل صف يحمل أيضاً hallType. والمعامل الاختياري الثالث
  // courseType ('admin'|'technical') يضيف preferred (هل القاعة مطابقة
  // لنوع الدورة) ويرتّب الصفوف: المطابقة المتاحة أولاً، ثم المطابقة
  // المشغولة، ثم الباقية. بلا courseType يبقى الترتيب والسلوك كما قبل.
  function checkHallAvailability(date, periodId, courseType) {
    var wantHallType = courseType ? hallTypeForCourseType(courseType) : null;
    var hallsP = list(COLLECTIONS.HALLS, 'name');
    var sessionsP = db().collection(COLLECTIONS.SESSIONS)
      .where('date', '==', date).where('periodId', '==', periodId).get();
    var meetingsP = db().collection(COLLECTIONS.MEETINGS)
      .where('date', '==', date).where('periodId', '==', periodId).get();
    return Promise.all([hallsP, sessionsP, meetingsP]).then(function (results) {
      var halls = results[0];
      var byHall = {}; // hallId -> courseId
      results[1].forEach(function (doc) {
        var s = doc.data();
        // الملغاة والعطلة لا تشغلان القاعة.
        if (s.hallId && s.state !== 'cancelled' && s.state !== 'holiday') byHall[s.hallId] = s.courseId;
      });
      var byMeeting = {}; // hallId -> meeting title
      results[2].forEach(function (doc) {
        var m = doc.data();
        // الاجتماع الملغى لا يشغل القاعة.
        if (m.hallId && m.status !== 'cancelled') byMeeting[m.hallId] = m.title;
      });
      var courseIds = Object.keys(byHall).map(function (k) { return byHall[k]; });
      var uniqueIds = courseIds.filter(function (v, i, a) { return a.indexOf(v) === i; });
      return Promise.all(uniqueIds.map(function (id) { return get(COLLECTIONS.COURSES, id); }))
        .then(function (courses) {
          // v2.3.1 — دليل الدورات: اسم الجلسة الشاغلة يُحلُّ من
          // الدليل عند ربط المجموعة بإدخال، وإلا الاسم المخزَّن.
          var catalogIds = [];
          courses.forEach(function (c) {
            if (c && c.courseId && catalogIds.indexOf(c.courseId) === -1) catalogIds.push(c.courseId);
          });
          return Promise.all(catalogIds.map(function (id) { return get(COLLECTIONS.COURSE_NAMES, id); }))
            .then(function (entries) {
              var catalogNames = {};
              entries.forEach(function (e) { if (e && e.name) catalogNames[e.id] = e.name; });
              var names = {};
              courses.forEach(function (c) {
                if (c) names[c.id] = (c.courseId && catalogNames[c.courseId]) || c.name;
              });
              return { halls: halls, names: names };
            });
        })
        .then(function (resolved) {
          var halls = resolved.halls;
          var names = resolved.names;
          var rows = halls.map(function (hall) {
            var courseId = byHall[hall.id] || null;
            var meetingTitle = byMeeting[hall.id] || null;
            // الجلسة والاجتماع لا يجتمعان في قاعة واحدة أصلاً (التحقق
            // يمنعهما في الاتجاهين)؛ إن حدث ذلك تظهر الجلسة أولاً.
            var kind = courseId ? 'session' : (meetingTitle ? 'meeting' : null);
            return {
              hallId: hall.id,
              hallName: hall.name,
              hallType: hallTypeOf(hall),
              free: !kind,
              preferred: wantHallType ? (hallTypeOf(hall) === wantHallType) : null,
              sessionCourse: courseId ? (names[courseId] || courseId) :
                (meetingTitle ? 'اجتماع: ' + meetingTitle : null),
              meetingTitle: meetingTitle,
              occupantKind: kind
            };
          });
          if (wantHallType) {
            // المطابقة أولاً، والمتاحة قبل المشغولة داخل كل مجموعة.
            rows.sort(function (a, b) {
              if (a.preferred !== b.preferred) return a.preferred ? -1 : 1;
              if (a.free !== b.free) return a.free ? -1 : 1;
              return 0;
            });
          }
          return rows;
        });
    });
  }

  // --- دمج جلستين ---
  // الأولوية عند تعارض الحضور لنفس المتدرب: حاضر > معتذر > غائب.
  // v2.3 (تحقق 18 تشرين الثاني 2026): الدمج يُنتج جلسة واحدة فعلاً —
  // حضور الجلسة المُزالة يُدمج في الباقية ثم تُحذف المُزالة
  // (batch.delete(removeRef) + سجلّا تدقيق session_merge و
  // session_merge_delete). «ملغي» أدنى أولوية (0 — سجل مُبطل لا
  // يطغى على تسجيل فعلي) و«لم يحضر» بمرتبة الغائب (1).
  function mergeSessions(keepId, removeId) {
    try { requireWrite(); } catch (e) { return Promise.reject(e); }
    if (keepId === removeId) return Promise.reject(new Error('لا يمكن دمج جلسة مع نفسها'));
    var priority = { present: 3, excused: 2, absent: 1, 'did-not-attend': 1, cancelled: 0 };

    var keep, removeDoc;
    return Promise.all([
      get(COLLECTIONS.SESSIONS, keepId),
      get(COLLECTIONS.SESSIONS, removeId)
    ]).then(function (pair) {
      keep = pair[0];
      removeDoc = pair[1];
      if (!keep) throw new Error('الجلسة الأساسية غير موجودة');
      if (!removeDoc) throw new Error('الجلسة المدمجة غير موجودة');
      return Promise.all([
        db().collection(COLLECTIONS.SESSIONS).doc(keepId).collection('attendance').get(),
        db().collection(COLLECTIONS.SESSIONS).doc(removeId).collection('attendance').get(),
        removeDoc.hallId ? get(COLLECTIONS.HALLS, removeDoc.hallId) : Promise.resolve(null)
      ]);
    }).then(function (snaps) {
      var keepAtt = {};
      snaps[0].forEach(function (doc) { keepAtt[doc.id] = doc.data(); });
      var batch = db().batch();
      var keepRef = db().collection(COLLECTIONS.SESSIONS).doc(keepId);
      var removeRef = db().collection(COLLECTIONS.SESSIONS).doc(removeId);

      snaps[1].forEach(function (doc) {
        var incoming = doc.data();
        var existing = keepAtt[doc.id];
        var target = keepRef.collection('attendance').doc(doc.id);
        if (!existing) {
          batch.set(target, incoming);
        } else if ((priority[incoming.status] || 0) > (priority[existing.status] || 0)) {
          batch.set(target, incoming);
        }
        batch.delete(doc.ref);
      });

      var hallName = snaps[2] ? snaps[2].name : null;
      var mergeNote = 'دُمجت فيها جلسة بتاريخ ' + removeDoc.date +
        (hallName ? ' (كانت في ' + hallName + ').' : ' (بلا قاعة).');
      var mergedFrom = Array.isArray(keep.mergedFrom) ? keep.mergedFrom.slice() : [];
      if (mergedFrom.indexOf(removeId) === -1) mergedFrom.push(removeId);
      batch.update(keepRef, {
        note: (keep.note ? keep.note + '\n' : '') + mergeNote,
        mergedFrom: mergedFrom
      });
      batch.delete(removeRef);

      return batch.commit().then(function () {
        logAudit('session_merge', COLLECTIONS.SESSIONS, keepId,
          'دمج جلسة ' + removeDoc.date + ' في جلسة ' + keep.date);
        logAudit('session_merge_delete', COLLECTIONS.SESSIONS, removeId,
          'حُذفت بعد دمجها في جلسة ' + keep.date);
      });
    });
  }

  // --- تقسيم جلسة إلى جزأين ---
  // الجزء الأول يبقى في موعده الأصلي؛ الجزء الثاني جلسة جديدة في فترة
  // أخرى من اليوم نفسه (same-day) أو في يوم آخر (different-days).
  // الجلسات تُعيَّن للفترات دائماً، لا لأوقات حرة: «التقسيم حسب الوقت
  // في اليوم» يعني أن الجزأين يشغلان فترتين مختلفتين من اليوم نفسه.
  // القاعة: المختارة إن أُعطيت وكانت حرة، وإلا أول قاعة حرة في الموعد
  // الجديد (كما في generateSchedule)، وإلا بلا قاعة. الحضور يبقى على
  // الأصل افتراضياً؛ مع moveAttendance يُنقل كاملاً إلى الجزء الجديد.
  // التقسيم يضيف جلسة فعلية فوق sessionCount المخطط — وهذا صحيح،
  // لأن الجلسات فعلية والتقدم يُحسب من الفعليات. حقول جديدة اختيارية
  // فقط (splitFrom/splitInto) — لا ترحيل ولا تغيير على الجلسات القديمة.
  function splitSession(sessionId, opts) {
    try { requireWrite(); } catch (e) { return Promise.reject(e); }
    opts = opts || {};
    var mode = opts.mode === 'different-days' ? 'different-days' : 'same-day';
    var newDate = mode === 'different-days' ? String(opts.date || '').trim() : null;
    var newPeriodId = opts.periodId || null;
    if (!newPeriodId) return Promise.reject(new Error('اختر الفترة للجزء الثاني'));
    if (mode === 'different-days' && !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      return Promise.reject(new Error('اختر تاريخاً صحيحاً للجزء الثاني'));
    }

    var original, newPeriod, origPeriod, newHallId;
    return get(COLLECTIONS.SESSIONS, sessionId).then(function (s) {
      if (!s) throw new Error('الجلسة غير موجودة');
      if (s.state !== 'scheduled') throw new Error('لا يمكن تقسيم جلسة مكتملة أو ملغاة');
      original = s;
      if (mode === 'same-day') {
        newDate = s.date;
        if (newPeriodId === s.periodId) throw new Error('اختر فترة مختلفة عن فترة الجلسة الأصلية');
      } else if (newDate === s.date && newPeriodId === s.periodId) {
        throw new Error('اختر موعداً مختلفاً عن موعد الجلسة الأصلية');
      }
      return Promise.all([
        get(COLLECTIONS.PERIODS, newPeriodId),
        get(COLLECTIONS.PERIODS, s.periodId)
      ]);
    }).then(function (periods) {
      newPeriod = periods[0];
      origPeriod = periods[1];
      if (!newPeriod) throw new Error('الفترة المختارة غير موجودة');
      // القاعة: المختارة إن كانت حرة، وإلا أول قاعة حرة في الموعد الجديد.
      return checkHallAvailability(newDate, newPeriodId);
    }).then(function (rows) {
      var wanted = opts.hallId || null;
      var free = rows.filter(function (r) { return r.free; });
      if (wanted) {
        var wantedRow = null;
        rows.forEach(function (r) { if (r.hallId === wanted) wantedRow = r; });
        if (wantedRow && wantedRow.free) { newHallId = wanted; return null; }
        // المختارة مشغولة أو غير موجودة: أول قاعة حرة بدلاً منها.
      }
      newHallId = free.length ? free[0].hallId : null;
      return null;
    }).then(function () {
      // التحقق الكامل: ليس عطلة، والقاعة حرة (الجلسة الأصلية في موعد
      // مختلف أصلاً فلا تعارض ذاتي هنا).
      return validateSessionSlot(newDate, newPeriodId, newHallId, sessionId, newDate === original.date);
    }).then(function () {
      var actor = actorInfo();
      var origLabel = origPeriod ? origPeriod.label : '';
      var newNote = 'جزء مقسوم من جلسة ' + original.date + (origLabel ? ' ' + origLabel : '');
      if (typeof opts.note === 'string' && opts.note.trim()) newNote += ' — ' + opts.note.trim();
      var ref = db().collection(COLLECTIONS.SESSIONS).doc();
      return ref.set({
        courseId: original.courseId,
        date: newDate,
        periodId: newPeriodId,
        hallId: newHallId,
        state: 'scheduled',
        note: newNote,
        trainerPresent: null,
        mergedFrom: null,
        splitFrom: sessionId,
        createdAt: serverTs(),
        createdBy: actor.userId
      }).then(function () { return ref.id; });
    }).then(function (newId) {
      var newLabel = newPeriod ? newPeriod.label : '';
      var origNote = (original.note ? original.note + '\n' : '') +
        'تم تقسيم هذه الجلسة — الجزء الثاني: ' + newDate + (newLabel ? ' ' + newLabel : '');
      var updateP = db().collection(COLLECTIONS.SESSIONS).doc(sessionId).update({
        splitInto: newId,
        note: origNote
      });
      var moveP = Promise.resolve();
      if (opts.moveAttendance) {
        // نقل الحضور: نسخ كل سجل إلى حضور الجزء الجديد ثم حذفه من الأصل
        // (بنفس نمط دفعة mergeSessions — الوجهة هنا مجموعة فرعية جديدة).
        moveP = db().collection(COLLECTIONS.SESSIONS).doc(sessionId).collection('attendance').get()
          .then(function (snap) {
            if (snap.empty) return;
            var batch = db().batch();
            var newRef = db().collection(COLLECTIONS.SESSIONS).doc(newId);
            snap.forEach(function (doc) {
              batch.set(newRef.collection('attendance').doc(doc.id), doc.data());
              batch.delete(doc.ref);
            });
            return batch.commit();
          });
      }
      return Promise.all([updateP, moveP]).then(function () { return newId; });
    }).then(function (newId) {
      logAudit('session_split', COLLECTIONS.SESSIONS, sessionId,
        'تقسيم الجلسة بتاريخ ' + original.date + ' — الجزء الثاني: ' + newDate +
        (opts.moveAttendance ? ' (نُقل الحضور المسجل)' : ''));
      return newId;
    });
  }

  // --- حالات الجلسات والحضور ---
  function setSessionState(sessionId, state, note) {
    try { requireWrite(); } catch (e) { return Promise.reject(e); }
    if (SESSION_STATES.indexOf(state) === -1) {
      return Promise.reject(new Error('حالة الجلسة غير صالحة'));
    }
    var data = { state: state };
    if (typeof note === 'string') data.note = note;
    return db().collection(COLLECTIONS.SESSIONS).doc(sessionId).update(data).then(function () {
      logAudit('session_state', COLLECTIONS.SESSIONS, sessionId, 'تغيير حالة الجلسة إلى: ' + (SESSION_STATE_LABELS[state] || state));
    });
  }

  // --- التحقق المشترك من صلاحية موعد جلسة (للتأجيل والتعديل) ---
  // التاريخ يجب ألا يكون عطلة، والقاعة (إن وُجدت) يجب أن تكون حرة
  // في ذلك التاريخ والفترة. excludeSessionId تُستثنى من فحص القاعة
  // (الجلسة نفسها عند تأجيلها أو تعديلها). الجلسات الملغاة أو بحالة
  // عطلة لا تشغل القاعة، والاجتماعات الملغاة لا تشغلها أيضاً.
  // تُرجع Promise تُرفض برسالة عربية عند التعارض.
  // فحص الإشغال المشترك (جلسات + اجتماعات): تُرجع اسم الشاغل بالعربية
  // («جلسة تدريبية» أو «اجتماع عارض») أو null إن كان الموعد حراً.
  // excludeSessionId/excludeMeetingId يستثنيان المستند نفسه عند التعديل.
  function slotOccupant(date, periodId, hallId, excludeSessionId, excludeMeetingId) {
    var sessionsP = db().collection(COLLECTIONS.SESSIONS)
      .where('date', '==', date).where('periodId', '==', periodId).get();
    var meetingsP = db().collection(COLLECTIONS.MEETINGS)
      .where('date', '==', date).where('periodId', '==', periodId).get();
    return Promise.all([sessionsP, meetingsP]).then(function (results) {
      var occupant = null;
      results[0].forEach(function (doc) {
        if (occupant) return;
        if (doc.id === excludeSessionId) return;
        var s = doc.data();
        if (s.hallId === hallId && s.state !== 'cancelled' && s.state !== 'holiday') occupant = 'جلسة تدريبية';
      });
      if (occupant) return occupant;
      results[1].forEach(function (doc) {
        if (occupant) return;
        if (doc.id === excludeMeetingId) return;
        var m = doc.data();
        if (m.hallId === hallId && m.status !== 'cancelled') occupant = 'اجتماع عارض';
      });
      return occupant;
    });
  }

  // skipHolidayCheck: يُتخطى فحص العطلة عند بقاء التاريخ نفسه
  // (جلسة وُجدت قبل تسجيل العطلة — تعديل قاعتها أو فترتها ضمن اليوم
  // نفسه لا ينقلها إلى عطلة؛ فحص الإشغال يبقى دائماً). الإنشاء ونقل
  // الجلسة إلى تاريخ جديد يفحصان العطلة دائماً.
  function validateSessionSlot(date, periodId, hallId, excludeSessionId, skipHolidayCheck) {
    var holidayP = skipHolidayCheck
      ? Promise.resolve({ empty: true })
      : db().collection(COLLECTIONS.HOLIDAYS).where('date', '==', date).limit(1).get();
    return holidayP
      .then(function (snap) {
        if (!snap.empty) throw new Error('التاريخ المختار يوم عطلة — اختر تاريخاً آخر');
        if (!hallId) return null;
        return slotOccupant(date, periodId, hallId, excludeSessionId, null);
      }).then(function (occupant) {
        if (occupant) {
          throw new Error('القاعة مشغولة في ذلك التاريخ والفترة (' + occupant + ') — اختر قاعة أخرى أو موعداً آخر');
        }
      });
  }

  // --- التحقق المشترك من صلاحية موعد اجتماع عارض (للإنشاء والتعديل) ---
  // نفس قواعد الجلسة: ليس عطلة، والقاعة حرة من جلسة مجدولة ومن اجتماع
  // عارض مجدول آخر. excludeMeetingId يستثني الاجتماع نفسه عند تعديله.
  // skipHolidayCheck كالجلسة: يُتخطى فحص العطلة عند بقاء التاريخ نفسه.
  function validateMeetingSlot(date, periodId, hallId, excludeMeetingId, skipHolidayCheck) {
    var holidayP = skipHolidayCheck
      ? Promise.resolve({ empty: true })
      : db().collection(COLLECTIONS.HOLIDAYS).where('date', '==', date).limit(1).get();
    return holidayP
      .then(function (snap) {
        if (!snap.empty) throw new Error('التاريخ المختار يوم عطلة — اختر تاريخاً آخر');
        if (!hallId) return null;
        return slotOccupant(date, periodId, hallId, null, excludeMeetingId);
      }).then(function (occupant) {
        if (occupant) {
          throw new Error('القاعة مشغولة في ذلك التاريخ والفترة (' + occupant + ') — اختر قاعة أخرى أو موعداً آخر');
        }
      });
  }

  // --- تأجيل جلسة إلى تاريخ وفترة جديدين ---
  // hallId: إن لم يُمرَّر (undefined) تبقى قاعة الجلسة الحالية؛
  // null تعني بلا قاعة. يُضاف سطر «تأجيل إلى …» إلى الملاحظة دائماً،
  // ومعه نص الملاحظة الممرَّرة إن وُجدت. الحالة تعود إلى «مجدولة».
  function postponeSession(sessionId, newDate, newPeriodId, hallId, note) {
    try { requireWrite(); } catch (e) { return Promise.reject(e); }
    if (!newDate || !newPeriodId) {
      return Promise.reject(new Error('التاريخ والفترة مطلوبان لتأجيل الجلسة'));
    }
    var session, targetHall;
    return get(COLLECTIONS.SESSIONS, sessionId).then(function (s) {
      if (!s) throw new Error('الجلسة غير موجودة');
      session = s;
      targetHall = (hallId === undefined) ? (s.hallId || null) : hallId;
      return validateSessionSlot(newDate, newPeriodId, targetHall, sessionId, newDate === session.date);
    }).then(function () {
      var line = 'تأجيل إلى ' + newDate;
      if (typeof note === 'string' && note.trim()) line += ' — ' + note.trim();
      var newNote = (session.note ? session.note + '\n' : '') + line;
      return db().collection(COLLECTIONS.SESSIONS).doc(sessionId).update({
        date: newDate,
        periodId: newPeriodId,
        hallId: targetHall,
        state: 'scheduled',
        note: newNote
      }).then(function () {
        logAudit('session_postpone', COLLECTIONS.SESSIONS, sessionId,
          'تأجيل الجلسة من ' + session.date + ' إلى ' + newDate);
      });
    });
  }

  // --- تحويل جلسة إلى عطلة ---
  // الحالة تصبح «عطلة» (لا تشغل القاعة بعدها). إن كان addToHolidays
  // صحيحاً ولم يكن التاريخ عطلة مسجلة أصلاً، تُضاف عطلة بذلك التاريخ
  // باسم الدورة.
  function markSessionHoliday(sessionId, note, addToHolidays) {
    try { requireWrite(); } catch (e) { return Promise.reject(e); }
    var session;
    return get(COLLECTIONS.SESSIONS, sessionId).then(function (s) {
      if (!s) throw new Error('الجلسة غير موجودة');
      session = s;
      var newNote = s.note || '';
      if (typeof note === 'string' && note.trim()) {
        newNote = (newNote ? newNote + '\n' : '') + 'عطلة: ' + note.trim();
      }
      return db().collection(COLLECTIONS.SESSIONS).doc(sessionId).update({
        state: 'holiday',
        note: newNote
      });
    }).then(function () {
      if (!addToHolidays) return;
      return db().collection(COLLECTIONS.HOLIDAYS).where('date', '==', session.date).limit(1).get()
        .then(function (snap) {
          if (!snap.empty) return;
          return get(COLLECTIONS.COURSES, session.courseId).then(function (course) {
            var name = 'عطلة — ' + (course ? course.name : 'عطلة');
            return db().collection(COLLECTIONS.HOLIDAYS).add({ date: session.date, name: name });
          });
        });
    }).then(function () {
      logAudit('session_holiday', COLLECTIONS.SESSIONS, sessionId,
        'تحويل الجلسة بتاريخ ' + session.date + ' إلى عطلة');
    });
  }

  // --- تعديل عام للجلسة (يستخدمه نموذج «تعديل الجلسة») ---
  // data قد تحتوي {date, periodId, hallId, note}. عند تغيير التاريخ
  // أو الفترة تُطبَّق نفس تحققات التأجيل (ليس عطلة، القاعة حرة مع
  // استثناء الجلسة نفسها). لا يغيّر الحالة أبداً.
  function updateSession(sessionId, data) {
    try { requireWrite(); } catch (e) { return Promise.reject(e); }
    data = data || {};
    var session;
    return get(COLLECTIONS.SESSIONS, sessionId).then(function (s) {
      if (!s) throw new Error('الجلسة غير موجودة');
      session = s;
      var newDate = data.date || s.date;
      var newPeriodId = data.periodId || s.periodId;
      var newHallId = (data.hallId === undefined) ? (s.hallId || null) : data.hallId;
      var slotChanged = (newDate !== s.date) || (newPeriodId !== s.periodId);
      var hallChanged = newHallId !== (s.hallId || null);
      if (!slotChanged && !hallChanged) return null;
      return validateSessionSlot(newDate, newPeriodId, newHallId, sessionId, newDate === s.date);
    }).then(function () {
      var updateData = {};
      if (data.date) updateData.date = data.date;
      if (data.periodId) updateData.periodId = data.periodId;
      if (data.hallId !== undefined) updateData.hallId = data.hallId;
      if (typeof data.note === 'string') updateData.note = data.note;
      if (Object.keys(updateData).length === 0) return;
      return db().collection(COLLECTIONS.SESSIONS).doc(sessionId).update(updateData).then(function () {
        logAudit('session_update', COLLECTIONS.SESSIONS, sessionId,
          'تعديل الجلسة بتاريخ ' + (updateData.date || session.date));
      });
    });
  }

  // --- الاجتماعات العارضة (حجز قاعة لمرة واحدة) ---
  // مستند الاجتماع: {title, hallId, date, periodId, organizer?, notes?,
  // status: 'scheduled'|'cancelled', createdAt, createdBy}.
  // الاجتماع المجدول يشغل قاعته كالجلسة تماماً (الرزنامة، توفر القاعات،
  // توليد الجدول، التحقق)؛ الملغى يحرّرها. لا تصدير للاجتماعات.
  function createMeeting(data) {
    try { requireWrite(); } catch (e) { return Promise.reject(e); }
    data = data || {};
    var title = String(data.title || '').trim();
    if (!title) return Promise.reject(new Error('عنوان الاجتماع مطلوب'));
    if (!data.hallId) return Promise.reject(new Error('اختر قاعة الاجتماع'));
    if (!data.date) return Promise.reject(new Error('اختر تاريخ الاجتماع'));
    if (!data.periodId) return Promise.reject(new Error('اختر فترة الاجتماع'));
    return validateMeetingSlot(data.date, data.periodId, data.hallId, null).then(function () {
      var actor = actorInfo();
      return db().collection(COLLECTIONS.MEETINGS).add({
        title: title,
        hallId: data.hallId,
        date: data.date,
        periodId: data.periodId,
        organizer: String(data.organizer || '').trim(),
        notes: String(data.notes || '').trim(),
        status: 'scheduled',
        createdAt: serverTs(),
        createdBy: actor.userId
      }).then(function (ref) {
        logAudit('meeting_create', COLLECTIONS.MEETINGS, ref.id,
          'إنشاء اجتماع عارض: ' + title + ' — ' + data.date);
        return ref.id;
      });
    });
  }

  // تعديل اجتماع عارض. عند تغيير التاريخ أو الفترة أو القاعة تُطبَّق
  // نفس تحققات الإنشاء (ليس عطلة، القاعة حرة مع استثناء الاجتماع نفسه).
  // لا يغيّر الحالة أبداً.
  function updateMeeting(id, data) {
    try { requireWrite(); } catch (e) { return Promise.reject(e); }
    data = data || {};
    var meeting;
    return get(COLLECTIONS.MEETINGS, id).then(function (m) {
      if (!m) throw new Error('الاجتماع غير موجود');
      meeting = m;
      var newTitle = (data.title !== undefined) ? String(data.title).trim() : m.title;
      if (!newTitle) throw new Error('عنوان الاجتماع مطلوب');
      var newDate = data.date || m.date;
      var newPeriodId = data.periodId || m.periodId;
      var newHallId = (data.hallId === undefined) ? m.hallId : data.hallId;
      if (!newHallId) throw new Error('اختر قاعة الاجتماع');
      var slotChanged = (newDate !== m.date) || (newPeriodId !== m.periodId) || (newHallId !== m.hallId);
      if (!slotChanged) return null;
      return validateMeetingSlot(newDate, newPeriodId, newHallId, id, newDate === m.date);
    }).then(function () {
      var updateData = {};
      if (data.title !== undefined) updateData.title = String(data.title).trim();
      if (data.date) updateData.date = data.date;
      if (data.periodId) updateData.periodId = data.periodId;
      if (data.hallId !== undefined) updateData.hallId = data.hallId;
      if (data.organizer !== undefined) updateData.organizer = String(data.organizer).trim();
      if (data.notes !== undefined) updateData.notes = String(data.notes).trim();
      if (Object.keys(updateData).length === 0) return;
      return db().collection(COLLECTIONS.MEETINGS).doc(id).update(updateData).then(function () {
        logAudit('meeting_update', COLLECTIONS.MEETINGS, id,
          'تعديل اجتماع عارض: ' + (updateData.title || meeting.title));
      });
    });
  }

  // إلغاء اجتماع عارض: الحالة تصبح «ملغى» (تحرّر القاعة). الملاحظة
  // الممرَّرة تُلحق بملاحظات الاجتماع إن وُجدت.
  function cancelMeeting(id, note) {
    try { requireWrite(); } catch (e) { return Promise.reject(e); }
    var meeting;
    return get(COLLECTIONS.MEETINGS, id).then(function (m) {
      if (!m) throw new Error('الاجتماع غير موجود');
      meeting = m;
      var data = { status: 'cancelled' };
      if (typeof note === 'string' && note.trim()) {
        data.notes = (m.notes ? m.notes + '\n' : '') + 'إلغاء: ' + note.trim();
      }
      return db().collection(COLLECTIONS.MEETINGS).doc(id).update(data).then(function () {
        logAudit('meeting_cancel', COLLECTIONS.MEETINGS, id,
          'إلغاء اجتماع عارض: ' + m.title + ' — ' + m.date);
      });
    });
  }

  // حذف اجتماع عارض نهائياً.
  function deleteMeeting(id) {
    return remove(COLLECTIONS.MEETINGS, id).then(function () {
      logAudit('meeting_delete', COLLECTIONS.MEETINGS, id, 'حذف اجتماع عارض');
    });
  }

  // حضور المدرب: غيابه يحوّل الجلسة إلى «المدرب غائب»؛ حضوره يعيدها
  // إلى «مجدولة» فقط إن كانت بحالة «المدرب غائب» (لا يمسّ الحالات الأخرى).
  function recordTrainerAttendance(sessionId, present) {
    try { requireWrite(); } catch (e) { return Promise.reject(e); }
    return get(COLLECTIONS.SESSIONS, sessionId).then(function (s) {
      if (!s) throw new Error('الجلسة غير موجودة');
      var data = { trainerPresent: !!present };
      if (!present) {
        data.state = 'trainer-absent';
      } else if (s.state === 'trainer-absent') {
        data.state = 'scheduled';
      }
      return db().collection(COLLECTIONS.SESSIONS).doc(sessionId).update(data).then(function () {
        logAudit('trainer_attendance', COLLECTIONS.SESSIONS, sessionId,
          present ? 'المدرب حاضر' : 'المدرب غائب');
      });
    });
  }

  function setAttendance(sessionId, traineeId, status, note) {
    try { requireWrite(); } catch (e) { return Promise.reject(e); }
    if (ATTENDANCE_STATUSES.indexOf(status) === -1) {
      return Promise.reject(new Error('حالة الحضور غير صالحة'));
    }
    var data = { status: status, note: note || '' };
    return db().collection(COLLECTIONS.SESSIONS).doc(sessionId)
      .collection('attendance').doc(traineeId).set(data).then(function () {
        return get(COLLECTIONS.TRAINEES, traineeId).catch(function () { return null; });
      }).then(function (trainee) {
        logAudit('attendance', COLLECTIONS.SESSIONS, sessionId,
          'حضور متدرب ' + (trainee ? trainee.name : traineeId) + ': ' + (ATTENDANCE_LABELS[status] || status));
      });
  }

  // مسح تسجيل حضور متدرب في جلسة (إعادته إلى «بلا تسجيل») — تصحيح
  // تسجيل خاطئ بدل إجباره على حالة غير صحيحة. يُسجَّل في التدقيق.
  function clearAttendance(sessionId, traineeId) {
    try { requireWrite(); } catch (e) { return Promise.reject(e); }
    return db().collection(COLLECTIONS.SESSIONS).doc(sessionId)
      .collection('attendance').doc(traineeId).delete().then(function () {
        return get(COLLECTIONS.TRAINEES, traineeId).catch(function () { return null; });
      }).then(function (trainee) {
        logAudit('attendance', COLLECTIONS.SESSIONS, sessionId,
          'مسح تسجيل حضور متدرب ' + (trainee ? trainee.name : traineeId));
      });
  }

  function getSessionAttendance(sessionId) {
    return db().collection(COLLECTIONS.SESSIONS).doc(sessionId)
      .collection('attendance').get().then(function (snap) {
        var map = {};
        snap.forEach(function (doc) {
          var data = doc.data();
          data.traineeId = doc.id;
          map[doc.id] = data;
        });
        return map;
      });
  }

  // --- أجور المدربين والميزانية ---
  // حساب صرف: ثابت ← المبلغ؛ بالساعة ← الأجر × (عدد الجلسات × ساعات الجلسة).
  // ساعات الجلسة من الفترة (النهاية − البداية). بلا عقد ← 0.
  // بالساعة وبلا فترة ← 0 (لا يمكن الحساب دون مدة الجلسة).
  function trainerFeeDue(course, period) {
    if (!course || !course.trainerContract) return 0;
    var c = course.trainerContract;
    if (c.type === 'fixed') return Number(c.amount) || 0;
    if (c.type === 'hourly') {
      if (!period || !period.start || !period.end) return 0;
      var hours = (Number(course.sessionCount) || 0) * hoursBetween(period.start, period.end);
      return (Number(c.rate) || 0) * hours;
    }
    return 0;
  }

  // ملخص ميزانية الدورة. أجر المدرب المحسوب يظهر في حقل trainerFeeDue
  // منفصلاً — ولا يُضاف إلى totalSpent إن سُجّل أصلاً كمصروف (منعاً
  // للازدواج). الواجهة تعرضه سطراً مميزاً بفئة «أجور المدربين».
  function courseBudgetSummary(courseId) {
    return get(COLLECTIONS.COURSES, courseId).then(function (course) {
      if (!course) throw new Error('مجموعة التدريب غير موجودة');
      var periodP = course.periodId
        ? get(COLLECTIONS.PERIODS, course.periodId)
        : Promise.resolve(null);
      var expensesP = db().collection(COLLECTIONS.EXPENSES)
        .where('courseId', '==', courseId).get();
      return Promise.all([periodP, expensesP]).then(function (results) {
        var period = results[0];
        var expenses = toList(results[1]);
        var byCategory = {};
        var totalSpent = 0;
        var feeRecorded = false;
        expenses.forEach(function (e) {
          var amount = Number(e.amount) || 0;
          totalSpent += amount;
          byCategory[e.category] = (byCategory[e.category] || 0) + amount;
          if (e.category === TRAINER_FEE_CATEGORY) feeRecorded = true;
        });
        var computedFee = trainerFeeDue(course, period);
        var feeDue = feeRecorded ? 0 : computedFee;
        var allocated = Number(course.budget) || 0;
        return {
          allocated: allocated,
          byCategory: byCategory,
          totalSpent: totalSpent,
          remaining: allocated - totalSpent,
          expenses: expenses,
          trainerFeeDue: feeDue,
          trainerFeeAlreadyRecorded: feeRecorded,
          totalWithFees: totalSpent + feeDue,
          remainingWithFees: allocated - totalSpent - feeDue
        };
      });
    });
  }

  // --- الاشتراك المباشر (قوائم حيّة تُحدَّث خلال ثوانٍ) ---
  // cb تستقبل مصفوفة مستندات {id, ...data} عند كل تغيير.
  // تُرجع دالة إلغاء الاشتراك.
  function subscribe(col, cb, orderByField) {
    var q = db().collection(col);
    if (orderByField) q = q.orderBy(orderByField);
    return q.onSnapshot(function (snap) {
      cb(toList(snap));
    }, function (err) {
      console.warn('[تدريب] خطأ في الاشتراك المباشر (' + col + '):', err && err.message);
    });
  }

  // --- أيام العطلة الأسبوعية (v2.3 — W3) ---
  // إعداد مشترك بين كل المنسقين، مخزَّن في مستند meta/general
  // { weekendDays: [5, 6] } — يوم الأسبوع رقم (0 = الأحد … 6 =
  // السبت)، والافتراضي الجمعة + السبت. القراءة المتزامنة من ذاكرة
  // محلية (تُملأ عند أول طلب + مستمع حي يُبقيها محدَّثة) حتى
  // يقرأها أي عامل دفاعياً دون انتظار وعد.
  // ⚠️ القواعد: meta/general مسموح للمدير كتابةً ولأي مسجّل دخول
  // بملف نشط قراءةً (نُشرت القاعدة مع v2.3). عند الفشل يبقى
  // الافتراضي [5، 6] سارياً (سلوك آمن)، وفشل الحفظ يظهر للمستخدم
  // كخطأ صريح لا كنجاح وهمي.
  // الدوال العامة add/update ترفض META عمداً (انظر أعلاه)، لذا
  // تُكتب هنا مباشرة عبر doc().set كما يفعل auth.js لـ meta/setup.
  var DEFAULT_WEEKEND_DAYS = [5, 6];
  var weekendDaysCache = DEFAULT_WEEKEND_DAYS.slice();
  var weekendDaysLoadStarted = false;
  var weekendDaysLoading = null;
  var weekendListenerStarted = false;

  // تطبيع أيام العطلة: أرقام صحيحة 0–6 مميزة مرتبة؛ يوم واحد على
  // الأقل (القائمة الفارغة مرفوضة — مستهلكو الإعداد يعاملونها
  // كغياب إعداد ويعودون للافتراضي). غير صالح ← null.
  function normalizeWeekendDays(days) {
    if (!Array.isArray(days)) return null;
    var seen = {};
    var out = [];
    days.forEach(function (d) {
      var n = (typeof d === 'number') ? d : parseInt(d, 10);
      if (isFinite(n) && n >= 0 && n <= 6 && !seen[n]) { seen[n] = true; out.push(n); }
    });
    out.sort(function (a, b) { return a - b; });
    return out.length ? out : null;
  }

  // مستمع حي على meta/general يُبقي الذاكرة محدَّثة عند تغيير أي
  // منسق آخر للإعداد (يُبدأ مرة واحدة؛ الفشل صامت — القراءة
  // لمرة واحدة أعلاه تبقى المصدر).
  function startWeekendListener() {
    if (weekendListenerStarted) return;
    weekendListenerStarted = true;
    try {
      db().collection(COLLECTIONS.META).doc('general').onSnapshot(function (snap) {
        try {
          if (snap && snap.exists) {
            var days = normalizeWeekendDays((snap.data() || {}).weekendDays);
            if (days) weekendDaysCache = days;
          }
        } catch (e) { /* تبقى الذاكرة كما هي */ }
      });
    } catch (e) { /* بلا مستمع — لا شيء يتعطل */ }
  }

  // تحميل أيام العطلة من meta/general (وعد) — يحدّث الذاكرة ويبدأ
  // المستمع الحي. مستند غائب أو قراءة فاشلة ← الافتراضي.
  function loadWeekendDays() {
    if (weekendDaysLoading) return weekendDaysLoading;
    try {
      weekendDaysLoading = db().collection(COLLECTIONS.META).doc('general').get().then(function (snap) {
        weekendDaysLoading = null;
        if (snap && snap.exists) {
          var days = normalizeWeekendDays((snap.data() || {}).weekendDays);
          if (days) weekendDaysCache = days;
        }
        startWeekendListener();
        return weekendDaysCache.slice();
      }).catch(function (err) {
        weekendDaysLoading = null;
        console.warn('[تدريب] تعذّر قراءة أيام العطلة الأسبوعية — يُستخدم الافتراضي (جمعة + سبت):', err && err.message);
        return weekendDaysCache.slice();
      });
    } catch (err) {
      weekendDaysLoading = null;
      return Promise.resolve(weekendDaysCache.slice());
    }
    return weekendDaysLoading;
  }

  // قراءة متزامنة من الذاكرة (افتراضي [5، 6])؛ أول استدعاء يبدأ
  // التحميل في الخلفية. نسخة جديدة في كل مرة (لا تُعدَّل الذاكرة).
  function getWeekendDays() {
    if (!weekendDaysLoadStarted) {
      weekendDaysLoadStarted = true;
      try { loadWeekendDays(); } catch (e) { /* الافتراضي يبقى */ }
    }
    return weekendDaysCache.slice();
  }

  // حفظ أيام العطلة الأسبوعية في meta/general (مدير فقط عبر
  // الشاشة؛ هنا فحص الكتابة العام). الذاكرة تُحدَّث بعد نجاح
  // الكتابة فقط — الفشل (ومنها رفض القواعد) يرفض الوعد ولا يغيّر
  // شيئاً. تُسجَّل في سجل التدقيق.
  function setWeekendDays(days) {
    var normalized = normalizeWeekendDays(days);
    if (!normalized) {
      return Promise.reject(new Error('اختر يوماً واحداً على الأقل للعطلة الأسبوعية'));
    }
    try { requireWrite(); } catch (e) { return Promise.reject(e); }
    return db().collection(COLLECTIONS.META).doc('general').set(
      { weekendDays: normalized }, { merge: true }
    ).then(function () {
      weekendDaysCache = normalized;
      startWeekendListener();
      logAudit('update', COLLECTIONS.META, 'general', 'تعديل أيام العطلة الأسبوعية');
      return weekendDaysCache.slice();
    });
  }

  // --- ترحيل أرقام المجموعات لمرة واحدة (v2.3.1) ---
  // المشكلة: كل المجموعات التي أُنشئت قبل v2.3 بلا groupNumber
  // مخزَّن، فأرقامها مشتقة من ترتيب الإنشاء — أي إضافة أو حذف يعيد
  // ترقيم القائمة كلها أمام المستخدم، وقد يتصادم رقم مشتق مع رقم
  // مخزَّن (مجموعتان بالرقم نفسه). الترحيل يثبّت الأرقام: عند أول
  // دخول مدير بعد v2.3.1، يُكتب لكل دورة بلا رقم مخزَّن رقمها
  // المشتق الحالي (والرمز المشتق إن غاب) في مستندها — فتصبح
  // الأرقام ثابتة إلى الأبد. الخوارزمية هي نفسها في App.groupNumber
  // و App.displayCode (ترتيب الإنشاء، المخزَّن يُحترم، المشتق أصغر
  // رقم حر) فالأرقام المثبتة تطابق المعروض اليوم تماماً.
  // آمن للتكرار: يكتب فقط ما ينقصه الرقم أو الرمز؛ وعلامة مرة
  // واحدة في meta/general (migratedGroupNumbers: true) تمنع إعادة
  // التشغيل. مدير فقط (كتابة meta/general مقصورة على المدير في
  // القواعد). سجل تدقيق واحد ملخَّص — لا إدخال لكل دورة.
  // ملاحظة: علامة meta تُكتب مع بيانات المستند الحالية كاملةً
  // (set مع merge) حتى لا تُمحى أيام العطلة المخزَّنة فيه.
  var groupNumbersMigrationStarted = false;

  function createdMsValue(v) {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    if (typeof v.toMillis === 'function') { try { return v.toMillis(); } catch (e) { return 0; } }
    if (typeof v.seconds === 'number') return v.seconds * 1000;
    if (typeof v === 'string') { var ms = Date.parse(v); return isNaN(ms) ? 0 : ms; }
    return 0;
  }

  function migrateGroupNumbers() {
    if (groupNumbersMigrationStarted) return Promise.resolve({ already: true });
    groupNumbersMigrationStarted = true;
    var profile = currentProfile();
    if (!profile || profile.role !== 'admin') return Promise.resolve({ skipped: true });
    var generalRef = db().collection(COLLECTIONS.META).doc('general');
    return generalRef.get().then(function (snap) {
      var generalData = (snap && snap.exists) ? (snap.data() || {}) : {};
      if (generalData.migratedGroupNumbers === true) return { already: true };
      return list(COLLECTIONS.COURSES).then(function (courses) {
        var sorted = courses.slice().sort(function (a, b) {
          var d = createdMsValue(a.createdAt) - createdMsValue(b.createdAt);
          if (d) return d;
          return String(a.id || '') < String(b.id || '') ? -1 : String(a.id || '') > String(b.id || '') ? 1 : 0;
        });
        var usedNumbers = {};
        var usedCodes = {};
        sorted.forEach(function (c) {
          if (typeof c.groupNumber === 'number' && isFinite(c.groupNumber) && c.groupNumber >= 1) {
            usedNumbers[Math.floor(c.groupNumber)] = true;
          }
          if (typeof c.code === 'string') {
            var m = /^دور-(\d+)$/.exec(c.code.trim());
            if (m) usedCodes[parseInt(m[1], 10)] = true;
          }
        });
        var batch = db().batch();
        var count = 0;
        sorted.forEach(function (c) {
          var patch = {};
          if (!(typeof c.groupNumber === 'number' && isFinite(c.groupNumber) && c.groupNumber >= 1)) {
            var n = 1;
            while (usedNumbers[n]) n++;
            usedNumbers[n] = true;
            patch.groupNumber = n;
          }
          if (!(typeof c.code === 'string' && c.code.trim())) {
            var k = 1;
            while (usedCodes[k]) k++;
            usedCodes[k] = true;
            patch.code = 'دور-' + (k < 10 ? '0' : '') + k;
          }
          if (Object.keys(patch).length) {
            batch.update(db().collection(COLLECTIONS.COURSES).doc(c.id), patch);
            count++;
          }
        });
        var flagData = Object.assign({}, generalData, { migratedGroupNumbers: true });
        batch.set(generalRef, flagData, { merge: true });
        return batch.commit().then(function () {
          if (count > 0) {
            logAudit('update', COLLECTIONS.COURSES, 'migration',
              'ترحيل أرقام المجموعات: ثُبّت الرقم والرمز لـ ' + count + ' مجموعة');
          }
          return { migrated: count };
        });
      });
    }).catch(function (err) {
      console.warn('[تدريب] تعذّر ترحيل أرقام المجموعات — سيُعاد المحاولة عند الدخول التالي:', err && err.message);
      groupNumbersMigrationStarted = false;
      return { error: true };
    });
  }

  window.TadreebDB = {
    COLLECTIONS: COLLECTIONS,
    ATTENDANCE_STATUSES: ATTENDANCE_STATUSES,
    SESSION_STATES: SESSION_STATES,
    MEETING_STATUSES: MEETING_STATUSES,
    COURSE_STATUSES: COURSE_STATUSES,
    list: list,
    get: get,
    add: add,
    update: update,
    remove: remove,
    seedDefaults: seedDefaults,
    generateSchedule: generateSchedule,
    rescheduleCoursePreview: rescheduleCoursePreview,
    rescheduleCourse: rescheduleCourse,
    courseDeletePreview: courseDeletePreview,
    deleteCourse: deleteCourse,
    checkHallAvailability: checkHallAvailability,
    mergeSessions: mergeSessions,
    splitSession: splitSession,
    setSessionState: setSessionState,
    postponeSession: postponeSession,
    markSessionHoliday: markSessionHoliday,
    updateSession: updateSession,
    createMeeting: createMeeting,
    updateMeeting: updateMeeting,
    cancelMeeting: cancelMeeting,
    deleteMeeting: deleteMeeting,
    recordTrainerAttendance: recordTrainerAttendance,
    setAttendance: setAttendance,
    clearAttendance: clearAttendance,
    getSessionAttendance: getSessionAttendance,
    trainerFeeDue: trainerFeeDue,
    courseBudgetSummary: courseBudgetSummary,
    logAudit: logAudit,
    subscribe: subscribe,
    // أنواع القاعات والدورات + أيام العطلة الأسبوعية (v2.3 — W3؛
    // v2.3.1: نوع مختلط + ترحيل أرقام المجموعات).
    HALL_TYPES: HALL_TYPES,
    COURSE_TYPES: COURSE_TYPES,
    HALL_TYPE_LABELS: HALL_TYPE_LABELS,
    COURSE_TYPE_LABELS: COURSE_TYPE_LABELS,
    hallTypeOf: hallTypeOf,
    courseTypeOf: courseTypeOf,
    hallTypeForCourseType: hallTypeForCourseType,
    matchingHalls: matchingHalls,
    mixedAdminCount: mixedAdminCount,
    sessionCourseType: sessionCourseType,
    migrateGroupNumbers: migrateGroupNumbers,
    DEFAULT_WEEKEND_DAYS: DEFAULT_WEEKEND_DAYS,
    getWeekendDays: getWeekendDays,
    loadWeekendDays: loadWeekendDays,
    setWeekendDays: setWeekendDays,
    // أدوات تواريخ مكشوفة للواجهة (تنسيق موحّد YYYY-MM-DD).
    dateStr: dateStr,
    parseDate: parseDate,
    todayStr: todayStr
  };
})();
