// Durable student-wide eligibility. Refunds never delete consumption evidence.
export async function introductoryConsumed(db, userId, ownPaymentId = null) {
  const row = await db.prepare('SELECT 1 consumed FROM student_introductory_consumptions WHERE user_id=?1 AND (?2 IS NULL OR payment_id<>?2) LIMIT 1').bind(userId,ownPaymentId).first();
  return Boolean(row);
}
