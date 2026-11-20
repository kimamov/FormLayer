/**
 * Server-side form definitions for the playground mock backend.
 *
 * Each form re-implements its rules on the "server", the way TYPO3 does. Client
 * rules mirror these through `data-validate`. Some rules exist only here (e.g.
 * "email already registered"), to exercise server-only and server-authoritative
 * validation.
 *
 * Error keys are the `data-form-field` names (dotted paths for nested fields,
 * e.g. `billing.postalCode`, `participants.1.email`). `__form` holds form-level errors.
 */

export type FormValues = Record<string, string | string[]>;
export type Errors = Record<string, string[]>;

export interface SubmitResult {
  valid: boolean;
  errors: Errors;
  finished: boolean;
  message?: string;
  html?: string;
  page?: { current: number; total: number };
}

export interface FormDefinition {
  validate(values: FormValues): Errors;
  submit(values: FormValues): SubmitResult;
  /** Server-rendered markup for `<!-- ssr:id -->` placeholders. */
  render?(): string;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** `billing[postalCode]` → `billing.postalCode`, `participants[1][email]` → `participants.1.email` */
function dotted(values: FormValues): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    const path = key.replace(/\]\[/g, '.').replace(/\[/g, '.').replace(/\]/g, '');
    out[path] = Array.isArray(value) ? value.join(',') : value;
  }
  return out;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class Collector {
  readonly errors: Errors = {};
  add(field: string, message: string): void {
    (this.errors[field] ??= []).push(message);
  }
  required(v: Record<string, string>, field: string, message: string): boolean {
    if (!(v[field] ?? '').trim()) {
      this.add(field, message);
      return false;
    }
    return true;
  }
  email(v: Record<string, string>, field: string): void {
    const value = v[field] ?? '';
    if (value && !EMAIL.test(value)) this.add(field, 'Enter an email address like name@example.com.');
  }
}

function finished(message: string): SubmitResult {
  return {
    valid: true,
    errors: {},
    finished: true,
    message: `<div class="confirmation" role="status" data-form-success><h2>${message}</h2><p>This message came from the mock server.</p></div>`,
  };
}

function result(errors: Errors, successMessage: string): SubmitResult {
  return Object.keys(errors).length > 0
    ? { valid: false, errors, finished: false }
    : finished(successMessage);
}

function simple(validate: (v: Record<string, string>, c: Collector) => void, successMessage: string): FormDefinition {
  const run = (values: FormValues) => {
    const c = new Collector();
    validate(dotted(values), c);
    return c.errors;
  };
  return {
    validate: run,
    submit: (values) => result(run(values), successMessage),
  };
}

// ---------------------------------------------------------------------------
// 01 · contact
// ---------------------------------------------------------------------------

const contact = simple((v, c) => {
  c.required(v, 'name', 'Enter your name.');
  if (c.required(v, 'email', 'Enter your email address.')) {
    c.email(v, 'email');
    // Server-only rule: there is no client equivalent.
    if (v.email.toLowerCase() === 'taken@example.com') {
      c.add('email', 'This email address is already registered. Sign in instead.');
    }
  }
  c.required(v, 'topic', 'Choose a topic.');
  if (c.required(v, 'message', 'Enter a message.') && v.message.length < 10) {
    c.add('message', 'Enter at least 10 characters.');
  }
  c.required(v, 'consent', 'Agree to the privacy policy to continue.');
  // Form-level rule: not tied to a single field.
  if (/spam/i.test(v.message ?? '')) {
    c.add('__form', 'Your message was flagged by our spam filter. Please rephrase it or call us.');
  }
}, 'Thanks, your message was sent.');

// ---------------------------------------------------------------------------
// 02 · address (nested names, conditional group)
// ---------------------------------------------------------------------------

const address = simple((v, c) => {
  c.required(v, 'billing.name', 'Enter the billing name.');
  c.required(v, 'billing.address', 'Enter the billing address.');
  c.required(v, 'billing.city', 'Enter the town or city.');
  c.required(v, 'billing.country', 'Choose a country.');
  if (v['billing.postalCode'] === '00000') {
    c.add('billing.postalCode', 'We don’t deliver to this postal code.');
  }
  if (v.shippingSameAsBilling !== '1') {
    c.required(v, 'shipping.name', 'Enter the recipient name.');
    c.required(v, 'shipping.address', 'Enter the shipping address.');
    c.required(v, 'shipping.city', 'Enter the town or city.');
  }
}, 'Address saved.');

// ---------------------------------------------------------------------------
// 03 · conditional fields
// ---------------------------------------------------------------------------

