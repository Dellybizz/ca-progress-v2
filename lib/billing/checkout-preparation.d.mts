export function createCheckoutPreparation<T>():{
 warm(key:string,prepare:()=>Promise<T>,abandon:(value:T)=>Promise<unknown>):Promise<T>;
 take(key:string,prepare:()=>Promise<T>,abandon:(value:T)=>Promise<unknown>):Promise<T>;
 discard():Promise<unknown>;
};
