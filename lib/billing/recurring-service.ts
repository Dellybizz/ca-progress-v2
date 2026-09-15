import "server-only";
import { optionalUser } from "@/lib/auth/server";
import { getD1RuntimeDatabase } from "@/lib/data/d1/client";

type Row=Record<string,unknown>;
export type RecurringPlanOption={id:string;name:string;tierKey:string;billingCycle:string};
export type RecurringCharge={paymentId:string;amountSubunits:number;currency:string;status:string;refundState:string;disputeState:string;createdAt:string|null};
export type RecurringSubscriptionView={providerSubscriptionId:string;planId:string;status:string;financialState:string;billingCycle:string;recurringPriceSubunits:number;initialPriceSubunits:number;trialDays:number;graceDays:number;paidCount:number;remainingCount:number|null;authAttempts:number;startAt:string|null;currentStart:string|null;currentEnd:string|null;chargeAt:string|null;paidThroughAt:string|null;graceUntil:string|null;cancelAtPeriodEnd:boolean;cancellationMode:string;scheduledTargetPlanId:string|null;canCancelImmediately:boolean};
export type RecurringBillingState={mode:"guest"|"none"|"ready";subscription:RecurringSubscriptionView|null;charges:RecurringCharge[];availablePlans:RecurringPlanOption[]};

export async function getRecurringBillingState():Promise<RecurringBillingState>{
  const user=await optionalUser();if(!user)return{mode:"guest",subscription:null,charges:[],availablePlans:[]};const db=getD1RuntimeDatabase();
  const [subscriptionResult,plansResult]=await Promise.all([
    db.prepare("SELECT * FROM razorpay_subscriptions WHERE user_id=?1 ORDER BY created_at DESC LIMIT 1").bind(user.id).all<Row>(),
    db.prepare("SELECT id,name,tier_key,billing_cycle FROM subscription_plans WHERE active=1 AND checkout_enabled=1 AND tier_key<>'free' ORDER BY sort_order").all<Row>(),
  ]);
  const row=subscriptionResult.results?.[0]??null,availablePlans=(plansResult.results??[]).map(plan=>({id:String(plan.id),name:String(plan.name),tierKey:String(plan.tier_key),billingCycle:String(plan.billing_cycle)}));if(!row)return{mode:"none",subscription:null,charges:[],availablePlans};
  const chargesResult=await db.prepare("SELECT provider_payment_id,amount_subunits,currency,status,refund_state,dispute_state,provider_created_at FROM razorpay_subscription_charges WHERE razorpay_subscription_id=?1 ORDER BY provider_created_at DESC,updated_at DESC LIMIT 50").bind(row.id).all<Row>();
  const paidThrough=row.paid_through_at?String(row.paid_through_at):null;return{mode:"ready",subscription:{providerSubscriptionId:String(row.provider_subscription_id),planId:String(row.plan_id),status:String(row.status),financialState:String(row.financial_state),billingCycle:String(row.billing_cycle),recurringPriceSubunits:Number(row.recurring_price_subunits),initialPriceSubunits:Number(row.initial_price_subunits),trialDays:Number(row.trial_days??0),graceDays:Number(row.grace_days??0),paidCount:Number(row.paid_count??0),remainingCount:row.remaining_count==null?null:Number(row.remaining_count),authAttempts:Number(row.auth_attempts??0),startAt:row.start_at?String(row.start_at):null,currentStart:row.current_start?String(row.current_start):null,currentEnd:row.current_end?String(row.current_end):null,chargeAt:row.charge_at?String(row.charge_at):null,paidThroughAt:paidThrough,graceUntil:row.grace_until?String(row.grace_until):null,cancelAtPeriodEnd:Boolean(row.cancel_at_period_end),cancellationMode:String(row.cancellation_mode),scheduledTargetPlanId:row.scheduled_target_plan_id?String(row.scheduled_target_plan_id):null,canCancelImmediately:String(row.cancellation_mode)==="immediate_if_unpaid"&&(!paidThrough||Date.parse(paidThrough)<=Date.now())},charges:(chargesResult.results??[]).map(charge=>({paymentId:String(charge.provider_payment_id),amountSubunits:Number(charge.amount_subunits),currency:String(charge.currency),status:String(charge.status),refundState:String(charge.refund_state),disputeState:String(charge.dispute_state),createdAt:charge.provider_created_at?String(charge.provider_created_at):null})),availablePlans};
}
