import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type K8sObject, type Note, type RelatedObject } from "../lib/api";
import { CodeBlock } from "../components/CodeBlock";
import { Prose } from "../components/Prose";
import { useProgress } from "../lib/progress";

export function ObjectDetail() {
  const { id = "" } = useParams();
  const [obj, setObj] = useState<K8sObject | null>(null);
  const [related, setRelated] = useState<RelatedObject[]>([]);
  const [missing, setMissing] = useState(false);
  const [note, setNote] = useState("");
  const [noteSaved, setNoteSaved] = useState(false);
  const { isLearned, toggle } = useProgress();
  const saveTimer = useRef<number>();

  useEffect(() => {
    setObj(null); setMissing(false);
    api.get<{ object: K8sObject; related: RelatedObject[] }>(`/content/objects/${id}`)
      .then((d) => { setObj(d.object); setRelated(d.related); })
      .catch(() => setMissing(true));

    api.get<{ notes: Note[] }>("/progress/notes")
      .then((d) => setNote(d.notes.find((n) => n.itemType === "object" && n.itemId === id)?.body ?? ""))
      .catch(() => setNote(""));
  }, [id]);

  // Debounced autosave — a note you have to remember to save is a note you lose.
  function editNote(body: string) {
    setNote(body); setNoteSaved(false);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      api.put("/progress/notes", { itemType: "object", itemId: id, body })
        .then(() => setNoteSaved(true))
        .catch(() => {});
    }, 700);
  }

  if (missing) {
    return <div className="empty"><b>No such object</b><Link to="/objects">Back to all objects</Link></div>;
  }
  if (!obj) return <div className="empty"><span className="spinner" /></div>;

  const learned = isLearned("object", obj.id);

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Link to="/objects" style={{ fontSize: 13.5 }}>← All objects</Link>
      </div>

      <div className="page-head" style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 340px", minWidth: 0 }}>
          <h1>{obj.kind}</h1>
          <p>{obj.summary}</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
            <span className="badge api">{obj.apiVersion}</span>
            <span className="badge">{obj.category}</span>
            <span className="badge">{obj.namespaced ? "namespaced" : "cluster-scoped"}</span>
            {obj.shortNames.map((s) => <span key={s} className="badge">{s}</span>)}
          </div>
        </div>
        <button className={`btn${learned ? "" : " btn-primary"}`} onClick={() => toggle("object", obj.id)}>
          {learned ? "✓ Learned" : "Mark as learned"}
        </button>
      </div>

      <div className="detail">
        <div>
          <Prose text={obj.explanation} />

          {obj.whenToUse?.length > 0 && (
            <div className="section">
              <h2>When you would reach for it</h2>
              <ul className="bullets">{obj.whenToUse.map((b, i) => <li key={i}>{b}</li>)}</ul>
            </div>
          )}

          <div className="section">
            <h2>Example manifest</h2>
            <CodeBlock code={obj.example} label="manifest" />
          </div>

          {obj.keyFields?.length > 0 && (
            <div className="section">
              <h2>Fields worth knowing</h2>
              <div className="card" style={{ padding: 4 }}>
                <table className="fields-table">
                  <tbody>
                    {obj.keyFields.map((f) => (
                      <tr key={f.path}><td>{f.path}</td><td>{f.description}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {obj.commonMistakes?.length > 0 && (
            <div className="section">
              <h2>Common mistakes</h2>
              <ul className="bullets">{obj.commonMistakes.map((b, i) => <li key={i}>{b}</li>)}</ul>
            </div>
          )}

          {obj.kubectlTips?.length > 0 && (
            <div className="section">
              <h2>Useful kubectl</h2>
              <div className="cmd-list">
                {obj.kubectlTips.map((t, i) => (
                  <div key={i} className="cmd"><div className="cmdtext">{t}</div></div>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="aside">
          <div className="card">
            <h3>At a glance</h3>
            <div className="meta-row"><span>Kind</span><span>{obj.kind}</span></div>
            <div className="meta-row"><span>apiVersion</span><span>{obj.apiVersion}</span></div>
            <div className="meta-row"><span>Scope</span><span>{obj.namespaced ? "Namespaced" : "Cluster"}</span></div>
            {obj.shortNames.length > 0 && (
              <div className="meta-row"><span>Short names</span><span>{obj.shortNames.join(", ")}</span></div>
            )}
          </div>

          {related.length > 0 && (
            <div className="card">
              <h3>Related</h3>
              <div className="related">
                {related.map((r) => <Link key={r.id} to={`/objects/${r.id}`}>{r.kind}</Link>)}
              </div>
            </div>
          )}

          <div className="card">
            <h3>Your notes {noteSaved && <span style={{ color: "var(--ok)", fontWeight: 600 }}>saved</span>}</h3>
            <textarea className="notepad" value={note} placeholder="Anything you want to remember about this one…"
                      onChange={(e) => editNote(e.target.value)} />
          </div>
        </aside>
      </div>
    </>
  );
}
