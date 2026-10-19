import type { NativeRoute } from "./runtime";

export type NativeDestination = {
  route: NativeRoute;
  context?: {subjectId?:string;chapterId?:string;noteLocalId?:string;resourceLocalId?:string};
};

// Only the canonical, allowlisted route parser may authorize a destination.
// The URL path supplies optional local-record context after that check.
export function destinationFromWebsiteLink(href:string, routeFromDeepLink:(url:string)=>NativeRoute|null):NativeDestination|null {
  try {
    const url=new URL(href,"https://caprogress.zanisheluxe.in");
    const route=routeFromDeepLink(url.href);
    if(!route)return null;
    const parts=url.pathname.split("/").filter(Boolean);
    if(parts[0]==="chapters"&&parts[1])return {route:"progress",context:{chapterId:decodeURIComponent(parts[1])}};
    if(parts[0]==="subjects"&&parts[1])return {route:parts[2]==="progress"?"progress":"syllabus",context:{subjectId:decodeURIComponent(parts[1])}};
    if(parts[0]==="notes"&&parts[1])return {route,context:{noteLocalId:decodeURIComponent(parts[1])}};
    if(parts[0]==="resources"&&parts[1]&&parts[1]!=="icai")return {route,context:{resourceLocalId:decodeURIComponent(parts[1])}};
    return {route};
  }catch{return null;}
}
