/** Keep a choice control only when the user actually has a choice. */
export function updateObjectChoice(select: HTMLSelectElement): void {
  let name = select.parentElement!.querySelector<HTMLElement>('.single-object-name');
  if (!name) {
    name = document.createElement('span');
    name.className = 'single-object-name';
    select.after(name);
  }
  const single = select.options.length === 1;
  select.hidden = single;
  name.hidden = !single;
  name.textContent = single ? select.options[0].textContent : '';
}
