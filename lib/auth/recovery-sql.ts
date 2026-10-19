// These statements execute together in one atomic D1 batch. The unique claim prevents
// two requests from using the same proof, even if both read it before either writes.
export const claimRecoverySql=`UPDATE password_recovery_proofs SET consumed_by=?1 WHERE token_hash=?2 AND user_id=?3 AND consumed_by IS NULL
 AND julianday(expires_at)>julianday('now')
 AND EXISTS(SELECT 1 FROM password_credentials pc JOIN app_users u ON u.user_id=pc.user_id JOIN auth_identities i ON i.application_user_id=u.user_id
 WHERE pc.user_id=password_recovery_proofs.user_id AND pc.password_hash=password_recovery_proofs.credential_hash
 AND u.account_state='active' AND i.identity_id=password_recovery_proofs.identity_id AND i.provider IN ('google','linkedin_oidc'))`;
export const updateRecoveryPasswordSql=`UPDATE password_credentials SET salt=?1,password_hash=?2,iterations=?3,updated_at=CURRENT_TIMESTAMP
 WHERE user_id=?4 AND EXISTS(SELECT 1 FROM password_recovery_proofs p WHERE p.token_hash=?5 AND p.user_id=?4 AND p.consumed_by=?6 AND p.credential_hash=password_credentials.password_hash)
 RETURNING user_id`;
export const revokeRecoverySessionsSql=`UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE application_user_id=?1 AND revoked_at IS NULL
 AND EXISTS(SELECT 1 FROM password_recovery_proofs p WHERE p.token_hash=?2 AND p.user_id=?1 AND p.consumed_by=?3)`;
export const invalidateRecoveryNativeSql=`UPDATE native_auth_transactions SET consumed_at=CURRENT_TIMESTAMP WHERE application_user_id=?1 AND consumed_at IS NULL
 AND EXISTS(SELECT 1 FROM password_recovery_proofs p WHERE p.token_hash=?2 AND p.user_id=?1 AND p.consumed_by=?3)`;
export const invalidateRecoveryProofsSql=`UPDATE password_recovery_proofs SET consumed_by=?1 WHERE user_id=?2 AND consumed_by IS NULL
 AND EXISTS(SELECT 1 FROM password_recovery_proofs p WHERE p.token_hash=?3 AND p.user_id=?2 AND p.consumed_by=?1)`;
