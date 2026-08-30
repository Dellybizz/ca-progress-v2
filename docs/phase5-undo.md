# Guarded undo

Recent undo restores an event's `previous_state` only if the chapter still exactly matches that event's `new_state`. If a later device or tab changed the same chapter, undo is rejected rather than overwriting the newer state.
