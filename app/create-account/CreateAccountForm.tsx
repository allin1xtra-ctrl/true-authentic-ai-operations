"use client";

import { FormEvent, useState } from "react";

type ApiResponse = { success?: boolean; error?: string; message?: string };

export default function CreateAccountForm() {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [codeRequested, setCodeRequested] = useState(false);
  const [passwordReady, setPasswordReady] = useState(false);

  function validatePasswords(form: HTMLFormElement) {
    const data = new FormData(form);
    const password = String(data.get("password") || "");
    const confirmation = String(data.get("passwordConfirmation") || "");
    setPasswordReady(password.length >= 15 && password === confirmation);
  }

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const password = String(data.get("password") || "");
    if (password !== String(data.get("passwordConfirmation") || "")) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/auth/request-setup-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: data.get("email") }),
      });
      const result = await response.json().catch(() => ({})) as ApiResponse;
      if (!response.ok) { setError(result.error || "The verification email could not be sent."); return; }
      setCodeRequested(true);
      setMessage(result.message || "Check your email for the 9-digit code.");
    } catch { setError("Email verification is temporarily unavailable."); }
    finally { setBusy(false); }
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/bootstrap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email:data.get("email"), password:data.get("password"), displayName:data.get("displayName"), organizationName:data.get("organizationName"), setupCode:data.get("setupCode") }),
      });
      const result = await response.json().catch(() => ({})) as ApiResponse;
      if (!response.ok) { setError(result.error || "Account creation failed."); return; }
      form.reset();
      location.href = "/login?account=created";
    } catch { setError("Account creation is temporarily unavailable."); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={codeRequested ? createAccount : requestCode} onInput={(event) => validatePasswords(event.currentTarget)}>
      <label>Display name<input name="displayName" autoComplete="name" required readOnly={codeRequested} /></label>
      <label>Organization<input name="organizationName" defaultValue="True Authentic Apparel" autoComplete="organization" required readOnly={codeRequested} /></label>
      <label>Email<input name="email" type="email" autoComplete="email" required readOnly={codeRequested} /></label>
      <label>Password<input name="password" type="password" autoComplete="new-password" minLength={15} required readOnly={codeRequested} aria-describedby="password-help" /></label>
      <small id="password-help">Use at least 15 characters and a password you do not use elsewhere.</small>
      <label>Confirm password<input name="passwordConfirmation" type="password" autoComplete="new-password" minLength={15} required readOnly={codeRequested} /></label>
      {codeRequested && <label>9-digit email code<input name="setupCode" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{9}" minLength={9} maxLength={9} required autoFocus /></label>}
      {message && <p className="ta-auth-success" role="status">{message}</p>}
      {error && <p className="ta-auth-error" role="alert">{error}</p>}
      {!codeRequested && passwordReady && <button disabled={busy}>{busy ? "Sending code…" : "Create account now"}</button>}
      {codeRequested && <button disabled={busy}>{busy ? "Creating account…" : "Verify code & create account"}</button>}
    </form>
  );
}
