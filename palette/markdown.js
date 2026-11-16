// Adapted from DAP renderer/src/markdown-lite.ts. Builds safe DOM nodes.
(() => {
/**
 * Dependency-free markdown subset renderer for chat bubbles.
 *
 * Builds DOM NODES (never innerHTML over model text) so reply content can't inject markup.
 * Covers what LLM replies actually use: headings, bold/italic, inline code, fenced code,
 * links (http/https only, isolated from the chat window), ordered/
 * unordered lists, blockquotes, hr, pipe tables, paragraphs with line breaks. Anything else
 * stays text.
 */

const INLINE_RE = /(\*\*([^*]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\))/;

function renderInline(target             , text        )       {
  let rest = text;
  while (rest.length > 0) {
    const m = INLINE_RE.exec(rest);
    if (!m) {
      target.append(rest);
      return;
    }
    if (m.index > 0) target.append(rest.slice(0, m.index));
    if (m[2] !== undefined) {
      const el = document.createElement("strong");
      renderInline(el, m[2]);
      target.append(el);
    } else if (m[3] !== undefined) {
      const el = document.createElement("em");
      renderInline(el, m[3]);
      target.append(el);
    } else if (m[4] !== undefined) {
      const el = document.createElement("code");
      el.textContent = m[4];
      target.append(el);
    } else if (m[5] !== undefined && m[6] !== undefined) {
      const el = document.createElement("a");
      el.textContent = m[5];
      el.href = m[6];
      el.target = "_blank";
      el.rel = "noopener noreferrer";
      el.title = m[6];
      el.dataset["url"] = m[6];
      target.append(el);
    }
    rest = rest.slice(m.index + m[0].length);
  }
}

/** A table row's cells: outer pipes are optional, and `\|` is a pipe inside a cell. */
function tableCells(line        )           {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|") && !row.endsWith("\\|")) row = row.slice(0, -1);
  const cells           = [];
  let cell = "";
  for (let i = 0; i < row.length; i++) {
    if (row[i] === "\\" && row[i + 1] === "|") {
      cell += "|";
      i++;
    } else if (row[i] === "|") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += row[i];
    }
  }
  cells.push(cell.trim());
  return cells;
}

const DELIMITER_CELL_RE = /^:?-+:?$/;

/** The `| --- | :-: |` line under a table's header, as one alignment per column. */
function tableAlignments(line                    )                                                   {
  if (line === undefined || !line.includes("|")) return null;
  const cells = tableCells(line);
  if (!cells.every((cell) => DELIMITER_CELL_RE.test(cell))) return null;
  return cells.map((cell) =>
    cell.startsWith(":") && cell.endsWith(":") ? "center" : cell.endsWith(":") ? "right" : cell.startsWith(":") ? "left" : null,
  );
}

function renderTable(header          , alignments                              , rows            )                   {
  const table = document.createElement("table");
  const cellIn = (row                     , tag             , text        , col        )       => {
    const cell = document.createElement(tag);
    const align = alignments[col];
    if (align) cell.style.textAlign = align;
    renderInline(cell, text);
    row.append(cell);
  };
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  header.forEach((text, col) => cellIn(headRow, "th", text, col));
  thead.append(headRow);
  table.append(thead);
  if (rows.length > 0) {
    const tbody = document.createElement("tbody");
    for (const cells of rows) {
      const tr = document.createElement("tr");
      // Every row gets the header's columns: short rows are padded, extra cells dropped.
      header.forEach((_, col) => cellIn(tr, "td", cells[col] ?? "", col));
      tbody.append(tr);
    }
    table.append(tbody);
  }
  return table;
}

/** Render markdown into a fragment of safe DOM nodes. */
function renderMarkdown(text        )                   {
  const frag = document.createDocumentFragment();
  const lines = (text ?? "").split("\n");
  let i = 0;
  let paragraph           = [];
  let list                                                                        = null;

  const flushParagraph = ()       => {
    if (paragraph.length === 0) return;
    const p = document.createElement("p");
    paragraph.forEach((line, idx) => {
      if (idx > 0) p.append(document.createElement("br"));
      renderInline(p, line);
    });
    frag.append(p);
    paragraph = [];
  };
  const flushList = ()       => {
    list = null;
  };

  while (i < lines.length) {
    const line = lines[i] ;
    const fence = /^```/.exec(line);
    if (fence) {
      flushParagraph();
      flushList();
      const code           = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i] )) code.push(lines[i++] );
      i++; // closing fence (or EOF)
      const pre = document.createElement("pre");
      const codeEl = document.createElement("code");
      codeEl.textContent = code.join("\n");
      pre.append(codeEl);
      frag.append(pre);
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      // Chat-bubble scale: h1/h2 → h3, deeper → h4 (a giant h1 inside a bubble reads broken).
      const el = document.createElement(heading[1] .length <= 2 ? "h3" : "h4");
      renderInline(el, heading[2] );
      frag.append(el);
      i++;
      continue;
    }
    // A header row is a table only when the delimiter line under it has the same number of
    // columns. The table ends at a blank line or at a line with no pipe, which stays a paragraph.
    const alignments = line.includes("|") ? tableAlignments(lines[i + 1]) : null;
    const header = alignments ? tableCells(line) : null;
    if (alignments && header && header.length === alignments.length) {
      flushParagraph();
      flushList();
      const rows             = [];
      i += 2;
      while (i < lines.length && lines[i] .trim() !== "" && lines[i] .includes("|")) rows.push(tableCells(lines[i++] ));
      frag.append(renderTable(header, alignments, rows));
      continue;
    }
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || ordered) {
      flushParagraph();
      const type              = bullet ? "ul" : "ol";
      if (!list || list.type !== type) {
        const el                                      = document.createElement(type);
        frag.append(el);
        list = { el, type };
      }
      const li = document.createElement("li");
      renderInline(li, (bullet ?? ordered) [1] );
      list.el.append(li);
      i++;
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      flushParagraph();
      flushList();
      const bq = document.createElement("blockquote");
      const parts           = [quote[1] ];
      i++;
      while (i < lines.length) {
        const next = /^>\s?(.*)$/.exec(lines[i] );
        if (!next) break;
        parts.push(next[1] );
        i++;
      }
      parts.forEach((part, idx) => {
        if (idx > 0) bq.append(document.createElement("br"));
        renderInline(bq, part);
      });
      frag.append(bq);
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      flushParagraph();
      flushList();
      frag.append(document.createElement("hr"));
      i++;
      continue;
    }
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      i++;
      continue;
    }
    flushList();
    paragraph.push(line);
    i++;
  }
  flushParagraph();
  return frag;
}

window.ChiikawaMarkdown = { renderMarkdown };
})();
