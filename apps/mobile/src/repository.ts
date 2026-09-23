export type LocalAccount = { id: string; displayName: string; subtitle: string };

const ACCOUNT_KEY = "ca.mobile.shell.account.v1";
const DEFAULT_ACCOUNT: LocalAccount = { id: "local-preview", displayName: "Your study space", subtitle: "Local preview · sign in when ready" };

export function readLocalAccount(): LocalAccount {
  try {
    const stored = localStorage.getItem(ACCOUNT_KEY);
    if (!stored) return DEFAULT_ACCOUNT;
    const value = JSON.parse(stored) as Partial<LocalAccount>;
    return value.id && value.displayName ? { id: value.id, displayName: value.displayName, subtitle: value.subtitle ?? "Saved on this device" } : DEFAULT_ACCOUNT;
  } catch { return DEFAULT_ACCOUNT; }
}

export function hasRetainedLocalAccount() {
  try { return localStorage.getItem(ACCOUNT_KEY) !== null; } catch { return false; }
}

export function retainLocalAccount(account: LocalAccount) {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
}

export function clearLocalAccount() {
  localStorage.removeItem(ACCOUNT_KEY);
}

export const localPreview = Object.freeze({
  today: [
    { title: "Continue your next chapter", meta: "Open Progress to choose a chapter", state: "Ready" },
    { title: "Plan today's study", meta: "Your saved plan will appear here after sync", state: "Local" },
  ],
  progress: [{ label: "Syllabus", value: "—", hint: "Waiting for first secure sync" }],
  community: [{ channel: "Announcements", preview: "Recent conversations will be retained on this device.", time: "Local preview" }],
});
