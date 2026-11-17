CREATE TABLE email_login_codes (
  uid TEXT PRIMARY KEY,
  auth_time BIGINT NOT NULL,
  email TEXT NOT NULL,
  digest TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts INTEGER NOT NULL DEFAULT 0,
  used_at TIMESTAMPTZ
);

CREATE TABLE email_login_delivery_limits (
  period TEXT PRIMARY KEY,
  available_at TIMESTAMPTZ NOT NULL,
  sent INTEGER NOT NULL
);
