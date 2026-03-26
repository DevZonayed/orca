import { describe, expect, it, vi } from 'vitest'
import { parseOrcaYaml } from './hooks'

// Mock fs and path used by loadHooks
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn()
}))

describe('parseOrcaYaml', () => {
  it('parses YAML with setup script only', () => {
    const yaml = `scripts:\n  setup: |\n    echo "setting up"\n    npm install\n`
    const result = parseOrcaYaml(yaml)
    expect(result).toEqual({
      scripts: {
        setup: 'echo "setting up"\nnpm install'
      }
    })
  })

  it('parses YAML with archive script only', () => {
    const yaml = `scripts:\n  archive: |\n    echo "archiving"\n`
    const result = parseOrcaYaml(yaml)
    expect(result).toEqual({
      scripts: {
        archive: 'echo "archiving"'
      }
    })
  })

  it('parses YAML with both setup and archive', () => {
    const yaml = [
      'scripts:',
      '  setup: |',
      '    echo "setup"',
      '    npm install',
      '  archive: |',
      '    echo "archive"',
      '    rm -rf node_modules'
    ].join('\n')
    const result = parseOrcaYaml(yaml)
    expect(result).toEqual({
      scripts: {
        setup: 'echo "setup"\nnpm install',
        archive: 'echo "archive"\nrm -rf node_modules'
      }
    })
  })

  it('returns null when there is no scripts block', () => {
    const yaml = `other:\n  key: value\n`
    expect(parseOrcaYaml(yaml)).toBeNull()
  })

  it('returns null when scripts block has no setup or archive', () => {
    const yaml = `scripts:\n  unknown: |\n    echo "nope"\n`
    expect(parseOrcaYaml(yaml)).toBeNull()
  })

  it('handles multiline block scalar scripts', () => {
    const yaml = ['scripts:', '  setup: |', '    line1', '    line2', '    line3'].join('\n')
    const result = parseOrcaYaml(yaml)
    expect(result).toEqual({
      scripts: {
        setup: 'line1\nline2\nline3'
      }
    })
  })

  it('stops parsing when it hits another top-level key', () => {
    const yaml = ['scripts:', '  setup: |', '    echo "setup"', 'other:', '  key: value'].join('\n')
    const result = parseOrcaYaml(yaml)
    expect(result).toEqual({
      scripts: {
        setup: 'echo "setup"'
      }
    })
  })

  it('returns null for empty string', () => {
    expect(parseOrcaYaml('')).toBeNull()
  })
})

describe('getEffectiveHooks', () => {
  // We need to dynamically import after mocking
  const makeRepo = (hookSettings?: {
    mode: 'auto' | 'override'
    scripts: { setup: string; archive: string }
  }) => ({
    id: 'test-id',
    path: '/test/repo',
    displayName: 'Test Repo',
    badgeColor: '#000',
    addedAt: Date.now(),
    hookSettings
  })

  it('auto mode with yaml hooks uses yaml hooks', async () => {
    const fs = await import('fs')
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue('scripts:\n  setup: |\n    echo "yaml setup"\n')

    // Re-import to pick up mocks
    const { getEffectiveHooks } = await import('./hooks')
    const repo = makeRepo({ mode: 'auto', scripts: { setup: '', archive: '' } })
    const result = getEffectiveHooks(repo)

    expect(result).toEqual({
      scripts: {
        setup: 'echo "yaml setup"'
      }
    })
  })

  it('auto mode with no yaml hooks but UI scripts uses UI scripts', async () => {
    const fs = await import('fs')
    vi.mocked(fs.existsSync).mockReturnValue(false)

    const { getEffectiveHooks } = await import('./hooks')
    const repo = makeRepo({
      mode: 'auto',
      scripts: { setup: 'echo "ui setup"', archive: '' }
    })
    const result = getEffectiveHooks(repo)

    expect(result).toEqual({
      scripts: {
        setup: 'echo "ui setup"'
      }
    })
  })

  it('override mode always uses UI scripts, ignores yaml', async () => {
    const fs = await import('fs')
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue('scripts:\n  setup: |\n    echo "yaml setup"\n')

    const { getEffectiveHooks } = await import('./hooks')
    const repo = makeRepo({
      mode: 'override',
      scripts: { setup: 'echo "ui override"', archive: '' }
    })
    const result = getEffectiveHooks(repo)

    expect(result).toEqual({
      scripts: {
        setup: 'echo "ui override"'
      }
    })
  })

  it('returns null when no hooks at all', async () => {
    const fs = await import('fs')
    vi.mocked(fs.existsSync).mockReturnValue(false)

    const { getEffectiveHooks } = await import('./hooks')
    const repo = makeRepo({ mode: 'auto', scripts: { setup: '', archive: '' } })
    const result = getEffectiveHooks(repo)

    expect(result).toBeNull()
  })
})
