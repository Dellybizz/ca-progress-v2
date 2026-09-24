import {parseCommunityRealtimeEvent,type CommunityRealtimeEvent} from "./lib/community/realtime-events";

type DurableState={acceptWebSocket(socket:WebSocket):void;getWebSockets():WebSocket[]};
type SocketWithAttachment=WebSocket&{serializeAttachment?(value:unknown):void;deserializeAttachment?():unknown};
type LegacyClientSignal={type:"presence"|"typing"|"refresh";reason?:"message"|"reaction"|"read"|"pin"|"moderation"};

/** Ordered fan-out only. D1 remains authoritative for every persistent event. */
export class CommunityChannelCoordinator{
  private readonly presence=new Map<WebSocket,CommunityRealtimeEvent>();
  constructor(private readonly state:DurableState){}
  fetch(request:Request){if(request.headers.get("Upgrade")?.toLowerCase()!=="websocket")return new Response("WebSocket upgrade required.",{status:426});const Pair=(globalThis as typeof globalThis&{WebSocketPair?:new()=>[WebSocket,WebSocket]}).WebSocketPair;if(!Pair)return new Response("WebSocket runtime is unavailable.",{status:503});const[client,server]=new Pair();this.state.acceptWebSocket(server);server.send(JSON.stringify({type:"ready"}));return new Response(null,{status:101,webSocket:client} as ResponseInit&{webSocket:WebSocket});}
  webSocketMessage(socket:SocketWithAttachment,data:string|ArrayBuffer){if(typeof data!=="string")return;let value:unknown;try{value=JSON.parse(data);}catch{return;}const record=value as Record<string,unknown>,legacy=record as Partial<LegacyClientSignal>;if(legacy.type==="presence"&&typeof record.userId==="string"){const event:CommunityRealtimeEvent={type:"presence.changed",channelId:String(record.channelId||"channel"),userId:record.userId.slice(0,128),payload:{state:record.state==="offline"?"offline":"online",label:typeof record.label==="string"?record.label.slice(0,120):undefined}};socket.serializeAttachment?.(event);if(record.state==="offline")this.presence.delete(socket);else this.presence.set(socket,event);this.broadcast(event,socket);return;}if(legacy.type==="typing"&&typeof record.userId==="string"){this.broadcast({type:"typing.changed",channelId:String(record.channelId||"channel"),userId:record.userId.slice(0,128),payload:{typing:Boolean(record.typing)}},socket);return;}if(legacy.type==="refresh"){this.broadcastRaw({type:"refresh",reason:legacy.reason},socket);return;}const event=parseCommunityRealtimeEvent(value);if(event&&(event.type==="typing.changed"||event.type==="presence.changed"))this.broadcast(event,socket);}
  webSocketClose(server:SocketWithAttachment){this.leave(server);}
  webSocketError(socket:SocketWithAttachment){this.webSocketClose(socket);}
  private leave(socket:SocketWithAttachment){const previous=(socket.deserializeAttachment?.()||this.presence.get(socket)) as CommunityRealtimeEvent|undefined;this.presence.delete(socket);if(previous?.type==="presence.changed")this.broadcast({...previous,payload:{...previous.payload,state:"offline"}},socket);}
  private broadcast(event:CommunityRealtimeEvent,sender?:WebSocket){const payload=JSON.stringify(event);for(const socket of this.state.getWebSockets()){if(socket===sender||socket.readyState!==WebSocket.OPEN)continue;try{socket.send(payload);}catch{/* runtime removes disconnected sockets */}}}
  private broadcastRaw(event:LegacyClientSignal,sender?:WebSocket){const payload=JSON.stringify(event);for(const socket of this.state.getWebSockets()){if(socket===sender||socket.readyState!==WebSocket.OPEN)continue;try{socket.send(payload);}catch{/* runtime removes disconnected sockets */}}}
}
