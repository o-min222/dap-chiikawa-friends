import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
const source = await readFile(new URL('../palette/markdown.js', import.meta.url), 'utf8');
function node(tag = 'fragment') {
  return { tag, children: [], style: {}, dataset: {}, content: '',
    append(...children) { this.children.push(...children); },
    get textContent() { return this.content + this.children.map(child => typeof child === 'string' ? child : child.textContent).join(''); },
    set textContent(value) { this.content = value; this.children = []; },
  };
}
const scope = { window: {}, document: { createElement: node, createDocumentFragment: node } };
runInNewContext(source, scope);
const render = scope.window.ChiikawaMarkdown.renderMarkdown;
function all(root) { return [root, ...root.children.filter(child => typeof child !== 'string').flatMap(all)]; }

test('DAP markdown renders CJK emphasis, paragraphs, headings, lists and tables', () => {
  const result = render('# 제목\n\n**오시(午時)**에 태어났어.\n다음 줄\n\n- **계수(癸水)**\n- 둘\n\n1. 첫째\n2. 둘째\n\n> 인용\n\n| 항목 | 설명 |\n| --- | --- |\n| **시주** | 물 |');
  const nodes = all(result);
  for (const tag of ['h3', 'p', 'br', 'strong', 'ul', 'ol', 'li', 'blockquote', 'table', 'th', 'td']) assert.ok(nodes.some(item => item.tag === tag), tag);
  assert.ok(nodes.some(item => item.tag === 'strong' && item.textContent === '오시(午時)'));
  assert.ok(!result.textContent.includes('**'));
});

test('HTML and code remain inert, and only http links become anchors', () => {
  const result = render('<img src=x onerror=alert(1)>\n\n`<script>bad()</script>`\n\n```js\n**plain** <img onerror=bad()>\n```\n\n[사이트](https://example.com) [위험](javascript:alert(1))');
  const nodes = all(result);
  assert.ok(!nodes.some(item => ['img', 'script', 'iframe'].includes(item.tag)));
  assert.ok(nodes.some(item => item.tag === 'code' && item.textContent === '**plain** <img onerror=bad()>'));
  const links = nodes.filter(item => item.tag === 'a');
  assert.equal(links.length, 1);
  assert.equal(links[0].href, 'https://example.com');
  assert.equal(links[0].rel, 'noopener noreferrer');
  assert.equal(links[0].target, '_blank');
});
