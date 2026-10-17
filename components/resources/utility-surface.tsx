'use client';
import {createPortal} from 'react-dom';
import {useEffect,useState,type ReactNode} from 'react';
/** The shell keeps transfers alive; only their visible surface moves into Resources. */
export function UtilitySurface({children,indicator=false,navigation=false}:{children:ReactNode;indicator?:boolean;navigation?:boolean}){
 const [host,setHost]=useState<HTMLElement|null>(null);
 useEffect(()=>{const find=()=>{const next=document.getElementById(navigation?'fm-mobile-navigation':indicator?'fm-transfer-indicator':'fm-utility-dock');setHost(previous=>previous===next?previous:next);};find();const observer=new MutationObserver(find);observer.observe(document.body,{childList:true,subtree:true});return()=>observer.disconnect();},[indicator,navigation]);
 return host?createPortal(children,host):children;
}
