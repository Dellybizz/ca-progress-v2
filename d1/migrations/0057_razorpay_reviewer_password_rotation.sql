-- Rotate the temporary Razorpay reviewer credential. Plaintext is not stored.
PRAGMA foreign_keys = ON;

UPDATE reviewer_credentials
SET password_salt='Uzw39EBOqz26HkBuR8zfnQ',
    password_hash='z7Wwwc6xIbgm6qCQNBuya6RaPRv5heY3W9exb_Rweoc',
    password_iterations=310000,
    failed_attempts=0,
    locked_until=NULL,
    updated_at=CURRENT_TIMESTAMP
WHERE username_normalized='razorpay-review'
  AND active=1;

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0057','rotate temporary Razorpay reviewer password','hotfix/dark-mode-ae0cb36d');
