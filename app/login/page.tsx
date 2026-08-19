import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="ta-login">
      <section>
        <p>TRUE AUTHENTIC APPAREL</p>
        <h1>AI Operations</h1>
        <p>Sign in to the standalone command center.</p>
        <LoginForm />
      </section>
    </main>
  );
}
