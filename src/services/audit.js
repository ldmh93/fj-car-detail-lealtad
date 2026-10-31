'use strict';

const { db, now } = require('../db');

function log({ userId = null, customerId = null, action, details = null }) {
  return db.run(
    'INSERT INTO audit_log (business_user_id, customer_id, action, details, created_at) VALUES (?, ?, ?, ?, ?)',
    userId, customerId, action, details, now()
  );
}

function forCustomer(customerId, limit = 30) {
  return db.all(
    `SELECT a.*, u.display_name AS user_name FROM audit_log a
     LEFT JOIN business_users u ON u.id = a.business_user_id
     WHERE a.customer_id = ? ORDER BY a.id DESC LIMIT ?`,
    customerId, limit
  );
}

module.exports = { log, forCustomer };
