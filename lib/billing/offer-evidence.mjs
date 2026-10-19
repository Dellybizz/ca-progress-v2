// Missing consumed offers require the immutable, provider-returned creation proof.
export function offerMatches(expected,subscription,cycles,attempt){
 if(String(subscription.offer_id??'')===String(expected??''))return true;
 if(!expected||subscription.offer_id||!Number.isSafeInteger(cycles)||cycles<1||!Number.isSafeInteger(Number(subscription.paid_count))||Number(subscription.paid_count)<cycles||!['active','pending','halted','paused','cancelled','completed','expired'].includes(subscription.status)||!attempt)return false;
 try{
  const payload=JSON.parse(attempt.payload_json),original=JSON.parse(attempt.provider_snapshot_json),notes=payload.notes??{};
  return ['created','authenticated'].includes(original.status)&&original.id===subscription.id&&original.offer_id===expected&&payload.offer_id===expected&&original.plan_id===payload.plan_id&&subscription.plan_id===payload.plan_id&&Number(original.total_count)===Number(payload.total_count)&&Number(subscription.total_count)===Number(payload.total_count)&&Number(original.quantity??1)===Number(payload.quantity??1)&&notes.checkout_key===attempt.request_key&&notes.ca_progress_user_id===attempt.user_id&&original.notes?.checkout_key===notes.checkout_key&&original.notes?.ca_progress_user_id===notes.ca_progress_user_id&&original.notes?.ca_progress_policy_version_id===notes.ca_progress_policy_version_id&&subscription.notes?.checkout_key===notes.checkout_key&&subscription.notes?.ca_progress_user_id===notes.ca_progress_user_id&&subscription.notes?.ca_progress_policy_version_id===notes.ca_progress_policy_version_id;
 }catch{return false;}
}
