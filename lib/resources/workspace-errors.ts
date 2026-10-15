/** Preserve useful validation messages without exposing database internals to students. */
export function workspaceErrorMessage(error:unknown,fallback='The change could not be saved. Please try again.'){
 const message=error instanceof Error?error.message:String(error??'');
 if(message.includes('Move every item'))return 'Move every item before deleting this folder, including files in Trash and subfolders.';
 if(message.includes('Folder move creates a cycle'))return 'Folder move creates a cycle. Choose a folder outside its children.';
 if(/FOREIGN KEY|ownership mismatch|belongs to another owner/.test(message))return 'The file or destination is no longer available. Refresh and choose it again.';
 if(/D1_ERROR|SQLITE_|constraint failed|SQL syntax|no such (table|column)/i.test(message))return fallback;
 return message||fallback;
}
