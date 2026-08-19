"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { passwordPolicyValid } from "../../lib/account-policy.mjs";

type ApiResponse = { success?: boolean; error?: string; message?: string };

export default function CreateAccountForm() {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [codeRequested, setCodeRequested] = useState(false);
  const [passwordReady, setPasswordReady] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  function validatePasswords(form: HTMLFormElement) {
    const data = new FormData(form);
    const password = String(data.get("password") || "");
    const confirmation = String(data.get("passwordConfirmation") || "");
    setPasswordReady(passwordPolicyValid(password, confirmation));
  }

  async function sendCode(form: HTMLFormElement, resend = false) {
    if (!resend && !form.reportValidity()) return;
    const data = new FormData(form);
    const password = String(data.get("password") || "");
    if (password !== String(data.get("passwordConfirmation") || "")) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/auth/verification/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: data.get("email") }),
      });
      const result = await response.json().catch(() => ({})) as ApiResponse;
      if (!response.ok) { setError(result.error || "The verification email could not be sent."); return; }
      setCodeRequested(true);
      setCooldown(60);
      setMessage(result.message || "Check your email for the 9-digit code.");
      window.setTimeout(() => codeRef.current?.focus(), 0);
    } catch { setError("Email verification is temporarily unavailable."); }
    finally { setBusy(false); }
  }

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendCode(event.currentTarget);
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email:data.get("email"), password:data.get("password"), passwordConfirmation:data.get("passwordConfirmation"), displayName:data.get("displayName"), organizationName:data.get("organizationName"), verificationCode:data.get("verificationCode") }),
      });
      const result = await response.json().catch(() => ({})) as ApiResponse;
      if (!response.ok) { setError(result.error || "Account creation failed."); return; }
      form.reset();
      location.href = "/";
    } catch { setError("Account creation is temporarily unavailable."); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={codeRequested ? createAccount : requestCode} onInput={(event) => validatePasswords(event.currentTarget)}>
      <label>Display name<input name="displayName" autoComplete="name" required readOnly={codeRequested} /></label>
      <label>Organization<input name="organizationName" defaultValue="True Authentic Apparel" autoComplete="organization" required readOnly={codeRequested} /></label>
      <label>Email<input name="email" type="email" autoComplete="email" required readOnly={codeRequested} /></label>
      <label>Password<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={256} required readOnly={codeRequested} aria-describedby="password-help" /></label>
      <small id="password-help">Use 12–256 characters and a password you do not use elsewhere.</small>
      <label>Confirm password<input name="passwordConfirmation" type="password" autoComplete="new-password" minLength={12} maxLength={256} required readOnly={codeRequested} /></label>
      {codeRequested && <label>9-digit email code<input ref={codeRef} name="verificationCode" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{9}" minLength={9} maxLength={9} required /></label>}
      {message && <p className="ta-auth-success" role="status" aria-live="polite">{message}</p>}
      {error && <p className="ta-auth-error" role="alert" aria-live="assertive">{error}</p>}
      {!codeRequested && passwordReady && <button disabled={busy}>{busy ? "Sending code…" : "Send verification code"}</button>}
      {codeRequested && <><button disabled={busy}>{busy ? "Creating account…" : "Verify code & create account"}</button><button type="button" className="secondary" disabled={busy || cooldown > 0} onClick={() => { const form = codeRef.current?.form; if (form) void sendCode(form, true); }}>{cooldown > 0 ? `Resend in ${cooldown}s` : "Resend verification code"}</button></>}
    </form>
  );
}
