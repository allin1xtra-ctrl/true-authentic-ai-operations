import AccountRegistrationForm from "./AccountRegistrationForm";

export const dynamic = "force-dynamic";

export default function CreateAccountPage() {
  return (
    <main className="ta-login">
      <section>
        <p>TRUE AUTHENTIC APPAREL</p>
        <h1>Create Account</h1>
        <p>Create your secure AI Operations account.</p>
        <AccountRegistrationForm />
        <p className="auth-switch">
          Already registered? <a href="/login">Sign in</a>
        </p>
      </section>
    </main>
  );
}
