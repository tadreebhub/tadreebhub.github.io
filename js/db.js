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
    TRAINEES: 'trainees',
    TRAINERS: 'trainers',
    DIRECTORATES: 'directorates',
    HALLS: 'halls',
    PERIODS: 'periods',
    HOLIDAYS: 'holidays',
    EXPENSES: 'expenses',
    BUDGET_CATEGORIES: 'budgetCategories',
    AUDIT: 'audit'
  };

  // حالات المتدرب — متميزة تماماً كما سمّاها بدر:
  // passed = ناجح في الدورة، absent = غائب، never-attended = لم يحضر،
  // cancelled = ملغى الاسم. وحالة الحضور في الجلسة: present/absent/excused
  // (موجود/غائب/معتذر) — معتذر مع مبرر في حقل note.
  var TRAINEE_STATUSES = ['passed', 'absent', 'never-attended', 'cancelled'];
  var ATTENDANCE_STATUSES = ['present', 'absent', 'excused'];
  var SESSION_STATES = ['scheduled', 'done', 'cancelled', 'trainer-absent'];
  var COURSE_STATUSES = ['active', 'completed', 'cancelled'];

  // تسميات عربية لسجل التدقيق (القيم الإنكليزية لا تظهر للمستخدم أبداً).
  var SESSION_STATE_LABELS = { scheduled: 'مجدولة', done: 'مكتملة', cancelled: 'ملغاة', 'trainer-absent': 'غياب المدرب' };
  var ATTENDANCE_LABELS = { present: 'موجود', absent: 'غائب', excused: 'معتذر' };
  var TRAINEE_STATUS_LABELS = { passed: 'ناجح في الدورة', absent: 'غائب', 'never-attended': 'لم يحضر', cancelled: 'ملغى الاسم' };

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
      logAudit('create', col, ref.id, 'إنشاء: ' + (describe(data) || ref.id));
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
      logAudit('update', col, id, 'تعديل: ' + (describe(data) || id));
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
      logAudit('delete', col, id, 'حذف: ' + id);
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

    var course, holidaysSet, existingDates, existingCount, halls, occupied;

    return get(COLLECTIONS.COURSES, courseId).then(function (c) {
      if (!c) throw new Error('الدورة غير موجودة');
      if (!Array.isArray(c.days) || c.days.length === 0) {
        throw new Error('الدورة بلا أيام أسبوعية — حدّد أيام الدورة أولاً');
      }
      if (!c.periodId) throw new Error('الدورة بلا فترة تدريبية — حدّد الفترة أولاً');
      if (!c.sessionCount || c.sessionCount < 1) {
        throw new Error('عدد جلسات الدورة غير محدد');
      }
      course = c;
      return Promise.all([
        list(COLLECTIONS.HOLIDAYS),
        db().collection(COLLECTIONS.SESSIONS).where('courseId', '==', courseId).get(),
        db().collection(COLLECTIONS.SESSIONS)
          .where('date', '>=', startS).where('date', '<=', endS).get(),
        list(COLLECTIONS.HALLS, 'name')
      ]);
    }).then(function (results) {
      holidaysSet = new Set(results[0].map(function (h) { return h.date; }));
      existingDates = new Set();
      existingCount = 0;
      results[1].forEach(function (doc) {
        existingDates.add(doc.data().date);
        existingCount++;
      });
      occupied = {}; // "date|periodId" -> Set(hallId)
      results[2].forEach(function (doc) {
        var s = doc.data();
        if (!s.hallId) return;
        var key = s.date + '|' + s.periodId;
        if (!occupied[key]) occupied[key] = new Set();
        occupied[key].add(s.hallId);
      });
      halls = results[3];

      var created = 0;
      var skippedHolidays = 0;
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

        // أول قاعة حرة في ذلك التاريخ والفترة.
        var hallId = null;
        var key = ds + '|' + course.periodId;
        var busy = occupied[key] || new Set();
        for (var h = 0; h < halls.length; h++) {
          if (!busy.has(halls[h].id)) { hallId = halls[h].id; break; }
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
          periodId: course.periodId,
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
        return { created: 0, skippedHolidays: skippedHolidays, unassignedHalls: unassignedHalls };
      }
      return batch.commit().then(function () {
        logAudit('schedule_generate', COLLECTIONS.COURSES, courseId,
          'توليد جدول: ' + created + ' جلسة جديدة، ' + skippedHolidays + ' يوم عطلة متخطى');
        return { created: created, skippedHolidays: skippedHolidays, unassignedHalls: unassignedHalls };
      });
    });
  }

  // --- توفر القاعات ---
  function checkHallAvailability(date, periodId) {
    var hallsP = list(COLLECTIONS.HALLS, 'name');
    var sessionsP = db().collection(COLLECTIONS.SESSIONS)
      .where('date', '==', date).where('periodId', '==', periodId).get();
    return Promise.all([hallsP, sessionsP]).then(function (results) {
      var halls = results[0];
      var byHall = {}; // hallId -> courseId
      results[1].forEach(function (doc) {
        var s = doc.data();
        if (s.hallId && s.state !== 'cancelled') byHall[s.hallId] = s.courseId;
      });
      var courseIds = Object.keys(byHall).map(function (k) { return byHall[k]; });
      var uniqueIds = courseIds.filter(function (v, i, a) { return a.indexOf(v) === i; });
      return Promise.all(uniqueIds.map(function (id) { return get(COLLECTIONS.COURSES, id); }))
        .then(function (courses) {
          var names = {};
          courses.forEach(function (c) { if (c) names[c.id] = c.name; });
          return halls.map(function (hall) {
            var courseId = byHall[hall.id] || null;
            return {
              hallId: hall.id,
              hallName: hall.name,
              free: !courseId,
              sessionCourse: courseId ? (names[courseId] || courseId) : null
            };
          });
        });
    });
  }

  // --- دمج جلستين ---
  // الأولوية عند تعارض الحضور لنفس المتدرب: حاضر > معتذر > غائب.
  function mergeSessions(keepId, removeId) {
    try { requireWrite(); } catch (e) { return Promise.reject(e); }
    if (keepId === removeId) return Promise.reject(new Error('لا يمكن دمج جلسة مع نفسها'));
    var priority = { present: 3, excused: 2, absent: 1 };

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

  function setTraineeStatus(traineeId, status, notes) {
    try { requireWrite(); } catch (e) { return Promise.reject(e); }
    if (status !== null && TRAINEE_STATUSES.indexOf(status) === -1) {
      return Promise.reject(new Error('حالة المتدرب غير صالحة'));
    }
    var data = { status: status };
    if (typeof notes === 'string') data.notes = notes;
    return db().collection(COLLECTIONS.TRAINEES).doc(traineeId).update(data).then(function () {
      logAudit('trainee_status', COLLECTIONS.TRAINEES, traineeId,
        'تغيير حالة المتدرب إلى: ' + (status ? (TRAINEE_STATUS_LABELS[status] || status) : 'بلا حالة'));
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
      if (!course) throw new Error('الدورة غير موجودة');
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

  window.TadreebDB = {
    COLLECTIONS: COLLECTIONS,
    TRAINEE_STATUSES: TRAINEE_STATUSES,
    ATTENDANCE_STATUSES: ATTENDANCE_STATUSES,
    SESSION_STATES: SESSION_STATES,
    COURSE_STATUSES: COURSE_STATUSES,
    list: list,
    get: get,
    add: add,
    update: update,
    remove: remove,
    seedDefaults: seedDefaults,
    generateSchedule: generateSchedule,
    checkHallAvailability: checkHallAvailability,
    mergeSessions: mergeSessions,
    setSessionState: setSessionState,
    recordTrainerAttendance: recordTrainerAttendance,
    setAttendance: setAttendance,
    getSessionAttendance: getSessionAttendance,
    setTraineeStatus: setTraineeStatus,
    trainerFeeDue: trainerFeeDue,
    courseBudgetSummary: courseBudgetSummary,
    logAudit: logAudit,
    subscribe: subscribe,
    // أدوات تواريخ مكشوفة للواجهة (تنسيق موحّد YYYY-MM-DD).
    dateStr: dateStr,
    parseDate: parseDate,
    todayStr: todayStr
  };
})();
