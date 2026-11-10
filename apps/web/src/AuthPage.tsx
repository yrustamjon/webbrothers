import { useState } from "react";
import { login, register, ApiError } from "./api";

interface Props {
  onLogin: (email: string, csrf: string) => void;
}

export default function AuthPage({ onLogin }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        const data = await login(email, password);
        onLogin(data.email, data.csrf_token);
      } else {
        await register(email, password);
        const data = await login(email, password);
        onLogin(data.email, data.csrf_token);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Xatolik yuz berdi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-box">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div className="logo" style={{ marginBottom: 0, width: 36, height: 36, fontSize: 18 }}>W</div>
          <span style={{ fontWeight: 800, fontSize: 20 }}>WebBrothers</span>
        </div>

        <div style={{ display: "flex", gap: 0, marginBottom: 20, border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" }}>
          {(["login", "register"] as const).map(m => (
            <button
              key={m}
              style={{ flex: 1, padding: "9px 0", border: 0, fontWeight: 600, background: mode === m ? "var(--ac)" : "transparent", color: mode === m ? "#fff" : "var(--mut)" }}
              onClick={() => { setMode(m); setError(""); }}
            >
              {m === "login" ? "Kirish" : "Ro'yxatdan o'tish"}
            </button>
          ))}
        </div>

        <form onSubmit={submit}>
          <label className="form-field">
            Email
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="user@example.com" />
          </label>
          <label className="form-field">
            Parol {mode === "register" && <span className="muted" style={{ fontWeight: 400 }}>(kamida 12 ta belgi)</span>}
            <input type="password" required minLength={12} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••••••" />
          </label>
          {error && <p style={{ color: "var(--err)", margin: "8px 0" }}>{error}</p>}
          <button className="btn" type="submit" disabled={loading} style={{ width: "100%", justifyContent: "center", marginTop: 8 }}>
            {loading ? "Yuklanmoqda…" : mode === "login" ? "Kirish" : "Ro'yxatdan o'tish"}
          </button>
        </form>
      </div>
    </div>
  );
}
