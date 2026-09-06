import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, type CategoryCount, type KubectlCommand } from "../lib/api";
import { useProgress } from "../lib/progress";

export function Commands() {
  const [params, setParams] = useSearchParams();
  const category = params.get("category") ?? "";
  const [commands, setCommands] = useState<KubectlCommand[]>([]);
  const [cats, setCats] = useState<CategoryCount[]>([]);
  const [q, setQ] = useState("");
  const [dangerOnly, setDangerOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const { isLearned, toggle } = useProgress();

  useEffect(() => {
    api.get<{ categories: CategoryCount[] }>("/content/commands/categories")
      .then((d) => setCats(d.categories)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const qs = category ? `?category=${encodeURIComponent(category)}` : "";
    api.get<{ commands: KubectlCommand[] }>(`/content/commands${qs}`)
      .then((d) => setCommands(d.commands))
      .catch(() => setCommands([]))
      .finally(() => setLoading(false));
  }, [category]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return commands.filter((c) => {
      if (dangerOnly && !c.danger) return false;
      if (!needle) return true;
      return (
        c.command.toLowerCase().includes(needle) ||
        c.description.toLowerCase().includes(needle) ||
        (c.notes ?? "").toLowerCase().includes(needle) ||
        c.tags.some((t) => t.includes(needle))
      );
    });
  }, [commands, q, dangerOnly]);

  const grouped = useMemo(() => {
    const map = new Map<string, KubectlCommand[]>();
    shown.forEach((c) => {
      if (!map.has(c.category)) map.set(c.category, []);
      map.get(c.category)!.push(c);
    });
    return [...map.entries()];
  }, [shown]);

  async function copy(cmd: KubectlCommand) {
    try { await navigator.clipboard.writeText(cmd.command); } catch { /* non-secure context */ }
    setCopied(cmd.id);
    setTimeout(() => setCopied(null), 1400);
  }

  function pick(c: string) {
    const next = new URLSearchParams(params);
    c ? next.set("category", c) : next.delete("category");
    setParams(next, { replace: true });
  }

  return (
    <>
      <div className="page-head">
        <h1>kubectl cheat sheet</h1>
        <p>
          {commands.length} commands with the context that matters — what they do, when to use them,
          and which ones you cannot undo.
        </p>
      </div>

      <div className="toolbar">
        <div className="grow">
          <input className="input" placeholder="Search commands, flags, descriptions…"
                 value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="chip" aria-pressed={dangerOnly} onClick={() => setDangerOnly(!dangerOnly)}>
          ⚠ Destructive only
        </button>
      </div>

      <div className="chips" style={{ marginBottom: 18 }}>
        <button className="chip" aria-pressed={!category} onClick={() => pick("")}>All</button>
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
        <div className="empty"><b>No commands match</b>Try “logs”, “rollout”, or “port-forward”.</div>
      ) : (
        grouped.map(([cat, list]) => (
          <section key={cat} className="section" style={{ marginTop: 22 }}>
            <h2 style={{ fontSize: 12, fontWeight: 680, textTransform: "uppercase",
                         letterSpacing: ".1em", color: "var(--faint)", margin: "0 0 10px" }}>
              {cat} <span style={{ fontFamily: "var(--f-mono)", opacity: .7 }}>({list.length})</span>
            </h2>
            <div className="cmd-list">
              {list.map((c) => {
                const done = isLearned("command", c.id);
                return (
                  <div key={c.id} className={`cmd${c.danger ? " is-danger" : ""}`}>
                    <div className="row1">
                      <div className="cmdtext">{c.command}</div>
                      <div className="acts">
                        {c.danger && <span className="badge danger" title="Destructive">⚠</span>}
                        <button className="iconbtn" title="Copy" onClick={() => copy(c)}>
                          {copied === c.id ? "✓" : "⧉"}
                        </button>
                        <button className={`iconbtn${done ? " on" : ""}`}
                                title={done ? "Learned" : "Mark as learned"}
                                onClick={() => toggle("command", c.id)}>✓</button>
                      </div>
                    </div>
                    <div className="desc">{c.description}</div>
                    {c.example && <div className="example">{c.example}</div>}
                    {c.notes && <div className="notes">{c.notes}</div>}
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
    </>
  );
}
