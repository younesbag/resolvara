import type { ReactNode } from "react";

// Small, dependency-free Markdown renderer for our own content files
// (standard.md, vendor guides, FAQ). Output is built from React elements, never
// from raw HTML, so content cannot inject markup.
// Supported: h1-h4, paragraphs, bullet and numbered lists, blockquotes, fenced
// code, tables, horizontal rules, **bold**, *italic*, `code`, [links](url), bare URLs.

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export interface Heading {
  level: number;
  text: string;
  id: string;
}

export function extractHeadings(md: string): Heading[] {
  const out: Heading[] = [];
  let inCode = false;
  for (const line of md.split(/\r?\n/)) {
    if (line.startsWith("```")) inCode = !inCode;
    if (inCode) continue;
    const m = /^(#{1,4})\s+(.*)$/.exec(line);
    if (m) {
      const text = m[2].replace(/[*`]/g, "").trim();
      out.push({ level: m[1].length, text, id: slugify(text) });
    }
  }
  return out;
}

const INLINE =
  /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|https?:\/\/[^\s)<]+|\*[^*\s][^*]*\*)/g;

function isSafeHref(href: string): boolean {
  return /^(https?:\/\/|\/|#|mailto:)/i.test(href);
}

function renderInline(text: string, keyBase: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    const idx = m.index ?? 0;
    if (idx > last) parts.push(text.slice(last, idx));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (tok.startsWith("**")) {
      parts.push(<strong key={key}>{renderInline(tok.slice(2, -2), key)}</strong>);
    } else if (tok.startsWith("`")) {
      parts.push(<code key={key}>{tok.slice(1, -1)}</code>);
    } else if (tok.startsWith("[")) {
      const lm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok);
      if (lm && isSafeHref(lm[2])) {
        const external = /^https?:/i.test(lm[2]);
        parts.push(
          <a
            key={key}
            href={lm[2]}
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {lm[1]}
          </a>,
        );
      } else parts.push(tok);
    } else if (tok.startsWith("http")) {
      const clean = tok.replace(/[.,;]+$/, "");
      parts.push(
        <a key={key} href={clean} target="_blank" rel="noopener noreferrer">
          {clean}
        </a>,
      );
      if (clean.length < tok.length) parts.push(tok.slice(clean.length));
    } else {
      parts.push(<em key={key}>{tok.slice(1, -1)}</em>);
    }
    last = idx + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;

  const isSpecial = (l: string) =>
    /^(#{1,4}\s|```|>\s?|\s*[-*]\s+|\s*\d+\.\s+|\|.*\||---+\s*$)/.test(l);

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const key = `b${k++}`;

    if (line.startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]);
      i++;
      blocks.push(
        <pre key={key}>
          <code>{buf.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const text = h[2].trim();
      const id = slugify(text.replace(/[*`]/g, ""));
      const content = renderInline(text, key);
      const level = h[1].length;
      if (level === 1) blocks.push(<h1 key={key} id={id}>{content}</h1>);
      else if (level === 2) blocks.push(<h2 key={key} id={id}>{content}</h2>);
      else if (level === 3) blocks.push(<h3 key={key} id={id}>{content}</h3>);
      else blocks.push(<h4 key={key} id={id} className="font-semibold text-ink">{content}</h4>);
      i++;
      continue;
    }

    if (/^---+\s*$/.test(line)) {
      blocks.push(<hr key={key} />);
      i++;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push(<blockquote key={key}>{renderInline(buf.join(" "), key)}</blockquote>);
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const head = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      blocks.push(
        <div className="table-wrap" key={key}>
          <table>
            <thead>
              <tr>
                {head.map((c, ci) => (
                  <th key={ci}>{renderInline(c, `${key}h${ci}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td key={ci}>{renderInline(c, `${key}r${ri}c${ci}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const ul = /^\s*[-*]\s+/.test(line);
    const ol = /^\s*\d+\.\s+/.test(line);
    if (ul || ol) {
      const re = ul ? /^\s*[-*]\s+(.*)$/ : /^\s*\d+\.\s+(.*)$/;
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i])) {
        let item = (re.exec(lines[i]) as RegExpExecArray)[1];
        i++;
        // continuation lines (indented, not a new item)
        while (
          i < lines.length &&
          lines[i].trim() &&
          /^\s{2,}\S/.test(lines[i]) &&
          !/^\s*([-*]|\d+\.)\s+/.test(lines[i])
        ) {
          item += " " + lines[i].trim();
          i++;
        }
        items.push(item);
      }
      const lis = items.map((it, ii) => <li key={ii}>{renderInline(it, `${key}l${ii}`)}</li>);
      blocks.push(ul ? <ul key={key}>{lis}</ul> : <ol key={key}>{lis}</ol>);
      continue;
    }

    const buf: string[] = [line.trim()];
    i++;
    while (i < lines.length && lines[i].trim() && !isSpecial(lines[i])) {
      buf.push(lines[i].trim());
      i++;
    }
    blocks.push(<p key={key}>{renderInline(buf.join(" "), key)}</p>);
  }

  return <div className="prose-doc">{blocks}</div>;
}
