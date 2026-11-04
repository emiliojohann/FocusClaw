export function handleDashboardSearchShortcut(
  event: KeyboardEvent,
  modalOpen: boolean,
  searchQuery: string,
  desktopSearch: HTMLInputElement | null,
  mobileSearch: HTMLInputElement | null,
  activeElement: Element | null,
  clearSearch: () => void,
) {
  // Do not prevent default here: typing and navigation belong to the modal.
  if (modalOpen || event.defaultPrevented) return
  const target = event.target as HTMLElement | null
  const isTypingTarget = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable
  if (event.key === '/' && !isTypingTarget) {
    event.preventDefault()
    desktopSearch?.focus()
  } else if (event.key === 'Escape' && searchQuery &&
    (activeElement === desktopSearch || activeElement === mobileSearch)) {
    event.preventDefault()
    clearSearch()
  }
}

const MODAL_CONTROLS = 'button:not(:disabled), input:not(:disabled)'

export function containModalFocus(dialog: HTMLElement, activeElement: Node | null) {
  if (!dialog.contains(activeElement)) {
    const first = dialog.querySelector<HTMLElement>(MODAL_CONTROLS)
    ;(first ?? dialog).focus()
  }
}

export function handleModalKeyDown(
  event: KeyboardEvent,
  dialog: HTMLElement,
  activeElement: Element | null,
  cancel: () => void,
) {
  if (event.key === 'Escape') {
    event.preventDefault()
    cancel() // The caller retains the pending-operation cancellation guard.
  } else if (event.key === 'Tab') {
    const controls = dialog.querySelectorAll<HTMLElement>(MODAL_CONTROLS)
    const first = controls[0]
    const last = controls[controls.length - 1]
    const outside = !dialog.contains(activeElement) || activeElement === dialog
    if (!first || outside || (event.shiftKey ? activeElement === first : activeElement === last)) {
      event.preventDefault()
      ;(event.shiftKey ? last ?? dialog : first ?? dialog).focus()
    }
  }
}

export function restoreModalFocus(trigger: HTMLElement | null, fallback: HTMLElement | null) {
  ;(trigger?.isConnected ? trigger : fallback)?.focus()
}
