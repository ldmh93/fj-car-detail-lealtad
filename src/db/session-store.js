'use strict';

const session = require('express-session');
const { db } = require('./index');

/** Almacén de sesiones de express-session sobre la misma base de datos. */
class DbSessionStore extends session.Store {
  expiry(sess) {
    const exp = sess && sess.cookie && sess.cookie.expires;
    return exp ? new Date(exp).getTime() : Date.now() + 24 * 60 * 60 * 1000;
  }

  get(sid, cb) {
    db.get('SELECT data FROM sessions WHERE sid = ? AND expires_at > ?', sid, Date.now())
      .then((row) => cb(null, row ? JSON.parse(row.data) : null))
      .catch(cb);
  }

  set(sid, sess, cb = () => {}) {
    db.run(
      'INSERT INTO sessions (sid, data, expires_at) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at',
      sid,
      JSON.stringify(sess),
      this.expiry(sess)
    )
      .then(() => {
        // Limpieza ocasional de sesiones vencidas (no hay tareas programadas en Vercel).
        if (Math.random() < 0.02) db.run('DELETE FROM sessions WHERE expires_at <= ?', Date.now()).catch(() => {});
        cb(null);
      })
      .catch(cb);
  }

  touch(sid, sess, cb = () => {}) {
    db.run('UPDATE sessions SET expires_at = ? WHERE sid = ?', this.expiry(sess), sid)
      .then(() => cb(null))
      .catch(cb);
  }

  destroy(sid, cb = () => {}) {
    db.run('DELETE FROM sessions WHERE sid = ?', sid)
      .then(() => cb(null))
      .catch(cb);
  }
}

module.exports = DbSessionStore;
