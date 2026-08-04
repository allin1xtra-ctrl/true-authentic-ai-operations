CREATE TABLE IF NOT EXISTS account_setup_codes (
  email text PRIMARY KEY,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  failed_attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamptz
);

CREATE INDEX IF NOT EXISTS account_setup_codes_expiry_idx ON account_setup_codes(expires_at);
