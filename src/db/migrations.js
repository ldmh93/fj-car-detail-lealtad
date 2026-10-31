'use strict';

// Cada migración se aplica una sola vez, en orden. Para cambiar el esquema agrega
// una nueva entrada al final; no modifiques las que ya se aplicaron.
module.exports = [
  {
    version: 1,
    sql: `
      CREATE TABLE business_users (
        id INTEGER PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'staff')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
        created_at TEXT NOT NULL,
        last_login_at TEXT
      );

      CREATE TABLE customers (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_customers_name ON customers (name COLLATE NOCASE);

      CREATE TABLE loyalty_cards (
        id INTEGER PRIMARY KEY,
        customer_id INTEGER NOT NULL UNIQUE REFERENCES customers (id) ON DELETE CASCADE,
        stamps INTEGER NOT NULL DEFAULT 0 CHECK (stamps BETWEEN 0 AND 10),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reward_pending')),
        cycle INTEGER NOT NULL DEFAULT 1,
        qr_token TEXT NOT NULL UNIQUE,
        qr_token_created_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE stamp_events (
        id INTEGER PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
        card_id INTEGER NOT NULL REFERENCES loyalty_cards (id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('stamp', 'correction', 'reward_issued', 'reward_redeemed', 'reward_voided')),
        delta INTEGER NOT NULL DEFAULT 0,
        stamps_after INTEGER NOT NULL,
        cycle INTEGER NOT NULL,
        reason TEXT,
        source TEXT,
        business_user_id INTEGER REFERENCES business_users (id),
        request_id TEXT UNIQUE,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_stamp_events_customer ON stamp_events (customer_id, created_at);
      CREATE INDEX idx_stamp_events_created ON stamp_events (created_at);

      CREATE TABLE rewards (
        id INTEGER PRIMARY KEY,
        card_id INTEGER NOT NULL REFERENCES loyalty_cards (id) ON DELETE CASCADE,
        customer_id INTEGER NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
        cycle INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'redeemed', 'voided')),
        issued_at TEXT NOT NULL,
        issued_by INTEGER REFERENCES business_users (id),
        redeemed_at TEXT,
        redeemed_by INTEGER REFERENCES business_users (id)
      );
      -- Una tarjeta nunca puede tener dos recompensas disponibles al mismo tiempo.
      CREATE UNIQUE INDEX idx_rewards_one_available ON rewards (card_id) WHERE status = 'available';
      CREATE INDEX idx_rewards_customer ON rewards (customer_id);

      CREATE TABLE nfc_tags (
        id INTEGER PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        label TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
        created_at TEXT NOT NULL,
        created_by INTEGER REFERENCES business_users (id),
        revoked_at TEXT,
        revoked_by INTEGER REFERENCES business_users (id)
      );
      CREATE INDEX idx_nfc_tags_customer ON nfc_tags (customer_id);

      -- Registro de operaciones administrativas que no cambian sellos
      -- (NFC, regeneración de QR, restablecer contraseña, accesos).
      CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY,
        business_user_id INTEGER REFERENCES business_users (id),
        customer_id INTEGER REFERENCES customers (id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        details TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_audit_log_created ON audit_log (created_at);

      CREATE TABLE sessions (
        sid TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX idx_sessions_expires ON sessions (expires_at);
    `,
  },
  {
    // Nombre sin acentos y en minúsculas para que "maria" encuentre a "María".
    // Los registros existentes se completan al arrancar (ver db/index.js).
    version: 2,
    sql: `
      ALTER TABLE customers ADD COLUMN name_search TEXT NOT NULL DEFAULT '';
      CREATE INDEX idx_customers_name_search ON customers (name_search);
    `,
  },
];
