/* eslint-disable @next/next/no-img-element -- Original embedded provider assets also run offline in the native app. */
import {googleLogo,linkedinLogo} from './provider-logos';
import './provider-tile.css';
export function ProviderTile({provider,disabled=false,onClick}:{provider:'google'|'linkedin';disabled?:boolean;onClick:()=>void}){
 const label=provider==='google'?'Continue with Google':'Continue with LinkedIn';
 return <button type="button" className="ca-provider-tile" aria-label={label} title={label} disabled={disabled} onClick={onClick}><img src={provider==='google'?googleLogo:linkedinLogo} alt="" aria-hidden="true" width={provider==='google'?26:30} height={provider==='google'?26:30}/></button>;
}
