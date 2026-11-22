/**
 * One polite live region per page, for announcing errors that appear when the
 * user leaves or changes a field. Announcements wait a moment, so they don't
 * talk over the screen reader reading the next focused field, and are cleared
 * once the field is fixed. After a failed submit nothing is announced here:
 * focus moves to the first problem instead, which reads its error.
 */
const DELAY_MS = 500;

let region: HTMLElement | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let owner: unknown = null;

function liveRegion(): HTMLElement {
  if (region?.isConnected) return region;
  region = document.querySelector<HTMLElement>('[data-fl-live-region]');
  if (!region) {
    region = document.createElement('div');
    region.setAttribute('data-fl-live-region', '');
    region.setAttribute('aria-live', 'polite');
    region.className = 'fl-visually-hidden';
    // Inline fallback so the region stays invisible even without base.css.
    region.style.cssText = 'position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0;';
    document.body.append(region);
  }
  return region;
}

/** Announce `message` politely after a short delay. `source` identifies who announced, for {@link clearAnnouncement}. */
export function announce(message: string, source?: unknown): void {
  const el = liveRegion();
  if (timer) clearTimeout(timer);
  el.textContent = '';
  owner = source ?? null;
  timer = setTimeout(() => {
    timer = null;
    el.textContent = message;
  }, DELAY_MS);
}

/** Clear the current announcement if `source` made it (a fixed field shouldn't leave its error behind). */
export function clearAnnouncement(source: unknown): void {
  if (owner !== source) return;
  if (timer) clearTimeout(timer);
  timer = null;
  owner = null;
  if (region) region.textContent = '';
}

/** Text as a screen reader reads it: `aria-hidden` parts removed, whitespace collapsed. */
export function spokenText(node: Node): string {
  const copy = node.cloneNode(true) as Element;
  copy.querySelectorAll?.('[aria-hidden="true"]').forEach((n) => n.remove());
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
}
