import type {Database} from './checkout-engine.mjs';
import type {UpgradeDependencies} from './upgrade-engine.mjs';
export function maintainUpgradeRefunds(db:Database,deps:UpgradeDependencies):Promise<void>;
