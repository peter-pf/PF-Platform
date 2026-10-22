-- Migration 0002: Unique index on password_resets.token_hash
-- This enforces uniqueness at the database level so two concurrent inserts
-- of the same hash (astronomically unlikely with 32-byte random tokens, but
-- worth enforcing) fail with a constraint error rather than producing two
-- valid rows. Also improves lookup performance for the token consume query.
CREATE UNIQUE INDEX IF NOT EXISTS idx_password_resets_token_hash
  ON password_resets(token_hash);
