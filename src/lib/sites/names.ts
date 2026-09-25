/** A short, tidy page name from a description such as "A sign-up page for our summer party". */
export function pageNameFrom(purpose: string): string {
  let name = purpose
    .trim()
    .split(/[.!?\n]/)[0]
    .trim()
  name = name.replace(/^(?:an?|the)\s+(?:[\w’'-]+\s+){0,3}?(?:landing\s+)?(?:page|site|microsite|website)\s+(?:for|about)\s+(?:our\s+|the\s+|an?\s+)?/i, '')
  if (name.length > 36) name = name.split(/,|\s(?:with|that|which|so|to|telling|building|asking|and asking)\s/i)[0].trim()
  if (name.length > 48) {
    const cut = name.slice(0, 48)
    name = cut.slice(0, Math.max(cut.lastIndexOf(' '), 24)).trim()
  }
  name = name.replace(/[\s,;:–-]+$/, '')
  return name ? name[0].toUpperCase() + name.slice(1) : 'Untitled page'
}
