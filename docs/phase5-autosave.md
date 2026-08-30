# Automatic persistence

Stage buttons optimistically update local UI and immediately POST the change to `/api/progress`. The API uses the signed-in SSR session to call the transactional database RPC. A successful response replaces the optimistic timestamp with the saved database state; an error restores the previous UI state.