const conditional = simple((v, c) => {
  if (c.required(v, 'contactPreference', 'Choose how we should contact you.')) {
    if (v.contactPreference === 'email' && c.required(v, 'email', 'Enter your email address.')) c.email(v, 'email');
    if (v.contactPreference === 'phone') c.required(v, 'phone', 'Enter your phone number.');
    if (v.contactPreference === 'post') c.required(v, 'postalAddress', 'Enter your postal address.');
  }
  if (v.referral === 'other') c.required(v, 'referralOther', 'Tell us where you heard about us.');
  if (v.hasCompany === '1') c.required(v, 'companySize', 'Choose your company size.');
}, 'Preferences saved.');

// ---------------------------------------------------------------------------
// 04 · repeatable participants
// ---------------------------------------------------------------------------

const repeatable = simple((v, c) => {
  if (c.required(v, 'organizerEmail', 'Enter the organizer’s email address.')) c.email(v, 'organizerEmail');
  const rows = [...new Set(Object.keys(v).filter((k) => k.startsWith('participants.')).map((k) => k.split('.')[1]))];
  if (rows.length === 0) c.add('__form', 'Add at least one participant.');
  if (rows.length > 5) c.add('__form', 'You can register at most 5 participants.');
  const seen = new Map<string, string>();
  for (const row of rows) {
    c.required(v, `participants.${row}.name`, 'Enter the participant’s name.');
    const emailKey = `participants.${row}.email`;
    if (c.required(v, emailKey, 'Enter the participant’s email address.')) {
      c.email(v, emailKey);
      const email = v[emailKey].toLowerCase();
      if (seen.has(email)) c.add(emailKey, 'Each participant needs their own email address.');
      seen.set(email, row);
    }
  }
}, 'Registration received.');

// ---------------------------------------------------------------------------
// 05 · cross-field rules
// ---------------------------------------------------------------------------

const crossField = simple((v, c) => {
  if (c.required(v, 'email', 'Enter your email address.')) c.email(v, 'email');
  if (c.required(v, 'password', 'Create a password.') && v.password.length < 8) {
    c.add('password', 'Use 8 or more characters.');
  }
  if (c.required(v, 'passwordRepeat', 'Repeat your password.') && v.passwordRepeat !== v.password) {
    c.add('passwordRepeat', 'The passwords don’t match.');
  }
  c.required(v, 'startDate', 'Choose a start date.');
  if (c.required(v, 'endDate', 'Choose an end date.') && v.startDate && v.endDate < v.startDate) {
    c.add('endDate', 'The end date must be on or after the start date.');
  }
  if (!v.phone && !v.backupEmail) c.add('__form', 'Give us a phone number or a backup email address so we can reach you.');
}, 'Account created.');

// ---------------------------------------------------------------------------
// 06 · multistep (server-rendered steps)
// ---------------------------------------------------------------------------

const TRIP_STEPS = ['Your details', 'Your trip', 'Review'];

interface TripState {
  fullName?: string;
  email?: string;
  destination?: string;
  travellers?: string;
}

