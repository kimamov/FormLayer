#!/usr/bin/env node
/**
 * Capability check for the playground scenarios.
 *
 * Starts the playground dev server, drives every scenario in Chromium and
 * records which expected behaviours the current library supports. The result
 * is written to playground/CAPABILITIES.md. Failing checks are expected: they
 * show what the roadmap has to fix. Re-run after each milestone.
 *
 *   npm run playground:check
 *
 * Needs Playwright with Chromium (`npm i -D playwright && npx playwright install chromium`).
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(context, base, path, { initScript } = {}) {
  const page = await context.newPage();
  page.logs = [];
  page.on('console', (msg) => page.logs.push(`${msg.type()}: ${msg.text()}`));
  page.on('pageerror', (err) => page.logs.push(`pageerror: ${err.message}`));
  if (initScript) await page.addInitScript(initScript);
  await page.goto(base + path);
  await page.waitForFunction(() => window.__FormsModule && window.__FormsModule.getAll().size > 0);
  await wait(300); // lazy plugins and fields
  return page;
}

const text = (page, selector) =>
  page.$eval(selector, (el) => el.textContent.trim()).catch(() => '');

const fieldNames = (page, formId) =>
  page.evaluate((id) => Object.keys(window.__FormsModule.get(id)?.getState().fields ?? {}), formId);

const fieldValue = (page, formId, name) =>
  page.evaluate(([id, n]) => window.__FormsModule.get(id)?.getField(n)?.value, [formId, name]);

const isHidden = (page, selector) =>
  page.$eval(selector, (el) => el.hidden || !!el.closest('[hidden]')).catch(() => null);

async function waitForText(page, selector, includes, timeout = 3000) {
  try {
    await page.waitForFunction(
      ([sel, inc]) => (document.querySelector(sel)?.textContent ?? '').includes(inc),
      [selector, includes],
      { timeout },
    );
    return true;
  } catch {
    return false;
  }
}

async function fillContact(page, overrides = {}) {
  const v = { name: 'Ada Lovelace', email: 'ada@example.com', message: 'Hello, I have a question.', ...overrides };
  await page.fill('#name', v.name);
  await page.fill('#email', v.email);
  await page.click('label[for="topic-support"]');
  await page.fill('#message', v.message);
  await page.check('#consent');
}

const submit = (page) => page.click('form button[type="submit"]:not([formnovalidate])');

// ---------------------------------------------------------------------------
// checks: { id, title, roadmap, run(context, base) => { pass, note? } }
// roadmap = issue draft in roadmap/issues/ that should make it pass (mapped to GitHub issues below)
// ---------------------------------------------------------------------------

const scenarios = [
  {
    name: '01 · Contact (baseline)',
    path: '/scenarios/01-contact.html',
    checks: [
      {
        id: 'C1', roadmap: '03',
        title: 'Focusing and leaving an empty required field without typing shows no error yet',
        async run(page) {
          await page.focus('#name');
          await page.keyboard.press('Tab');
          await wait(100);
          const error = await text(page, '#name-errors');
          return { pass: error === '', note: error ? `shows "${error}" on first blur` : '' };
        },
      },
      {
        id: 'C2', roadmap: '01',
        title: '`required` stays exposed to assistive technology (`required` or `aria-required`)',
        async run(page) {
          const exposed = await page.$eval('#name', (el) => el.hasAttribute('required') || el.getAttribute('aria-required') === 'true');
          return { pass: exposed, note: exposed ? '' : 'FieldController strips `required` and adds nothing back' };
        },
      },
      {
        id: 'C3', roadmap: '02',
        title: 'Controls start with `aria-invalid="false"` (avoids early "invalid" in Firefox/Safari)',
        async run(page) {
          const value = await page.$eval('#name', (el) => el.getAttribute('aria-invalid'));
          return { pass: value === 'false', note: `aria-invalid=${JSON.stringify(value)}` };
        },
      },
      {
        id: 'C4', roadmap: '—',
        title: 'Failed submit focuses the first invalid field and links its error with `aria-describedby`',
        async run(page) {
          await submit(page);
          await wait(300);
          const r = await page.evaluate(() => ({
            focused: document.activeElement?.id,
            describedby: document.querySelector('#name')?.getAttribute('aria-describedby') ?? '',
          }));
          return { pass: r.focused === 'name' && r.describedby.includes('name-errors'), note: `focus=#${r.focused}` };
        },
      },
      {
        id: 'C5', roadmap: '08',
        title: 'An error that appears on blur is announced through a polite live region',
        async run(page) {
          await page.fill('#email', 'not-an-email');
          await page.keyboard.press('Tab');
          await wait(800);
          const announced = await page.evaluate(() =>
            [...document.querySelectorAll('[aria-live], [role="status"], [role="alert"]')].some((el) => el.textContent.trim()));
          return { pass: announced, note: announced ? '' : 'no live region' };
        },
      },
      {
        id: 'C6', roadmap: '03',
        title: 'A rule marked `"server": true` is skipped on the client without a console warning',
        async run(page) {
          await page.fill('#email', 'ada@example.com');
          await page.keyboard.press('Tab');
          await wait(100);
          const warning = page.logs.find((l) => l.includes('UniqueEmail'));
          return { pass: !warning, note: warning ?? '' };
        },
      },
      {
        id: 'C7', roadmap: '—',
        title: 'A server-only error ("email already registered") appears on the email field after submit',
        async run(page) {
          await fillContact(page, { email: 'taken@example.com' });
          await submit(page);
          return { pass: await waitForText(page, '#email-errors', 'already registered') };
        },
      },
      {
        id: 'C8', roadmap: '06',
        title: 'A form-level server error (spam filter) is rendered in the form error container',
        async run(page) {
          await fillContact(page, { message: 'This looks like spam to the filter.' });
          await submit(page);
          await wait(1200);
          const shown = await text(page, '[data-fl-form-errors]');
          return { pass: shown !== '', note: shown ? '' : '`errors.__form` is dropped by applyValidationErrors' };
        },
      },
      {
        id: 'C9', roadmap: '06',
        title: 'After a successful submit, focus moves to the confirmation message',
        async run(page) {
          await fillContact(page);
          await submit(page);
          const done = await waitForText(page, '[data-form-success]', 'sent');
          const focusInside = await page.evaluate(() => !!document.activeElement?.closest('[data-form-success]'));
          return { pass: done && focusInside, note: done ? `focus on <${await page.evaluate(() => document.activeElement?.tagName.toLowerCase())}>` : 'no confirmation' };
        },
      },
      {
        id: 'C10', roadmap: '01',
        title: 'Choosing the 2nd radio option updates the field value',
        async run(page) {
          await page.click('label[for="topic-sales"]');
          await wait(100);
          const value = await fieldValue(page, 'contact', 'topic');
          return { pass: value === 'sales', note: `value=${JSON.stringify(value)} (listeners only on the first radio)` };
        },
      },
      {
        id: 'C11', roadmap: '02',
        title: 'A radio group error is linked to the group (fieldset) or to every radio',
        async run(page) {
          await submit(page);
          await wait(300);
          const r = await page.evaluate(() => ({
            fieldset: document.querySelector('fieldset[data-form-field="topic"]')?.getAttribute('aria-describedby') ?? '',
            second: document.querySelector('#topic-sales')?.getAttribute('aria-describedby') ?? '',
            first: document.querySelector('#topic-support')?.getAttribute('aria-describedby') ?? '',
          }));
          const pass = r.fieldset.includes('topic-errors') || r.second.includes('topic-errors');
          return { pass, note: pass ? '' : `only first radio: ${JSON.stringify(r.first)}` };
        },
      },
    ],
  },
  {
    name: '02 · Address (nested names, conditional group)',
    path: '/scenarios/02-address.html',
    checks: [
      {
        id: 'A1', roadmap: '—',
        title: 'Fields with nested names register under dotted names (`billing.city`)',
        async run(page) {
          const names = await fieldNames(page, 'address');
          const pass = ['billing.name', 'billing.city', 'shipping.city'].every((n) => names.includes(n));
          return { pass, note: pass ? '' : names.join(', ') };
        },
      },
      {
        id: 'A2', roadmap: '09',
        title: '`data-client-variants` on a fieldset hides the whole shipping group',
        async run(page) {
          const hidden = await isHidden(page, '#shipping');
          return { pass: hidden === true, note: hidden ? '' : 'conditions only work on `[data-form-field]` wrappers' };
        },
      },
      {
        id: 'A3', roadmap: '09',
        title: 'With "ship to billing address" ticked, the hidden shipping fields don’t block the submit',
        async run(page) {
          await page.fill('#billing-name', 'Ada Lovelace');
          await page.fill('#billing-address', '12 Example Street');
          await page.fill('#billing-city', 'Vienna');
          await page.selectOption('#billing-country', 'AT');
          await submit(page);
          const done = await waitForText(page, '[data-form-success]', 'saved');
          return { pass: done, note: done ? '' : `blocked by: ${await text(page, '#shipping-name-errors')}` };
        },
      },
      {
        id: 'A4', roadmap: '—',
        title: 'A server error keyed by a nested path (`billing.postalCode`) appears on that field',
        async run(page) {
          await page.fill('#billing-name', 'Ada Lovelace');
          await page.fill('#billing-address', '12 Example Street');
          await page.fill('#billing-postal-code', '00000');
          await page.fill('#billing-city', 'Vienna');
          await page.selectOption('#billing-country', 'AT');
          // Shipping fields are required while A2 fails, so fill them too.
          await page.fill('#shipping-name', 'Ada Lovelace');
          await page.fill('#shipping-address', '12 Example Street');
          await page.fill('#shipping-city', 'Vienna');
          await submit(page);
          return { pass: await waitForText(page, '#billing-postal-code-errors', 'deliver') };
        },
      },
    ],
  },
  {
    name: '03 · Conditional fields',
    path: '/scenarios/03-conditional.html',
    checks: [
      {
        id: 'K1', roadmap: '—',
        title: 'Choosing the 1st radio option ("Email") shows the email field',
        async run(page) {
          await page.click('label[for="pref-email"]');
          await wait(300);
          return { pass: (await isHidden(page, '[data-form-field="email"]')) === false };
        },
      },
      {
        id: 'K2', roadmap: '01',
        title: 'Choosing the 2nd radio option ("Phone") directly shows the phone field',
        async run(page) {
          // Click "Phone" first. Focusing "Email" before would mask the bug via its blur listener.
          await page.click('label[for="pref-phone"]');
          await wait(300);
          const phone = await isHidden(page, '[data-form-field="phone"]');
          const email = await isHidden(page, '[data-form-field="email"]');
          return { pass: phone === false && email === true, note: `phone hidden=${phone}, email hidden=${email} (listeners only on the first radio)` };
        },
      },
      {
        id: 'K3', roadmap: '—',
        title: '"Somewhere else" reveals the "Where else?" field, which is then required',
        async run(page) {
          await page.selectOption('#referral', 'other');
          await wait(300);
          const visible = (await isHidden(page, '[data-form-field="referralOther"]')) === false;
          await submit(page);
          await wait(300);
          const error = await text(page, '#referral-other-errors');
          return { pass: visible && error !== '', note: `visible=${visible}, error=${JSON.stringify(error)}` };
        },
      },
      {
        id: 'K4', roadmap: '09',
        title: 'Chained condition: unticking "company" also hides "account manager"',
        async run(page) {
          await page.check('#has-company');
          await wait(200);
          await page.selectOption('#company-size', 'large');
          await wait(200);
          const shownBefore = (await isHidden(page, '[data-form-field="accountManager"]')) === false;
          await page.uncheck('#has-company');
          await wait(300);
          const hiddenAfter = await isHidden(page, '[data-form-field="accountManager"]');
          return { pass: shownBefore && hiddenAfter === true, note: `shown first=${shownBefore}, hidden after=${hiddenAfter} (hidden fields keep their value in conditions)` };
        },
      },
      {
        id: 'K5', roadmap: '—',
        title: 'Hidden required fields don’t block the submit',
        async run(page) {
          await page.click('label[for="pref-email"]');
          await wait(200);
          await page.fill('#email', 'ada@example.com');
          await submit(page);
          return { pass: await waitForText(page, '[data-form-success]', 'saved') };
        },
      },
      {
        id: 'K6', roadmap: '09',
        title: 'Conditional fields are already hidden at DOMContentLoaded (no flash of hidden fields)',
        initScript: () => {
          document.addEventListener('DOMContentLoaded', () => {
            window.__hiddenAtDcl = document.querySelector('[data-form-field="phone"]')?.hidden ?? null;
          });
        },
        async run(page) {
          const hidden = await page.evaluate(() => window.__hiddenAtDcl);
          return { pass: hidden === true, note: hidden ? '' : 'the conditions plugin is lazy-loaded after DOMContentLoaded' };
        },
      },
    ],
  },
  {
    name: '04 · Repeatable group',
    path: '/scenarios/04-repeatable.html',
    checks: [
      {
        id: 'R1', roadmap: '—',
        title: 'Adding a participant registers the new row’s fields',
        async run(page) {
          await page.click('[data-repeatable-add]');
          await wait(200);
          return { pass: (await fieldNames(page, 'repeatable')).includes('participants.1.name') };
        },
      },
      {
        id: 'R2', roadmap: '—',
        title: 'The new row is validated on submit',
        async run(page) {
          await page.click('[data-repeatable-add]');
          await page.fill('#organizer-email', 'ada@example.com');
          await page.fill('#participants-0-name', 'Ada');
          await page.fill('#participants-0-email', 'ada@example.com');
          await submit(page);
          await wait(300);
          return { pass: (await text(page, '#participants-1-name-errors')) !== '' };
        },
      },
      {
        id: 'R3', roadmap: '—',
        title: 'Removing a row unregisters its fields',
        async run(page) {
          await page.click('[data-repeatable-add]');
          await wait(100);
          await page.locator('[data-repeatable-remove]').nth(1).click();
          await wait(200);
          return { pass: !(await fieldNames(page, 'repeatable')).includes('participants.1.name') };
        },
      },
      {
        id: 'R4', roadmap: '—',
        title: 'A per-row server error (`participants.1.email`) appears on the right row',
        async run(page) {
          await page.click('[data-repeatable-add]');
          await page.fill('#organizer-email', 'ada@example.com');
          for (const i of [0, 1]) {
            await page.fill(`#participants-${i}-name`, `Person ${i}`);
            await page.fill(`#participants-${i}-email`, 'same@example.com');
          }
          await submit(page);
          return { pass: await waitForText(page, '#participants-1-email-errors', 'own email') };
        },
      },
      {
        id: 'R5', roadmap: '10',
        title: 'Repeatable groups (add/remove, numbering, limits, focus, announcements) work without integrator code',
        async run() {
          const source = readFileSync(resolve(here, 'src/integrator/repeatable.ts'), 'utf8');
          const lines = source.split('\n').filter((l) => l.trim() && !/^\s*(\/\/|\/\*|\*)/.test(l)).length;
          return { pass: false, note: `${lines} lines of integrator code (src/integrator/repeatable.ts)` };
        },
      },
    ],
  },
  {
    name: '05 · Cross-field rules',
    path: '/scenarios/05-cross-field.html',
    checks: [
      {
        id: 'X1', roadmap: '03',
        title: 'Passwords that don’t match show an error (`Equals`)',
        async run(page) {
          await page.fill('#password', 'abcdefgh');
          await page.fill('#password-repeat', 'abcdefgx');
          await page.keyboard.press('Tab');
          await wait(100);
          return { pass: (await text(page, '#password-repeat-errors')) !== '' };
        },
      },
      {
        id: 'X2', roadmap: '03',
        title: 'Changing the password re-validates the confirmation field',
        async run(page) {
          await page.fill('#password', 'abcdefgh');
          await page.fill('#password-repeat', 'abcdefgh');
          await page.keyboard.press('Tab');
          await wait(500); // let the debounced input validation settle, like a real user pause
          await page.fill('#password', 'zzzzzzzz');
          await page.keyboard.press('Tab');
          await wait(400);
          return { pass: (await text(page, '#password-repeat-errors')) !== '', note: 'validators can’t declare dependencies' };
        },
      },
      {
        id: 'X3', roadmap: '03',
        title: 'An end date before the start date shows an error (`DateNotBefore`)',
        async run(page) {
          await page.fill('#start-date', '2026-12-10');
          await page.fill('#end-date', '2026-12-01');
          await page.focus('#end-date');
          await page.keyboard.press('Tab');
          await wait(100);
          return { pass: (await text(page, '#end-date-errors')) !== '' };
        },
      },
      {
        id: 'X4', roadmap: '03',
        title: 'The form-level rule "phone or backup email" (`data-validate-form`) is enforced',
        async run(page) {
          await page.fill('#email', 'ada@example.com');
          await page.fill('#password', 'abcdefgh');
          await page.fill('#password-repeat', 'abcdefgh');
          await page.fill('#start-date', '2026-12-01');
          await page.fill('#end-date', '2026-12-10');
          await submit(page);
          await wait(1200);
          const shown = await text(page, '[data-fl-form-errors]');
          return { pass: shown !== '', note: shown ? '' : 'no form-level rules on the client; the server error is dropped' };
        },
      },
    ],
  },
  {
    name: '06 · Multistep (server-rendered steps)',
    path: '/scenarios/06-multistep.html',
    checks: [
      {
        id: 'M1', roadmap: '—',
        title: '"Continue" swaps in step 2 from the server and enhances its fields',
        async run(page) {
          await page.fill('#trip-fullName', 'Ada Lovelace');
          await page.fill('#trip-email', 'ada@example.com');
          await submit(page);
          await page.waitForSelector('#trip-step-2', { timeout: 3000 }).catch(() => null);
          await wait(200);
          return { pass: (await fieldNames(page, 'trip')).includes('destination') };
        },
      },
      {
        id: 'M2', roadmap: '06',
        title: 'Focus moves to the new step’s heading',
        async run(page) {
          await page.fill('#trip-fullName', 'Ada Lovelace');
          await page.fill('#trip-email', 'ada@example.com');
          await submit(page);
          await page.waitForSelector('#trip-step-2', { timeout: 3000 }).catch(() => null);
          await wait(200);
          const focused = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName.toLowerCase());
          return { pass: focused === 'trip-step-2', note: `focus on ${focused}` };
        },
      },
      {
        id: 'M3', roadmap: '01',
        title: 'The Back button (`formnovalidate`) skips client validation',
        async run(page) {
          await page.fill('#trip-fullName', 'Ada Lovelace');
          await page.fill('#trip-email', 'ada@example.com');
          await submit(page);
          await page.waitForSelector('#trip-step-2', { timeout: 3000 });
          await page.fill('#trip-travellers', '');
          await page.click('button[formnovalidate]');
          const back = await page.waitForSelector('#trip-step-1', { timeout: 2000 }).then(() => true).catch(() => false);
          return { pass: back, note: back ? '' : `stuck on step 2: ${await text(page, '#trip-travellers-errors')}` };
        },
      },
      {
        id: 'M4', roadmap: '—',
        title: 'A server error on step 2 ("Atlantis is fully booked") appears on its field',
        async run(page) {
          await page.fill('#trip-fullName', 'Ada Lovelace');
          await page.fill('#trip-email', 'ada@example.com');
          await submit(page);
          await page.waitForSelector('#trip-step-2', { timeout: 3000 });
          await wait(200);
          await page.selectOption('#trip-destination', 'atlantis');
          await submit(page);
          return { pass: await waitForText(page, '#trip-destination-errors', 'fully booked') };
        },
      },
    ],
  },
  {
    name: '07 · Widgets',
    path: '/scenarios/07-widgets.html',
    checks: [
      {
        id: 'W1', roadmap: '03',
        title: 'The TYPO3 `Count` rule on a checkbox group is enforced on the client',
        async run(page) {
          await submit(page);
          await wait(300);
          const error = await text(page, '#interests-errors');
          const unknown = page.logs.some((l) => l.includes('Unknown validator type: "Count"'));
          return { pass: error !== '', note: unknown ? 'unknown validator `Count`' : '' };
        },
      },
      {
        id: 'W2', roadmap: '01',
        title: 'Ticking the 2nd checkbox in a group updates the field value',
        async run(page) {
          await page.click('label[for="interests-code"]');
          await wait(100);
          const value = await fieldValue(page, 'widgets', 'interests');
          return { pass: String(value).includes('code'), note: `value=${JSON.stringify(value)}` };
        },
      },
      {
        id: 'W3', roadmap: '07',
        title: 'The combobox keeps the `<optgroup>` groups',
        async run(page) {
          await page.click('[data-form-field="country"] [role="combobox"]');
          await wait(200);
          const groups = await page.$$eval('[role="listbox"]:not([hidden]) [role="group"]', (els) => els.length);
          return { pass: groups > 0, note: `${groups} groups in the open listbox` };
        },
      },
      {
        id: 'W4', roadmap: '07',
        title: 'The combobox uses the server-rendered listbox (flags) from `data-fl-part="listbox"`',
        async run(page) {
          await page.click('[data-form-field="country"] [role="combobox"]');
          await wait(200);
          const hasFlag = await page.$$eval('[role="listbox"]:not([hidden]) [role="option"]', (els) => els.some((el) => el.textContent.includes('🇩🇪')));
          return { pass: hasFlag, note: hasFlag ? '' : 'listbox is generated from <select> text only' };
        },
      },
      {
        id: 'W5', roadmap: '—',
        title: '`FileSize` rejects a file larger than 1 MB',
        async run(page) {
          await page.setInputFiles('#portfolio', { name: 'big.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(2 * 1024 * 1024) });
          await wait(200);
          return { pass: (await text(page, '#portfolio-errors')) !== '' };
        },
      },
      {
        id: 'W6', roadmap: '03',
        title: 'The TYPO3 `MimeType` rule rejects a non-PDF file',
        async run(page) {
          await page.setInputFiles('#portfolio', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
          await wait(200);
          const unknown = page.logs.some((l) => l.includes('Unknown validator type: "MimeType"'));
          return { pass: (await text(page, '#portfolio-errors')) !== '', note: unknown ? 'unknown validator `MimeType`' : '' };
        },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------

const server = await createServer({
  configFile: resolve(here, 'vite.config.ts'),
  server: { port: 5199, strictPort: false },
  logLevel: 'error',
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');

const browser = await chromium.launch();
const context = await browser.newContext();
const results = [];

try {
  for (const scenario of scenarios) {
    for (const check of scenario.checks) {
      let outcome;
      let page;
      try {
        page = await open(context, base, scenario.path, { initScript: check.initScript });
        outcome = await check.run(page);
      } catch (err) {
        outcome = { pass: false, note: `error: ${err.message.split('\n')[0]}` };
      } finally {
        await page?.close();
      }
      results.push({ scenario: scenario.name, ...check, ...outcome });
      console.log(`${outcome.pass ? '✓' : '✗'} ${check.id} ${check.title}${outcome.note ? `  (${outcome.note})` : ''}`);
    }
  }
} finally {
  await browser.close();
  await server.close();
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

const ISSUES = { '01': 6, '02': 8, '03': 9, '04': 7, '05': 10, '06': 11, '07': 12, '08': 13, '09': 14, '10': 15 };
const issueLink = (draft) => (ISSUES[draft] ? `[#${ISSUES[draft]}](https://github.com/kimamov/FormLayer/issues/${ISSUES[draft]})` : '—');
const passed = results.filter((r) => r.pass).length;
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');
let md = `# Playground capabilities\n\n`;
md += `Generated by \`npm run playground:check\` on ${new Date().toISOString().slice(0, 10)}. **${passed} of ${results.length} checks pass.**\n\n`;
md += `A ✗ is expected until the issue in the last column is done (\`—\` means it already works). All issues are sub-issues of [#5](https://github.com/kimamov/FormLayer/issues/5). See [FINDINGS.md](FINDINGS.md) for the analysis.\n`;
for (const scenario of scenarios) {
  md += `\n## ${scenario.name}\n\n| | ID | Check | Note | Roadmap |\n|---|---|---|---|---|\n`;
  for (const r of results.filter((x) => x.scenario === scenario.name)) {
    md += `| ${r.pass ? '✓' : '✗'} | ${r.id} | ${esc(r.title)} | ${esc(r.pass ? '' : r.note)} | ${issueLink(r.roadmap)} |\n`;
  }
}
writeFileSync(resolve(here, 'CAPABILITIES.md'), md);
console.log(`\n${passed}/${results.length} checks pass → playground/CAPABILITIES.md`);
