/**
 * Tracks a submit button the user is pressing with a pointer.
 *
 * Pressing a button blurs the field the user was in. If that blur shows an
 * error, the layout shifts and the button can move away from under the
 * pointer before it is released, so the click is lost. Fields therefore hold
 * back blur validation while a submit button of their form is pressed: the
 * submit validates anyway, and a `formnovalidate` button (Back) shouldn't.
 */
type Submitter = HTMLButtonElement | HTMLInputElement;

const SUBMITTER = 'button:not([type="button"]):not([type="reset"]), input[type="submit"], input[type="image"]';

let pressed: Submitter | null = null;
let pending: Array<() => void> = [];
let installed = false;

function release(): void {
  // Run after the click (and the submit it starts) has been dispatched.
  setTimeout(() => {
    pressed = null;
    const callbacks = pending;
    pending = [];
    for (const callback of callbacks) callback();
  }, 0);
}

function install(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('pointerdown', (event) => {
    pressed = (event.target as Element | null)?.closest?.<Submitter>(SUBMITTER) ?? null;
  }, true);
  document.addEventListener('pointerup', release, true);
  document.addEventListener('pointercancel', release, true);
}

/** Start tracking (idempotent). */
export function trackPressedSubmitter(): void {
  install();
}

/** The submit button of `form` being pressed right now, if any. */
export function pressedSubmitter(form: HTMLFormElement | null): Submitter | null {
  return form && pressed?.form === form ? pressed : null;
}

/** Call `callback` once the pressed button is released (after its click). */
export function afterRelease(callback: () => void): void {
  pending.push(callback);
}
