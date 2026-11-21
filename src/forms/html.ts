/**
 * Small, auto-escaping HTML template for render hooks.
 *
 * ```ts
 * html`<span aria-hidden="true">${flag}</span> ${label}`
 * ```
 *
 * - Strings and numbers are escaped, in text and in quoted attributes.
 * - Nodes, fragments and arrays of them are inserted as nodes (in text positions only).
 * - `raw(markup)` inserts trusted markup unescaped.
 * - `null`, `undefined` and `false` render nothing.
 *
 * Returns a `DocumentFragment`.
 */
export type HtmlValue = string | number | boolean | null | undefined | Node | RawHtml | HtmlValue[];

export class RawHtml {
  constructor(readonly markup: string) {}
}

/** Mark trusted markup to be inserted without escaping. Never pass user input. */
export function raw(markup: string): RawHtml {
  return new RawHtml(markup);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const SLOT = 'fl-slot-';

export function html(strings: TemplateStringsArray, ...values: HtmlValue[]): DocumentFragment {
  const nodes: Node[] = [];
  let markup = strings[0];

  const serialize = (value: HtmlValue): string => {
    if (value === null || value === undefined || value === false) return '';
    if (Array.isArray(value)) return value.map(serialize).join('');
    if (value instanceof RawHtml) return value.markup;
    if (typeof Node !== 'undefined' && value instanceof Node) {
      nodes.push(value);
      return `<!--${SLOT}${nodes.length - 1}-->`;
    }
    return escapeHtml(String(value));
  };

  values.forEach((value, i) => {
    markup += serialize(value) + strings[i + 1];
  });

  const template = document.createElement('template');
  template.innerHTML = markup;
  const fragment = template.content;

  if (nodes.length > 0) {
    const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_COMMENT);
    const slots: Comment[] = [];
    while (walker.nextNode()) {
      const comment = walker.currentNode as Comment;
      if (comment.data.startsWith(SLOT)) slots.push(comment);
    }
    for (const slot of slots) {
      const node = nodes[Number(slot.data.slice(SLOT.length))];
      if (node) slot.replaceWith(node);
    }
  }

  // Returned as-is (not cloned) so inserted nodes keep their identity and listeners.
  return fragment;
}
