/** Moves keyboard focus to the heading of the side panel showing now, so a screen reader reads it. */
export function focusPanelHeading(): void {
  document.querySelector<HTMLElement>('[data-panel-heading]')?.focus();
}
