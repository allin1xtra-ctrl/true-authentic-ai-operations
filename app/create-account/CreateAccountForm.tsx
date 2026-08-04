"use client";

import { FormEvent, useState } from "react";

type BootstrapResponse = { success?: boolean; error?: string };

export default function CreateAccountForm() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get("password") || "");
    const confirmation = String(data.get("passwordConfirmation") || "");
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/bootstrap", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-owner-bootstrap-token": String(data.get("setupCode") || ""),
        },
        body: JSON.stringify({
          email: data.get("email"),
          password,
          displayName: data.get("displayName"),
          organizationName: data.get("organizationName"),
        }),
      });
      const result = (await response.json().catch(() => ({}))) as BootstrapResponse;
      if (!response.ok) {
        setError(result.error || "Account creation failed. Please verify the setup details.");
        return;
      }
      form.reset();
      location.href = "/login?account=created";
    } catch {
      setError("Account creation is temporarily unavailable. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <label>Display name<input name="displayName" autoComplete="name" required /></label>
      <label>Organization<input name="organizationName" defaultValue="True Authentic Apparel" autoComplete="organization" required /></label>
      <label>Email<input name="email" type="email" autoComplete="email" required /></label>
      <label>Password<input name="password" type="password" autoComplete="new-password" minLength={14} required aria-describedby="password-help" /></label>
      <small id="password-help">Use at least 14 characters and a password you do not use elsewhere.</small>
      <label>Confirm password<input name="passwordConfirmation" type="password" autoComplete="new-password" minLength={14} required /></label>
      <label>One-time setup code<input name="setupCode" type="password" autoComplete="off" minLength={32} required /></label>
      {error && <p className="ta-auth-error" role="alert">{error}</p>}
      <button disabled={busy}>{busy ? "Creating account…" : "Create owner account"}</button>
    </form>
  );
}
