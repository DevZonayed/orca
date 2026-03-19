import { getBuiltinTheme, listBuiltinThemeNames, type GhosttyTheme } from 'restty'
import type { GlobalSettings } from '../../../shared/types'

export const BUILTIN_TERMINAL_THEME_NAMES = listBuiltinThemeNames()

export const DEFAULT_TERMINAL_THEME_DARK = 'Ghostty Default Style Dark'
export const DEFAULT_TERMINAL_THEME_LIGHT = 'Builtin Tango Light'
export const DEFAULT_TERMINAL_DIVIDER_DARK = '#3f3f46'
export const DEFAULT_TERMINAL_DIVIDER_LIGHT = '#d4d4d8'

export type EffectiveTerminalAppearance = {
  mode: 'dark' | 'light'
  sourceTheme: 'system' | 'dark' | 'light'
  themeName: string
  dividerColor: string
  theme: GhosttyTheme | null
  systemPrefersDark: boolean
}

export function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function getTerminalThemePreview(name: string): GhosttyTheme | null {
  const theme = getBuiltinTheme(name)
  if (theme) return theme
  return getBuiltinTheme(DEFAULT_TERMINAL_THEME_DARK)
}

export function resolveEffectiveTerminalAppearance(
  settings: Pick<
    GlobalSettings,
    | 'theme'
    | 'terminalThemeDark'
    | 'terminalDividerColorDark'
    | 'terminalUseSeparateLightTheme'
    | 'terminalThemeLight'
    | 'terminalDividerColorLight'
  >,
  systemPrefersDark = getSystemPrefersDark()
): EffectiveTerminalAppearance {
  const sourceTheme =
    settings.theme === 'system' ? (systemPrefersDark ? 'dark' : 'light') : settings.theme
  const useLightVariant = sourceTheme === 'light' && settings.terminalUseSeparateLightTheme
  const themeName = useLightVariant
    ? settings.terminalThemeLight || DEFAULT_TERMINAL_THEME_LIGHT
    : settings.terminalThemeDark || DEFAULT_TERMINAL_THEME_DARK
  const dividerColor = useLightVariant
    ? normalizeColor(settings.terminalDividerColorLight, DEFAULT_TERMINAL_DIVIDER_LIGHT)
    : normalizeColor(settings.terminalDividerColorDark, DEFAULT_TERMINAL_DIVIDER_DARK)

  return {
    mode: sourceTheme,
    sourceTheme: settings.theme,
    themeName,
    dividerColor,
    theme: getTerminalThemePreview(themeName),
    systemPrefersDark
  }
}

export function normalizeColor(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim()
  if (!trimmed) return fallback
  return trimmed
}

export function buildTerminalFontMatchers(fontFamily: string): string[] {
  const trimmed = fontFamily.trim()
  const normalized = trimmed.toLowerCase()
  const matchers = trimmed ? [trimmed, normalized] : []
  return Array.from(
    new Set([
      ...matchers,
      // macOS
      'sf mono',
      'sfmono-regular',
      'menlo',
      'menlo regular',
      // Linux
      'dejavu sans mono',
      'liberation mono',
      'ubuntu mono',
      'monospace'
    ])
  )
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function resolvePaneStyleOptions(
  settings: Pick<
    GlobalSettings,
    | 'terminalInactivePaneOpacity'
    | 'terminalActivePaneOpacity'
    | 'terminalPaneOpacityTransitionMs'
    | 'terminalDividerThicknessPx'
  >
) {
  return {
    inactivePaneOpacity: clampNumber(settings.terminalInactivePaneOpacity, 0, 1),
    activePaneOpacity: clampNumber(settings.terminalActivePaneOpacity, 0, 1),
    opacityTransitionMs: clampNumber(settings.terminalPaneOpacityTransitionMs, 0, 5000),
    dividerThicknessPx: clampNumber(settings.terminalDividerThicknessPx, 1, 32)
  }
}

export function getCursorStyleSequence(
  style: 'bar' | 'block' | 'underline',
  blinking: boolean
): string {
  const code =
    style === 'block'
      ? blinking
        ? 1
        : 2
      : style === 'underline'
        ? blinking
          ? 3
          : 4
        : blinking
          ? 5
          : 6

  return `\u001b[${code} q`
}

export function colorToCss(
  color: { r: number; g: number; b: number; a?: number } | string | undefined,
  fallback: string
): string {
  if (!color || typeof color === 'string') return fallback
  const alpha = typeof color.a === 'number' ? color.a / 255 : 1
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`
}

export function terminalPalettePreview(theme: GhosttyTheme | null): string[] {
  if (!theme) return []
  const colors = theme.colors.palette
  const swatches: string[] = []
  for (let i = 0; i < 16; i += 1) {
    const color = colors[i]
    if (!color) continue
    swatches.push(colorToCss(color, '#000000'))
  }
  return swatches
}
