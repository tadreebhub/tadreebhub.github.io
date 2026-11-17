// notes.js — ملاحظات حرة على أي شيء في منصة تدريب (Badr 17:36).
// مجموعة notes: { entityType, entityId, text, authorId, authorName, ts, tsMs }
// entityType: course | session | trainee | trainer | hall | attendance | expense
//             | directorate | period | holiday | group
// entityId: معرّف السجل؛ لسجل الحضور يكون "sessionId:traineeId".
// الفرز يتم على العميل (tsMs) لتجنّب الحاجة إلى فهرس مركّب في Firestore.
(function () {
  'use strict';

  var ENTITY_LABELS = {
    course: 'الدورة',
    session: 'الجلسة',
    trainee: 'المتدرب',
    trainer: 'المدرب',
    hall: 'القاعة',
    attendance: 'سجل الحضور',
    expense: 'بند المصاريف',
    directorate: 'المديرية',
    period: 'الفترة التدريبية',
    holiday: 'يوم العطلة',
    group: 'المجموعة التدريبية'
  };

  function db() {
    if (window.Tadreeb && typeof window.Tadreeb.getDb === 'function') return window.Tadreeb.getDb();
    if (window.Tadreeb && window.Tadreeb.db) return window.Tadreeb.db;
    throw new Error('قاعدة البيانات غير مهيأة');
  }

  function requireWrite() {
    if (!window.TadreebAuth || !window.TadreebAuth.canWrite()) {
      throw new Error('ليس لديك صلاحية للكتابة');
    }
  }

  function currentAuthor() {
    var profile = window.TadreebAuth ? window.TadreebAuth.getCurrentProfile() : null;
    var user = window.Tadreeb && window.Tadreeb.auth ? window.Tadreeb.auth.currentUser : null;
    return {
      authorId: user ? user.uid : null,
      authorName: profile ? profile.username : (user && user.email ? user.email : 'مستخدم')
    };
  }

  function audit(action, entityId, details) {
    if (window.TadreebDB && typeof window.TadreebDB.logAudit === 'function') {
      window.TadreebDB.logAudit(action, 'notes', entityId, details);
    }
  }

  function sortDesc(list) {
    return list.sort(function (a, b) { return (b.tsMs || 0) - (a.tsMs || 0); });
  }

  function addNote(entityType, entityId, text) {
    requireWrite();
    text = (text || '').trim();
    if (!text) return Promise.reject(new Error('نص الملاحظة فارغ'));
    if (!ENTITY_LABELS[entityType]) return Promise.reject(new Error('نوع السجل غير معروف'));
    var author = currentAuthor();
    var data = {
      entityType: entityType,
      entityId: String(entityId),
      text: text,
      authorId: author.authorId,
      authorName: author.authorName,
      ts: firebase.firestore.FieldValue.serverTimestamp(),
      tsMs: Date.now()
    };
    return db().collection('notes').add(data).then(function (ref) {
      audit('note_add', ref.id, 'ملاحظة على ' + ENTITY_LABELS[entityType] + ': ' + text.slice(0, 80));
      return ref.id;
    });
  }

  function listNotes(entityType, entityId) {
    return db().collection('notes')
      .where('entityType', '==', entityType)
      .where('entityId', '==', String(entityId))
      .get()
      .then(function (snap) {
        var out = [];
        snap.forEach(function (d) { var v = d.data(); v.id = d.id; out.push(v); });
        return sortDesc(out);
      });
  }

  function subscribeNotes(entityType, entityId, cb) {
    return db().collection('notes')
      .where('entityType', '==', entityType)
      .where('entityId', '==', String(entityId))
      .onSnapshot(function (snap) {
        var out = [];
        snap.forEach(function (d) { var v = d.data(); v.id = d.id; out.push(v); });
        cb(sortDesc(out));
      }, function (err) {
        if (window.console) console.warn('notes subscribe:', err);
      });
  }

  function removeNote(noteId) {
    requireWrite();
    return db().collection('notes').doc(noteId).delete().then(function () {
      audit('note_delete', noteId, 'حذف ملاحظة');
    });
  }

  window.TadreebNotes = {
    addNote: addNote,
    listNotes: listNotes,
    subscribeNotes: subscribeNotes,
    removeNote: removeNote,
    ENTITY_LABELS: ENTITY_LABELS
  };
})();
