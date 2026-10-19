// Phase 3 keeps P2's durable creation/recovery boundary. Its shared renewal
// reconciler requires original invoices and captured payments; no cron debit exists.
import previous from './payment-p2';
export default previous;
