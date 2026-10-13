/* eslint-disable @next/next/no-img-element -- Local SVGs must work in the native bundle without a Next image service. */
import type {CSSProperties, ReactNode} from 'react';
import './onboarding.css';

export type OnboardingAssets = {stationery:string;book:string};
export const webOnboardingAssets:OnboardingAssets={stationery:'/onboarding/stationery.svg',book:'/onboarding/book.svg'};
export function OnboardingFrame({children,aside,className='',assets=webOnboardingAssets}:{children:ReactNode;aside?:ReactNode;className?:string;assets?:OnboardingAssets}){
 return <main className={`ca-onboarding ${className}`} style={{'--onboarding-background':`url("${assets.stationery}")`} as CSSProperties}><div className="ca-onboarding-brand">CA PROGRESS</div><div className={`ca-onboarding-layout${aside?' has-aside':''}`}>{aside?<aside className="ca-onboarding-aside">{aside}</aside>:null}<section className="ca-onboarding-panel">{children}</section></div></main>;
}
export function OnboardingProgress({step,total,onBack}:{step:number;total:number;onBack?:()=>void}){
 const safeTotal=Math.max(1,total),safeStep=Math.max(0,Math.min(step,safeTotal));
 return <header className="ca-onboarding-progress">{onBack?<button type="button" aria-label="Back" onClick={onBack}>‹</button>:<span/>}<div role="progressbar" aria-label="Setup progress" aria-valuemin={0} aria-valuemax={safeTotal} aria-valuenow={safeStep}><span style={{width:`${safeStep/safeTotal*100}%`}}/></div><span className="ca-onboarding-sr">Step {safeStep} of {safeTotal}</span></header>;
}
export function OnboardingMascot({message,assets=webOnboardingAssets}:{message:string;assets?:OnboardingAssets}){return <div className="ca-onboarding-mascot"><img src={assets.book} alt="" width={112} height={112}/><p>{message}</p></div>;}
export function OnboardingHeading({title,description,id}:{title:string;description?:string;id?:string}){return <div className="ca-onboarding-heading"><h1 id={id}>{title}</h1>{description?<p>{description}</p>:null}</div>;}
export function OnboardingChoices({label,children}:{label:string;children:ReactNode}){return <fieldset className="ca-onboarding-choices"><legend className="ca-onboarding-sr">{label}</legend>{children}</fieldset>;}
export function OnboardingChoice({name,value,title,description,icon,checked,onChange,multiple=false,disabled=false}:{name:string;value:string;title:string;description?:string;icon?:ReactNode;checked:boolean;onChange:()=>void;multiple?:boolean;disabled?:boolean}){
 return <label className={`ca-onboarding-choice${checked?' is-selected':''}${disabled?' is-disabled':''}`}><input type={multiple?'checkbox':'radio'} name={name} value={value} checked={checked} onChange={onChange} disabled={disabled}/>{icon?<span className="ca-onboarding-choice-icon" aria-hidden="true">{icon}</span>:null}<span className="ca-onboarding-choice-copy"><strong>{title}</strong>{description?<span>{description}</span>:null}</span><span className="ca-onboarding-choice-mark" aria-hidden="true">{checked?'✓':''}</span></label>;
}
export function OnboardingField({label,children,hint}:{label:string;children:ReactNode;hint?:string}){return <label className="ca-onboarding-field"><span>{label}</span>{children}{hint?<small>{hint}</small>:null}</label>;}
export function OnboardingFeedback({children,error=false}:{children:ReactNode;error?:boolean}){return <p className={`ca-onboarding-feedback${error?' is-error':''}`} role={error?'alert':'status'}>{children}</p>;}
export function OnboardingActions({children,note}:{children:ReactNode;note?:string}){return <footer className="ca-onboarding-actions">{children}{note?<p>{note}</p>:null}</footer>;}
export function OnboardingButton({children,onClick,disabled=false,busy=false,type='button'}:{children:ReactNode;onClick?:()=>void;disabled?:boolean;busy?:boolean;type?:'button'|'submit'}){return <button type={type} className="ca-onboarding-button" disabled={disabled||busy} aria-busy={busy} onClick={onClick}>{children}</button>;}