function esc(value: string | undefined): string {
  return (value ?? '').replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

function encodeState(state: TripState): string {
  return Buffer.from(JSON.stringify(state)).toString('base64url');
}

function decodeState(raw: string | undefined): TripState {
  try {
    return raw ? JSON.parse(Buffer.from(raw, 'base64url').toString()) : {};
  } catch {
    return {};
  }
}

function renderTrip(step: number, state: TripState): string {
  const progress = TRIP_STEPS.map((label, i) =>
    `<li${i + 1 === step ? ' aria-current="step"' : ''}>${label}</li>`).join('');

  const options = (selected?: string) => [
    ['', 'Choose a destination'],
    ['lisbon', 'Lisbon'],
    ['oslo', 'Oslo'],
    ['atlantis', 'Atlantis'],
  ].map(([value, label]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`).join('');

  let body = '';
  if (step === 1) {
    body = `
      <div class="field" data-form-field="fullName" data-validate='[{"type":"NotEmpty","options":{"message":"Enter your full name."}}]'>
        <label for="trip-fullName">Full name <span aria-hidden="true">*</span></label>
        <input id="trip-fullName" name="fullName" type="text" autocomplete="name" required enterkeyhint="next" value="${esc(state.fullName)}">
        <p id="trip-fullName-errors" class="invalid-feedback"></p>
      </div>
      <div class="field" data-form-field="email" data-validate='[{"type":"NotEmpty","options":{"message":"Enter your email address."}},{"type":"EmailAddress","options":{"message":"Enter an email address like name@example.com."}}]'>
        <label for="trip-email">Email <span aria-hidden="true">*</span></label>
        <input id="trip-email" name="email" type="email" autocomplete="email" required autocorrect="off" autocapitalize="none" spellcheck="false" enterkeyhint="next" value="${esc(state.email)}">
        <p id="trip-email-errors" class="invalid-feedback"></p>
      </div>`;
  } else if (step === 2) {
    body = `
      <div class="field" data-form-field="destination" data-validate='[{"type":"NotEmpty","options":{"message":"Choose a destination."}}]'>
        <label for="trip-destination">Destination <span aria-hidden="true">*</span></label>
        <select id="trip-destination" name="destination" required>${options(state.destination)}</select>
        <p id="trip-destination-errors" class="invalid-feedback"></p>
      </div>
      <div class="field" data-form-field="travellers" data-validate='[{"type":"NotEmpty","options":{"message":"Enter the number of travellers."}},{"type":"NumberRange","options":{"minimum":1,"maximum":9,"message":"Enter a number from 1 to 9."}}]'>
        <label for="trip-travellers">Number of travellers <span aria-hidden="true">*</span></label>
        <input id="trip-travellers" name="travellers" type="text" inputmode="numeric" required aria-describedby="trip-travellers-hint" enterkeyhint="next" value="${esc(state.travellers ?? '1')}">
        <p id="trip-travellers-hint" class="hint">From 1 to 9.</p>
        <p id="trip-travellers-errors" class="invalid-feedback"></p>
      </div>`;
  } else {
    body = `
      <dl class="summary">
        <dt>Full name</dt><dd>${esc(state.fullName)}</dd>
        <dt>Email</dt><dd>${esc(state.email)}</dd>
        <dt>Destination</dt><dd>${esc(state.destination)}</dd>
        <dt>Travellers</dt><dd>${esc(state.travellers)}</dd>
      </dl>`;
  }

  const back = step > 1
    ? `<button type="submit" name="__nav" value="back" formnovalidate class="secondary" enterkeyhint="previous">Back</button>`
    : '';
  const next = step < TRIP_STEPS.length ? 'Continue' : 'Book trip';

  return `
<form id="trip" action="/api/forms/trip" method="post" data-ajax="1" aria-labelledby="trip-title">
  <nav aria-label="Progress"><ol class="progress">${progress}</ol></nav>
  <h2 id="trip-step-${step}" tabindex="-1">Step ${step} of ${TRIP_STEPS.length}: ${TRIP_STEPS[step - 1]}</h2>
  <input type="hidden" name="__step" value="${step}">
  <input type="hidden" name="__state" value="${encodeState(state)}">
  ${body}
  <div class="actions">${back}<button type="submit" name="__nav" value="next">${next}</button></div>
</form>`;
}

function validateTripStep(step: number, v: Record<string, string>, c: Collector): void {
  if (step === 1) {
    c.required(v, 'fullName', 'Enter your full name.');
    if (c.required(v, 'email', 'Enter your email address.')) c.email(v, 'email');
  }
  if (step === 2) {
    if (c.required(v, 'destination', 'Choose a destination.') && v.destination === 'atlantis') {
      c.add('destination', 'Atlantis is fully booked. Choose another destination.');
    }
    if (c.required(v, 'travellers', 'Enter the number of travellers.')) {
      const n = Number(v.travellers);
      if (!Number.isInteger(n) || n < 1 || n > 9) c.add('travellers', 'Enter a number from 1 to 9.');
    }
  }
}

const trip: FormDefinition = {
  render: () => renderTrip(1, {}),
  validate(values) {
    const v = dotted(values);
    const c = new Collector();
    validateTripStep(Number(v.__step) || 1, v, c);
    return c.errors;
  },
  submit(values) {
    const v = dotted(values);
    const step = Number(v.__step) || 1;
    const state: TripState = { ...decodeState(v.__state) };
    for (const key of ['fullName', 'email', 'destination', 'travellers'] as const) {
      if (key in v) state[key] = v[key];
    }
    const total = TRIP_STEPS.length;

    if (v.__nav === 'back') {
      const prev = Math.max(1, step - 1);
      return { valid: true, errors: {}, finished: false, html: renderTrip(prev, state), page: { current: prev, total } };
    }

    const c = new Collector();
    validateTripStep(step, v, c);
    if (Object.keys(c.errors).length > 0) {
      return { valid: false, errors: c.errors, finished: false, page: { current: step, total } };
    }
    if (step === total) return finished(`Trip to ${esc(state.destination)} booked.`);
    return { valid: true, errors: {}, finished: false, html: renderTrip(step + 1, state), page: { current: step + 1, total } };
  },
};

// ---------------------------------------------------------------------------
// 07 · widgets
// ---------------------------------------------------------------------------

const widgets = simple((v, c) => {
  const interests = (v.interests ?? '').split(',').filter(Boolean);
  if (interests.length < 1) c.add('interests', 'Choose at least one interest.');
  if (interests.length > 3) c.add('interests', 'Choose no more than 3 interests.');
  c.required(v, 'country', 'Choose a country.');
}, 'Profile saved.');

export const forms: Record<string, FormDefinition> = {
  contact,
  address,
  conditional,
  repeatable,
  'cross-field': crossField,
  trip,
  widgets,
};
