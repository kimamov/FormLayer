import { visit } from 'unist-util-visit';

/**
 * Prepends Astro's `base` to root-relative `<a href="/...">` links in markdown/MDX.
 * Starlight applies `base` to sidebar links but not to author-written content links.
 */
export function rehypeBasePath(base = '/') {
  if (!base || base === '/') {
    return () => {};
  }

  let prefix = base.startsWith('/') ? base : `/${base}`;
  if (prefix.endsWith('/')) {
    prefix = prefix.slice(0, -1);
  }

  return (tree) => {
    visit(tree, 'element', (node) => {
      if (node.tagName !== 'a') return;

      const href = node.properties?.href;
      if (typeof href !== 'string') return;
      if (!href.startsWith('/') || href.startsWith('//')) return;
      if (href === prefix || href.startsWith(`${prefix}/`)) return;

      node.properties.href = `${prefix}${href}`;
    });
  };
}
