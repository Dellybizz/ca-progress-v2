'use client';
import {createContext,useCallback,useContext,useEffect,useState,type ReactNode} from 'react';
import {useStudentContext} from '@/components/academic/student-context-provider';
import {UploadTransferRuntime} from './upload-panel';
type UploadRequest={files:File[]};
const TransferHost=createContext<((request:UploadRequest)=>void)|null>(null);
export function useTransferHost(){return useContext(TransferHost);}
function OwnerTransfers({children}:{children:ReactNode}){const [request,setRequest]=useState<UploadRequest|null>(null);const open=useCallback((value:UploadRequest)=>setRequest(value),[]);return <TransferHost.Provider value={open}>{children}<UploadTransferRuntime open={Boolean(request)} initialFiles={request?.files} close={()=>setRequest(null)} onChanged={()=>window.dispatchEvent(new Event('resource-upload-completed'))}/></TransferHost.Provider>;}
export function TransferProvider({children}:{children:ReactNode}){const {userId}=useStudentContext();return userId?<OwnerTransfers key={userId}>{children}</OwnerTransfers>:children;}
export function UploadPanelBridge({open,close,onChanged,initialFiles}:{open:boolean;close:()=>void;onChanged:()=>void;initialFiles?:File[]}){const host=useTransferHost();useEffect(()=>{if(open&&host){host({files:initialFiles??[]});close();}},[open,host,initialFiles,close]);useEffect(()=>{window.addEventListener('resource-upload-completed',onChanged);return()=>window.removeEventListener('resource-upload-completed',onChanged);},[onChanged]);return null;}
