export function failurePolicy(local: Record<string,unknown>, status:string, paidThrough:string|null): {anchor:string|null;graceUntil:string|null;accessEnd:string|null;unresolved:boolean};
export function retryGuidance(method:string,status:string):string;
