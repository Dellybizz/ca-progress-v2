import { useState } from "react";
import { nativeApiRequest } from "./native-auth";

export type AccountSetupState = { eligible: boolean; username: string | null; isTemporary: boolean; hasPassword: boolean };

export function NativeAccountSetup({ assignedUsername, onLater, onCompleted, onProfile }: {
  assignedUsername: string; onLater: () => void; onCompleted: () => void; onProfile: () => void;
}) {
  const [username, setUsername] = useState(assignedUsername);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirm) return setError("Passwords do not match.");
    setBusy(true); setError("");
    try {
      await nativeApiRequest("/api/v1/account-setup", { method: "POST", body: JSON.stringify({ username, password }) });
      setPassword(""); setConfirm(""); onCompleted();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save login."); }
    finally { setBusy(false); }
  };
  return <div className="native-overlay" role="presentation"><section className="native-modal native-account-setup" role="dialog" aria-modal="true" aria-label="Set up account login">
    <h2>Set up your CA Progress login</h2>
    <p>Your assigned username is <strong>{assignedUsername}</strong>. Choose your own username and password for future sign-ins. Your study data stays with this account.</p>
    {error && <p role="alert" className="auth-error">{error}</p>}
    <form className="bootstrap-password" onSubmit={event => void submit(event)}>
      <label>Username<input autoComplete="username" minLength={3} maxLength={30} pattern="[A-Za-z][A-Za-z0-9._]{2,29}" required value={username} onChange={event => setUsername(event.target.value)}/></label>
      <label>New password<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)}/></label>
      <label>Confirm password<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirm} onChange={event => setConfirm(event.target.value)}/></label>
      <button className="primary" disabled={busy} type="submit">{busy ? "Saving…" : "Save login"}</button>
    </form>
    <button className="secondary" type="button" onClick={onProfile}>Review profile details</button>
    <button className="secondary" type="button" onClick={onLater}>Do this later</button>
  </section></div>;
}
