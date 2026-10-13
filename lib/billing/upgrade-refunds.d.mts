import type {Database} from './checkout-engine.mjs';
import type {UpgradeDependencies} from './upgrade-engine.mjs';
export function maintainUpgradeRefunds(db:Database,deps:UpgradeDependencies,table?:"subscription_refund_obligations"|"subscription_switch_refunds"|"subscription_retry_refunds"|"subscription_cancellation_refunds"):Promise<void>;
