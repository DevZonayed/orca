import { describe, expect, it, vi } from 'vitest'
import { createTestStore } from './store-test-helpers'
import {
  installReposRuntimeRoutingHarness,
  remoteRepo,
  reposAdd,
  runtimeEnvironmentCall
} from './repos-runtime-routing-fixture'

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn()
  }
}))

installReposRuntimeRoutingHarness()

describe('selected runtime repo routing', () => {
  it('adds through the selected runtime when the focused host is local', async () => {
    runtimeEnvironmentCall.mockResolvedValue({
      id: 'rpc-selected-add',
      ok: true,
      result: { repo: remoteRepo },
      _meta: { runtimeId: 'runtime-remote' }
    })
    const store = createTestStore()
    store.setState({ settings: { activeRuntimeEnvironmentId: null } as never })

    await store
      .getState()
      .addRepoPath('/srv/project', 'folder', { runtimeEnvironmentId: 'env-selected' })

    expect(runtimeEnvironmentCall).toHaveBeenCalledWith({
      selector: 'env-selected',
      method: 'repo.add',
      params: { path: '/srv/project', kind: 'folder' },
      timeoutMs: 15_000
    })
    expect(store.getState().repos).toEqual([
      { ...remoteRepo, executionHostId: 'runtime:env-selected' }
    ])
    expect(reposAdd).not.toHaveBeenCalled()
  })

  it('scans nested repositories on the selected runtime', async () => {
    const scan = {
      selectedPath: '/srv',
      selectedPathKind: 'non_git_folder' as const,
      repos: [],
      stopped: false,
      maxDepth: 3,
      maxRepos: 100,
      timeoutMs: null
    }
    runtimeEnvironmentCall.mockResolvedValue({
      id: 'rpc-selected-scan',
      ok: true,
      result: scan,
      _meta: { runtimeId: 'runtime-remote' }
    })
    const store = createTestStore()
    store.setState({ settings: { activeRuntimeEnvironmentId: null } as never })

    await expect(
      store.getState().scanNestedRepos('/srv', undefined, { runtimeEnvironmentId: 'env-selected' })
    ).resolves.toEqual(scan)

    expect(runtimeEnvironmentCall).toHaveBeenCalledWith({
      selector: 'env-selected',
      method: 'projectGroup.scanNested',
      params: { path: '/srv' },
      timeoutMs: 20_000
    })
  })
})
