import {headers} from 'next/headers';
import {commercePolicyFromUserAgent} from '@/lib/mobile/commerce-policy';
import {optionalUser} from '@/lib/auth/server';
import {LoginRequired} from '@/components/auth/login-required';
import {PageHeader} from '@/components/ui/page-header';
import {listPlans} from '@/lib/billing/service';
import {invokeBillingService} from '@/lib/billing/service-binding';
import {GiftMemberships,type GiftView} from '@/components/billing/gift-memberships';
export const dynamic='force-dynamic';
export default async function GiftsPage(){const user=await optionalUser(),commerce=commercePolicyFromUserAgent((await headers()).get('user-agent'));if(!user)return <LoginRequired next="/gifts" title="Sign in to manage gifted memberships"/>;const [plans,response]=await Promise.all([listPlans(),invokeBillingService({path:'/gifts',method:'GET',userId:user.id})]);const body=await response.json() as {gifts?:GiftView[];error?:string};return <div className="phase11-page"><PageHeader preview={false} eyebrow="Study together" title="Gift a membership" description="Support a student's studies with monthly or yearly AutoPay. They accept first; you approve payments."/><GiftMemberships webCheckoutAllowed={commerce.webCheckoutAllowed} userId={user.id} plans={plans.filter(p=>p.tier_key!=='free'&&p.checkout_enabled)} initialGifts={body.gifts??[]} initialError={body.error??''}/></div>;}
