import type {Phase9AnalyticsModel} from './phase9';
export function analyticsForAccess(model:Phase9AnalyticsModel,allowed:boolean):Phase9AnalyticsModel & {advancedAccess?:boolean};
