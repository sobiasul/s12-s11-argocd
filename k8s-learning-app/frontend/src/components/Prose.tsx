import { Fragment } from "react";

/**
 * A deliberately tiny renderer for the explanation text: paragraphs on blank
 * lines, `inline code` in backticks. No markdown library and no
 * dangerouslySetInnerHTML — content becomes React elements, so there is no path
 * from stored text to executed HTML.
 */
export function Prose({ text }: { text: string }) {
  const paragraphs = text.split(/\n\n+/);
  return (
    <div className="prose">
      {paragraphs.map((p, i) => (
        <p key={i}>{renderInline(p)}</p>
      ))}
    </div>
  );
}

function renderInline(text: string) {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, i) =>
    part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
      <code key={i}>{part.slice(1, -1)}</code>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}
