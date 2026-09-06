import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";

type ObjHit = { id: string; kind: string; summary: string; category: string };
type CmdHit = { id: string; command: string; description: string; category: string; danger: boolean };

export function Search() {
  const [params, setParams] = useSearchParams();
  const initial = params.get("q") ?? "";
  const [q, setQ] = useState(initial);
  const [objects, setObjects] = useState<ObjHit[]>([]);
  const [commands, setCommands] = useState<CmdHit[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setObjects([]); setCommands([]); setSearched(false); return; }

    // Debounce: full-text search on every keystroke would hammer Postgres for
    // results nobody reads.
    const t = setTimeout(() => {
      setLoading(true);
      api.get<{ objects: ObjHit[]; commands: CmdHit[] }>(`/content/search?q=${encodeURIComponent(term)}`)
        .then((d) => { setObjects(d.objects); setCommands(d.commands); setSearched(true); })
        .catch(() => { setObjects([]); setCommands([]); setSearched(true); })
        .finally(() => setLoading(false));
      setParams(term ? { q: term } : {}, { replace: true });
    }, 250);
    return () => clearTimeout(t);
  }, [q, setParams]);

  return (
    <>
      <div className="page-head">
        <h1>Search</h1>
        <p>Across every object and command at once. Ranked by relevance, not alphabet.</p>
      </div>

      <div className="toolbar">
        <div className="grow">
          <input className="input" autoFocus placeholder="e.g. rollback, secret, why is my pod pending"
                 value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {loading && <span className="spinner" />}
      </div>

      {searched && objects.length === 0 && commands.length === 0 && (
        <div className="empty"><b>Nothing found for “{q}”</b>Try a single word — “probe”, “taint”, “quota”.</div>
      )}

      {objects.length > 0 && (
        <section className="section">
          <h2>Objects</h2>
          <div className="grid">
            {objects.map((o) => (
              <Link key={o.id} to={`/objects/${o.id}`} className="obj-card">
                <div className="top"><h3>{o.kind}</h3></div>
                <span className="badge" style={{ marginBottom: 8 }}>{o.category}</span>
                <p>{o.summary}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {commands.length > 0 && (
        <section className="section">
          <h2>Commands</h2>
          <div className="cmd-list">
            {commands.map((c) => (
              <div key={c.id} className={`cmd${c.danger ? " is-danger" : ""}`}>
                <div className="row1"><div className="cmdtext">{c.command}</div></div>
                <div className="desc">{c.description}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
