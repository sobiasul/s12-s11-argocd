import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type CategoryCount, type K8sObject } from "../lib/api";
import { useProgress } from "../lib/progress";

export function Objects() {
  const [params, setParams] = useSearchParams();
  const category = params.get("category") ?? "";
  const [objects, setObjects] = useState<K8sObject[]>([]);
  const [cats, setCats] = useState<CategoryCount[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const { isLearned } = useProgress();

  useEffect(() => {
    api.get<{ categories: CategoryCount[] }>("/content/objects/categories")
      .then((d) => setCats(d.categories)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const qs = category ? `?category=${encodeURIComponent(category)}` : "";
    api.get<{ objects: K8sObject[] }>(`/content/objects${qs}`)
      .then((d) => setObjects(d.objects))
      .catch(() => setObjects([]))
      .finally(() => setLoading(false));
  }, [category]);

  // Filtering by name happens client-side: the whole set is small, and an
  // instant filter beats a round trip per keystroke.
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return objects;
    return objects.filter(
      (o) =>
        o.kind.toLowerCase().includes(needle) ||
        o.id.includes(needle) ||
        o.summary.toLowerCase().includes(needle) ||
        o.shortNames.some((s) => s.toLowerCase().includes(needle)),
    );
  }, [objects, q]);

  const groups = useMemo(() => {
    const map = new Map<string, K8sObject[]>();
    shown.forEach((o) => {
      if (!map.has(o.category)) map.set(o.category, []);
      map.get(o.category)!.push(o);
    });
    return [...map.entries()];
  }, [shown]);

  function pick(c: string) {
    const next = new URLSearchParams(params);
    c ? next.set("category", c) : next.delete("category");
    setParams(next, { replace: true });
  }

  return (
    <>
      <div className="page-head">
        <h1>Kubernetes objects</h1>
        <p>What each API object is for, how it actually works, and a manifest you can apply.</p>
      </div>

      <div className="toolbar">
        <div className="grow">
          <input className="input" placeholder="Filter by kind, short name or description…"
                 value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="chips" style={{ marginBottom: 18 }}>
        <button className="chip" aria-pressed={!category} onClick={() => pick("")}>
          All<span className="n">{objects.length && !category ? objects.length : ""}</span>
        </button>
        {cats.map((c) => (
          <button key={c.category} className="chip" aria-pressed={category === c.category}
                  onClick={() => pick(c.category)}>
            {c.category}<span className="n">{c.count}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="empty"><span className="spinner" /></div>
      ) : shown.length === 0 ? (
        <div className="empty"><b>Nothing matches “{q}”</b>Try a kind like Deployment, or a short name like deploy.</div>
      ) : (
        // With no category filter the list is ordered by category, so it needs
        // headings — otherwise the sequence looks arbitrary to the reader.
        groups.map(([cat, list]) => (
          <section key={cat} style={{ marginBottom: 26 }}>
            {!category && (
              <h2 style={{ fontSize: 12, fontWeight: 680, textTransform: "uppercase",
                           letterSpacing: ".1em", color: "var(--faint)", margin: "0 0 10px" }}>
                {cat} <span style={{ fontFamily: "var(--f-mono)", opacity: .7 }}>({list.length})</span>
              </h2>
            )}
            <div className="grid">
              {list.map((o) => (
                <Link key={o.id} to={`/objects/${o.id}`} className="obj-card">
                  <div className="top">
                    <h3>{o.kind}</h3>
                    {isLearned("object", o.id) && <span className="learned" title="Marked as learned">✓</span>}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                    <span className="badge api">{o.apiVersion}</span>
                    {o.shortNames.slice(0, 2).map((s) => <span key={s} className="badge">{s}</span>)}
                    {!o.namespaced && <span className="badge warn">cluster-scoped</span>}
                  </div>
                  <p>{o.summary}</p>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </>
  );
}
