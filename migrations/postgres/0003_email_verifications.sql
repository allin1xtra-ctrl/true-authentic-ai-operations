CREATE TABLE IF NOT EXISTS email_verifications (
  id uuid PRIMARY KEY,
  normalized_email text NOT NULL,
  code_hash text NOT NULL,
  purpose text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  invalidated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  request_ip_hash text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS email_verifications_one_active_idx
  ON email_verifications(normalized_email, purpose)
  WHERE consumed_at IS NULL AND invalidated_at IS NULL;
CREATE INDEX IF NOT EXISTS email_verifications_email_rate_idx
  ON email_verifications(normalized_email, created_at DESC);
CREATE INDEX IF NOT EXISTS email_verifications_ip_rate_idx
  ON email_verifications(request_ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS email_verifications_expiry_idx
  ON email_verifications(expires_at);
