import {NextResponse,type NextRequest} from 'next/server';
import {startOAuthSignIn} from '@/lib/auth/provider';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){const provider=request.nextUrl.searchParams.get('provider');if(provider!=='google'&&provider!=='linkedin_oidc')return NextResponse.redirect(new URL('/account/recover?error=verification_failed',request.nextUrl.origin));const callback=new URL('/auth/callback',request.nextUrl.origin);callback.searchParams.set('purpose','recovery');callback.searchParams.set('remember','false');try{return NextResponse.redirect(await startOAuthSignIn(provider,callback.href));}catch{return NextResponse.redirect(new URL('/account/recover?error=verification_failed',request.nextUrl.origin));}}
