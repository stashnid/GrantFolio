CREATE TABLE jar_orders (
  case_id UUID PRIMARY KEY REFERENCES cases(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE CHECK (code ~ '^GF-[0-9A-F]{10}$'),
  amount_kopecks INTEGER NOT NULL DEFAULT 500 CHECK (amount_kopecks = 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  manual_unlocked_at TIMESTAMPTZ
);

CREATE TABLE jar_payments (
  id TEXT PRIMARY KEY,
  account TEXT NOT NULL,
  transaction_time TIMESTAMPTZ NOT NULL,
  amount BIGINT NOT NULL,
  currency INTEGER NOT NULL,
  comment TEXT NOT NULL,
  description TEXT NOT NULL,
  code TEXT,
  status TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
