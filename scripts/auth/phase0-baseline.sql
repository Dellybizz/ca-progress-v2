-- Read-only authentication migration baseline. Results contain counts, never user details.
PRAGMA foreign_key_check;

SELECT 'app_users' AS metric, COUNT(*) AS value FROM app_users;
SELECT 'active_users' AS metric, COUNT(*) AS value FROM app_users WHERE account_state='active';
SELECT 'profiles' AS metric, COUNT(*) AS value FROM profiles;
SELECT 'auth_identities' AS metric, COUNT(*) AS value FROM auth_identities;
SELECT 'google_identities' AS metric, COUNT(*) AS value FROM auth_identities WHERE provider='google';
SELECT 'linkedin_identities' AS metric, COUNT(*) AS value FROM auth_identities WHERE provider='linkedin_oidc';
SELECT 'sessions' AS metric, COUNT(*) AS value FROM sessions;
SELECT 'active_sessions' AS metric, COUNT(*) AS value FROM sessions WHERE revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP;
SELECT 'guest_migrations' AS metric, COUNT(*) AS value FROM guest_account_migrations;
SELECT 'chapter_progress' AS metric, COUNT(*) AS value FROM chapter_progress;
SELECT 'progress_events' AS metric, COUNT(*) AS value FROM progress_events;
SELECT 'daily_plans' AS metric, COUNT(*) AS value FROM daily_plans;
SELECT 'study_sessions' AS metric, COUNT(*) AS value FROM study_sessions;
SELECT 'notes' AS metric, COUNT(*) AS value FROM notes;
SELECT 'uploaded_resources' AS metric, COUNT(*) AS value FROM uploaded_resources;

SELECT 'orphaned_profiles' AS finding, COUNT(*) AS value FROM profiles p LEFT JOIN app_users u ON u.user_id=p.user_id WHERE u.user_id IS NULL;
SELECT 'orphaned_identities' AS finding, COUNT(*) AS value FROM auth_identities i LEFT JOIN app_users u ON u.user_id=i.application_user_id WHERE u.user_id IS NULL;
SELECT 'orphaned_sessions' AS finding, COUNT(*) AS value FROM sessions s LEFT JOIN app_users u ON u.user_id=s.application_user_id WHERE u.user_id IS NULL;
SELECT 'duplicate_provider_subjects' AS finding, COUNT(*) AS value FROM (SELECT provider,provider_user_id FROM auth_identities GROUP BY provider,provider_user_id HAVING COUNT(*)>1);
SELECT 'duplicate_app_user_ids' AS finding, COUNT(*) AS value FROM (SELECT user_id FROM app_users GROUP BY user_id HAVING COUNT(*)>1);
SELECT 'password_migration_applied' AS metric, COUNT(*) AS value FROM _ca_schema_migrations WHERE version='0068';
