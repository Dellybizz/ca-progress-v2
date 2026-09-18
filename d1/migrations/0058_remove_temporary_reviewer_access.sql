-- Retire temporary Razorpay reviewer credentials now that guest mode is used for review.
PRAGMA foreign_keys = ON;

DELETE FROM reviewer_credentials
WHERE username_normalized='razorpay-review';

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0058','remove temporary Razorpay reviewer access','hotfix/dark-mode-ae0cb36d');
