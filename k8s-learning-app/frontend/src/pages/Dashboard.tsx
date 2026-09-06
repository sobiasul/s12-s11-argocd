import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type CategoryCount } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useProgress } from "../lib/progress";

export function Dashboard() {
  const { user } = useAuth();
  const { counts } = useProgress();
  const [totals, setTotals] = useState({ objects: 0, commands: 0 });
  const [objCats, setObjCats] = useState<CategoryCount[]>([]);
  const [cmdCats, setCmdCats] = useState<CategoryCount[]>([]);

  useEffect(() => {
    api.get<{ objects: number; commands: number }>("/content/stats").then(setTotals).catch(() => {});
    api.get<{ categories: CategoryCount[] }>("/content/objects/categories")
      .then((d) => setObjCats(d.categories)).catch(() => {});
    api.get<{ categories: CategoryCount[] }>("/content/commands/categories")
      .then((d) => setCmdCats(d.categories)).catch(() => {});
  }, []);

  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  const firstName = user?.display_name?.split(" ")[0] ?? "there";

  return (
    <>
      <div className="page-head">
        <h1>Hello, {firstName}</h1>
        <p>
          Everything here is a reference you can keep open while you work. Mark things off as
          they stop being mysterious — the counts below are yours alone.
        </p>
      </div>

      <div className="stat-grid">
        <div className="card stat">
          <div className="k">Objects learned</div>
          <div className="v">{counts.object}<span style={{ fontSize: 16, color: "var(--faint)" }}> / {totals.objects}</span></div>
          <div className="bar"><div style={{ width: `${pct(counts.object, totals.objects)}%` }} /></div>
          <div className="sub">{pct(counts.object, totals.objects)}% of the API objects covered</div>
        </div>

        <div className="card stat">
          <div className="k">Commands learned</div>
          <div className="v">{counts.command}<span style={{ fontSize: 16, color: "var(--faint)" }}> / {totals.commands}</span></div>
          <div className="bar ok"><div style={{ width: `${pct(counts.command, totals.commands)}%` }} /></div>
          <div className="sub">{pct(counts.command, totals.commands)}% of the kubectl cheat sheet</div>
        </div>

        <div className="card stat">
          <div className="k">In the library</div>
          <div className="v">{totals.objects + totals.commands}</div>
          <div className="sub">{totals.objects} objects · {totals.commands} commands</div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <div className="card">
          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 650 }}>Objects by category</h3>
          {objCats.map((c) => (
            <Link key={c.category} to={`/objects?category=${encodeURIComponent(c.category)}`} className="meta-row"
                  style={{ textDecoration: "none", borderBottom: "1px solid var(--line-soft)" }}>
              <span style={{ color: "var(--ink-2)" }}>{c.category}</span>
              <span>{c.count}</span>
            </Link>
          ))}
          {objCats.length === 0 && <div className="sub" style={{ color: "var(--faint)" }}>Loading…</div>}
        </div>

        <div className="card">
          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 650 }}>Commands by category</h3>
          {cmdCats.map((c) => (
            <Link key={c.category} to={`/commands?category=${encodeURIComponent(c.category)}`} className="meta-row"
                  style={{ textDecoration: "none", borderBottom: "1px solid var(--line-soft)" }}>
              <span style={{ color: "var(--ink-2)" }}>{c.category}</span>
              <span>{c.count}</span>
            </Link>
          ))}
          {cmdCats.length === 0 && <div className="sub" style={{ color: "var(--faint)" }}>Loading…</div>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 650 }}>Where to start</h3>
        <p style={{ margin: "0 0 12px", color: "var(--muted)", fontSize: 14 }}>
          If Kubernetes is still new: read <Link to="/objects/pod">Pod</Link>, then{" "}
          <Link to="/objects/replicaset">ReplicaSet</Link>, then <Link to="/objects/deployment">Deployment</Link>{" "}
          in that order. The reason Deployments exist only makes sense once you have seen the two
          things underneath them.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="btn" to="/objects">Browse objects</Link>
          <Link className="btn" to="/commands">Open the cheat sheet</Link>
        </div>
      </div>
    </>
  );
}
