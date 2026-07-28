/** Returns a normalized leaf name or rejects path and control characters. */
export function validateRemoteDirectoryName(name: string): string {
  const trimmed = name.trim()
  const hasControlCharacter = Array.from(trimmed).some((char) => {
    const codePoint = char.codePointAt(0) ?? 0
    return codePoint < 32 || codePoint === 127
  })
  if (
    !trimmed ||
    trimmed === '.' ||
    trimmed === '..' ||
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    hasControlCharacter
  ) {
    throw new Error('Enter a valid folder name without path separators')
  }
  return trimmed
}
