import { describe, expect, it } from 'vitest'
import { parseWorktreeList } from './worktree'

describe('parseWorktreeList', () => {
  it('parses regular and bare worktree blocks from porcelain output', () => {
    const output = `
worktree /repo
HEAD abc123
branch refs/heads/main

worktree /repo-feature
HEAD def456
branch refs/heads/feature/test

worktree /repo-bare
HEAD 0000000
bare
`

    expect(parseWorktreeList(output)).toEqual([
      {
        path: '/repo',
        head: 'abc123',
        branch: 'refs/heads/main',
        isBare: false
      },
      {
        path: '/repo-feature',
        head: 'def456',
        branch: 'refs/heads/feature/test',
        isBare: false
      },
      {
        path: '/repo-bare',
        head: '0000000',
        branch: '',
        isBare: true
      }
    ])
  })

  it('returns empty array for empty string input', () => {
    expect(parseWorktreeList('')).toEqual([])
  })

  it('returns empty array for whitespace-only input', () => {
    expect(parseWorktreeList('   \n\n  \n  ')).toEqual([])
  })

  it('parses a single worktree block', () => {
    const output = `worktree /single-repo
HEAD aaa111
branch refs/heads/main
`
    expect(parseWorktreeList(output)).toEqual([
      {
        path: '/single-repo',
        head: 'aaa111',
        branch: 'refs/heads/main',
        isBare: false
      }
    ])
  })

  it('parses a detached HEAD worktree (no branch line)', () => {
    const output = `worktree /repo-detached
HEAD abc123
detached
`
    expect(parseWorktreeList(output)).toEqual([
      {
        path: '/repo-detached',
        head: 'abc123',
        branch: '',
        isBare: false
      }
    ])
  })

  it('handles extra blank lines between blocks', () => {
    const output = `worktree /repo-a
HEAD aaa111
branch refs/heads/main


worktree /repo-b
HEAD bbb222
branch refs/heads/dev
`
    expect(parseWorktreeList(output)).toEqual([
      {
        path: '/repo-a',
        head: 'aaa111',
        branch: 'refs/heads/main',
        isBare: false
      },
      {
        path: '/repo-b',
        head: 'bbb222',
        branch: 'refs/heads/dev',
        isBare: false
      }
    ])
  })

  it('returns entry with empty head when HEAD line is missing', () => {
    const output = `worktree /repo-no-head
branch refs/heads/main
`
    expect(parseWorktreeList(output)).toEqual([
      {
        path: '/repo-no-head',
        head: '',
        branch: 'refs/heads/main',
        isBare: false
      }
    ])
  })

  it('correctly captures worktree path with spaces', () => {
    const output = `worktree /path/to/my worktree
HEAD ccc333
branch refs/heads/main
`
    expect(parseWorktreeList(output)).toEqual([
      {
        path: '/path/to/my worktree',
        head: 'ccc333',
        branch: 'refs/heads/main',
        isBare: false
      }
    ])
  })

  it('parses multiple bare entries mixed with regular entries', () => {
    const output = `worktree /bare-one
HEAD 0000000
bare

worktree /regular
HEAD abc123
branch refs/heads/main

worktree /bare-two
HEAD 1111111
bare
`
    expect(parseWorktreeList(output)).toEqual([
      {
        path: '/bare-one',
        head: '0000000',
        branch: '',
        isBare: true
      },
      {
        path: '/regular',
        head: 'abc123',
        branch: 'refs/heads/main',
        isBare: false
      },
      {
        path: '/bare-two',
        head: '1111111',
        branch: '',
        isBare: true
      }
    ])
  })
})
