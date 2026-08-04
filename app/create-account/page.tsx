import CreateAccountForm from "./CreateAccountForm";

export const dynamic = "force-dynamic";

export default function CreateAccountPage() {
  return (
    <main className="ta-login">
      <section>
        <p>TRUE AUTHENTIC APPAREL</p>
        <h1>Create owner account</h1>
        <p>Choose your login details. The one-time setup code is configured securely in Vercel.</p>
        <CreateAccountForm />
        <p className="ta-auth-switch">Already created the account? <a href="/login">Return to sign in</a></p>
      </section>
    </main>
  );
}
