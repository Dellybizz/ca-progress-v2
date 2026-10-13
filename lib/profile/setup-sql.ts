export const writeSetupSql=`INSERT INTO onboarding_setup(user_id,draft_json,revision,write_id)
 SELECT ?1,?2,1,?3 WHERE ?4=0 AND EXISTS(SELECT 1 FROM profiles p JOIN app_users u ON u.user_id=p.user_id WHERE p.user_id=?1 AND p.onboarding_completed_at IS NULL AND u.account_state='active')
 ON CONFLICT(user_id) DO NOTHING RETURNING revision`;
export const updateSetupSql=`UPDATE onboarding_setup SET draft_json=?2,revision=revision+1,write_id=?3,updated_at=CURRENT_TIMESTAMP
 WHERE user_id=?1 AND revision=?4 AND completed_at IS NULL
 AND EXISTS(SELECT 1 FROM profiles p JOIN app_users u ON u.user_id=p.user_id WHERE p.user_id=?1 AND p.onboarding_completed_at IS NULL AND u.account_state='active') RETURNING revision`;
export const completeSetupProfileSql=`UPDATE profiles SET ca_level=?1,group_choice=?2,attempt_key=?3,
 daily_target_minutes=CASE WHEN ?4='set' THEN ?5 ELSE daily_target_minutes END,
 onboarding_step=4,onboarding_completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
 WHERE user_id=?6 AND onboarding_completed_at IS NULL AND EXISTS(SELECT 1 FROM onboarding_setup s WHERE s.user_id=?6 AND s.write_id=?7 AND s.completed_at IS NULL)`;
export const completeSetupPreparationSql=`INSERT INTO onboarding_experience(user_id,preparation_state) SELECT ?1,?2
 WHERE EXISTS(SELECT 1 FROM onboarding_setup s JOIN profiles p ON p.user_id=s.user_id WHERE s.user_id=?1 AND s.write_id=?3 AND p.onboarding_completed_at IS NOT NULL AND s.completed_at IS NULL)
 ON CONFLICT(user_id) DO UPDATE SET preparation_state=excluded.preparation_state,updated_at=CURRENT_TIMESTAMP`;
export const finishSetupSql=`UPDATE onboarding_setup SET completed_at=CURRENT_TIMESTAMP WHERE user_id=?1 AND write_id=?2 AND completed_at IS NULL
 AND EXISTS(SELECT 1 FROM profiles p WHERE p.user_id=?1 AND p.onboarding_completed_at IS NOT NULL)`;
