const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)

export const shortcutModifier = isMac ? '⌘' : 'Alt'

export function matchesShortcut(event: KeyboardEvent, key: string) {
  const modifier = isMac ? event.metaKey && !event.ctrlKey && !event.altKey : event.altKey && !event.ctrlKey && !event.metaKey
  return modifier && !event.shiftKey && event.key.toLowerCase() === key.toLowerCase()
}
