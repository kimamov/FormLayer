/**
 * Integrator code for the repeatable "participants" group.
 *
 * FormLayer has no concept of repeatable groups, so everything here is what an
 * integrator has to write today: adding/removing rows from a <template>,
 * renumbering labels, min/max limits, focus management and announcements.
 * Field registration itself is handled by FormLayer's MutationObserver.
 */
for (const group of document.querySelectorAll<HTMLElement>('[data-repeatable]')) {
  const list = group.querySelector<HTMLElement>('[data-repeatable-list]')!;
  const template = group.querySelector<HTMLTemplateElement>('template[data-repeatable-template]')!;
  const addButton = group.querySelector<HTMLButtonElement>('[data-repeatable-add]')!;
  const status = group.querySelector<HTMLElement>('[data-repeatable-status]')!;
  const min = Number(group.dataset.min ?? 0);
  const max = Number(group.dataset.max ?? Infinity);
  let nextIndex = list.children.length;

  const rows = () => [...list.querySelectorAll<HTMLElement>('[data-repeatable-item]')];

  const refresh = () => {
    rows().forEach((row, i) => {
      const title = row.querySelector('[data-repeatable-number]');
      if (title) title.textContent = String(i + 1);
      const remove = row.querySelector<HTMLButtonElement>("[data-repeatable-remove]")!;
      remove.hidden = false; // buttons are hidden until enhanced (no-JS users get one row)
      remove.disabled = rows().length <= min;
    });
    addButton.hidden = false;
    addButton.disabled = rows().length >= max;
  };

  addButton.addEventListener('click', () => {
    const html = template.innerHTML.replaceAll('__INDEX__', String(nextIndex++));
    list.insertAdjacentHTML('beforeend', html);
    refresh();
    const row = rows().at(-1)!;
    row.querySelector<HTMLElement>('input, select, textarea')?.focus();
    status.textContent = `Participant ${rows().length} added.`;
  });

  list.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-repeatable-remove]');
    if (!button) return;
    button.closest('[data-repeatable-item]')?.remove();
    refresh();
    addButton.focus();
    status.textContent = `Participant removed. ${rows().length} left.`;
  });

  refresh();
}
