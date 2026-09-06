import { useState } from "react";

/** A YAML/shell block with copy-to-clipboard. Copying is the single most-used
 *  action on a cheat sheet, so it gets a real affordance rather than a footnote. */
export function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // clipboard API needs a secure context; fall back for plain http clusters
      const ta = document.createElement("textarea");
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="code">
      <button className={`copy${copied ? " done" : ""}`} onClick={copy}
              aria-label={copied ? "Copied" : `Copy ${label ?? "code"}`}>
        {copied ? "✓ copied" : "copy"}
      </button>
      <pre><code>{code}</code></pre>
    </div>
  );
}
