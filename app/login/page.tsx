import OwnerLoginForm from "./owner-login-form";

export const dynamic = "force-dynamic";

export default function Login() {
  if (process.env.ADMIN_OWNER_LOGIN_ENABLED === "true") {
    return <OwnerLoginForm />;
  }
  return (
    <main className="page">
      <section className="panel" aria-labelledby="page-title">
        <span className="eyebrow">curricula.live / admin</span>
        <h1 id="page-title">Administrative access</h1>
        <p>This workspace is not yet available. Owner authentication and server-side authorization must be completed before access can be enabled.</p>
        <p className="secondary">No knowledge or account information is exposed from this page.</p>
        <a href="https://curricula.live/" rel="noreferrer">Return to curricula.live</a>
      </section>
    </main>
  );
}
