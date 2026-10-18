/** The plain-text native editor must not flatten a richer server note. */
export function noteNeedsRichEditor(baseline:string|null|undefined):boolean{
 if(!baseline)return false;let value:unknown;try{value=JSON.parse(baseline);}catch{return true;}
 if(!value||typeof value!=='object')return true;const html=(value as {body_html?:unknown}).body_html;
 if(html===null||html===undefined)return false;if(typeof html!=='string')return true;
 return /<(?:table|figure|svg|section|h[1-6]|ul|ol|blockquote|details|img|strong|em|b|i|u|span|a|code|pre|sup|sub|mark|s|strike|hr|aside|summary|font|div|math|video|audio|canvas|input|label)\b|<p\b[^>]*(?:style|class|id|dir|data-[\w-]+)[\s=]/i.test(html);
}
