export const NOTE_HTML_MAX_BYTES = 200_000;
export const NOTE_TEXT_MAX_BYTES = 120_000;
export const LEGACY_NOTE_TAGS = ['p','br','strong','b','em','i','u','ul','ol','li','blockquote','a','h1','h2','h3','h4','code','pre','mark','hr','table','thead','tbody','tfoot','tr','th','td'] as const;
export function assertNoteContentSize(html: string, text?: string) {
  if (new TextEncoder().encode(html).length > NOTE_HTML_MAX_BYTES || (text !== undefined && new TextEncoder().encode(text).length > NOTE_TEXT_MAX_BYTES)) {
    throw new Error('This note is too large. Split it into smaller notes; your content has not been shortened.');
  }
}
