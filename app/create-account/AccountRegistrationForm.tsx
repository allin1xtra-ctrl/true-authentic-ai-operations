"use client";

import { FormEvent, useState } from "react";

export default function AccountRegistrationForm() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    const confirmation = String(form.get("passwordConfirmation") || "");

    if (password !== confirmation) {
      setError("Passwords do not match.");
      setBusy(false);
      return;
    }

    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayName: form.get("displayName"),
        email: form.get("email"),
        password,
        invitationCode: form.get("invitationCode"),
      }),
    });

    const result = (await response.json().catch(() => ({}))) as { error?: string };
    if (response.ok) {
      location.href = "/";
      return;
    }

    setError(result.error || "Account creation failed. Try again.");
    setBusy(false);
  }

  return (
    <form onSubmit={submit}>
      <label>
        Full name
        <input name="displayName" autoComplete="name" minLength={2} maxLength={120} required />
      </label>
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Password
        <input name="password" type="password" autoComplete="new-password" minLength={14} required />
      </label>
      <label>
        Confirm password
        <input name="passwordConfirmation" type="password" autoComplete="new-password" minLength={14} required />
      </label>
      <label>
        Team invitation code <span className="optional">(not required for the first owner)</span>
        <input name="invitationCode" type="password" autoComplete="off" />
      </label>
      {error && <p role="alert" className="auth-error">{error}</p>}
      <button disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
    </form>
  );
}
