import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { ApiError, type FieldError } from "../lib/api";

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [displayName, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [busy, setBusy] = useState(false);

  const fieldError = (f: string) => fieldErrors.find((e) => e.field === f)?.message;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setFieldErrors([]); setBusy(true);
    try {
      await register(email, displayName, password);
      navigate("/");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.details?.length ? "Please fix the fields below." : err.message);
        setFieldErrors(err.details ?? []);
      } else {
        setError("Something went wrong. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card card">
        <div className="brand">
          <div className="mark" aria-hidden>☸</div>
          <div><b>Kubernetes Study</b><span>objects &amp; commands</span></div>
        </div>
        <h1>Create your account</h1>
        <p className="sub">Track what you have learned as you work through it.</p>

        {error && <div className="alert" role="alert">{error}</div>}

        <form onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="name">Name</label>
            <input id="name" className="input" required value={displayName}
                   onChange={(e) => setName(e.target.value)} autoComplete="name" />
            {fieldError("displayName") && <div className="err">{fieldError("displayName")}</div>}
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" className="input" type="email" required value={email}
                   onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            {fieldError("email") && <div className="err">{fieldError("email")}</div>}
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" className="input" type="password" required value={password}
                   onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            <div className="hint">At least 10 characters. A short phrase beats a short password.</div>
            {fieldError("password") && <div className="err">{fieldError("password")}</div>}
          </div>
          <button className="btn btn-primary" style={{ width: "100%" }} disabled={busy}>
            {busy ? "Creating account…" : "Create account"}
          </button>
        </form>

        <div className="auth-alt">
          Already registered? <Link to="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
