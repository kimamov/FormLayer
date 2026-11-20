import type { FormRegistry, FormEventType } from 'formlayer';

const EVENTS: FormEventType[] = [
  'field:added', 'field:removed', 'field:change', 'field:invalid',
  'form:submit', 'form:valid', 'form:invalid', 'form:loading', 'form:reset',
];

/** Collapsible log of FormLayer events, for observing behaviour while testing by hand. */
export function mountDebugPanel(registry: FormRegistry): void {
  const panel = document.createElement('details');
  panel.className = 'debug-panel';
  panel.innerHTML = '<summary>FormLayer events</summary><ol reversed></ol>';
  const list = panel.querySelector('ol')!;

  const log = (text: string) => {
    const item = document.createElement('li');
    item.textContent = `${new Date().toLocaleTimeString()}  ${text}`;
    list.prepend(item);
    while (list.children.length > 60) list.lastElementChild?.remove();
  };

  const attach = (formId: string) => {
    const api = registry.get(formId);
    if (!api) return;
    for (const event of EVENTS) {
      api.on(event as never, ((detail: { fieldName?: string; state: { value?: string; errors?: string[]; isValid: boolean } }) => {
        const target = detail.fieldName ? `${formId}.${detail.fieldName}` : formId;
        const value = detail.fieldName ? ` value=${JSON.stringify(detail.state.value)}` : '';
        const errors = detail.state.errors?.length ? ` errors=${JSON.stringify(detail.state.errors)}` : '';
        log(`${event}  ${target}${value}${errors}`);
      }) as never);
    }
  };

  registry.on('form:registered', ({ formId }) => attach(formId));
  for (const [formId] of registry.getAll()) attach(formId);
  document.body.append(panel);
}
