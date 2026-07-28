import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  browseRuntimeServerDirectory,
  createRuntimeServerDirectory,
  SERVER_DIRECTORY_CREATE_UPDATE_REQUIRED_MESSAGE
} from './runtime-server-directory-browser'
import { clearRuntimeCompatibilityCacheForTests } from './runtime-rpc-client'
import {
  MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION,
  RUNTIME_PROTOCOL_VERSION,
  SERVER_DIRECTORY_CREATE_RUNTIME_CAPABILITY
} from '../../../shared/protocol-version'

const runtimeEnvironmentCall = vi.fn()

beforeEach(() => {
  clearRuntimeCompatibilityCacheForTests()
  runtimeEnvironmentCall.mockReset()
  runtimeEnvironmentCall.mockImplementation((args: { method: string }) => {
    if (args.method === 'status.get') {
      return Promise.resolve({
        id: 'status',
        ok: true,
        result: {
          runtimeProtocolVersion: RUNTIME_PROTOCOL_VERSION,
          minCompatibleRuntimeClientVersion: MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION,
          capabilities: [SERVER_DIRECTORY_CREATE_RUNTIME_CAPABILITY]
        },
        _meta: { runtimeId: 'remote-runtime' }
      })
    }
    return Promise.resolve({
      id: 'browse',
      ok: true,
      result: {
        resolvedPath: '/home/me',
        entries: [{ name: 'repo', isDirectory: true, isSymlink: false }]
      },
      _meta: { runtimeId: 'remote-runtime' }
    })
  })
  vi.stubGlobal('window', {
    api: {
      runtimeEnvironments: {
        call: runtimeEnvironmentCall
      }
    }
  })
})

describe('runtime server directory browser', () => {
  it('routes browse requests through the selected runtime environment', async () => {
    await expect(browseRuntimeServerDirectory('env-1', '~')).resolves.toEqual({
      resolvedPath: '/home/me',
      entries: [{ name: 'repo', isDirectory: true, isSymlink: false }]
    })

    expect(runtimeEnvironmentCall).toHaveBeenLastCalledWith({
      selector: 'env-1',
      method: 'files.browseServerDir',
      params: { path: '~' },
      timeoutMs: 15_000
    })
  })

  it('routes directory creation through the selected runtime environment', async () => {
    await createRuntimeServerDirectory('env-1', '/home/me', 'new-project')

    expect(runtimeEnvironmentCall).toHaveBeenLastCalledWith({
      selector: 'env-1',
      method: 'files.createServerDir',
      params: { path: '/home/me', name: 'new-project' },
      timeoutMs: 15_000
    })
  })

  it('requires a host that advertises server directory creation', async () => {
    runtimeEnvironmentCall.mockImplementation(() =>
      Promise.resolve({
        id: 'status',
        ok: true,
        result: {
          runtimeProtocolVersion: RUNTIME_PROTOCOL_VERSION,
          minCompatibleRuntimeClientVersion: MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION,
          capabilities: []
        },
        _meta: { runtimeId: 'remote-runtime' }
      })
    )

    await expect(
      createRuntimeServerDirectory('env-legacy', '/home/me', 'new-project')
    ).rejects.toThrow(SERVER_DIRECTORY_CREATE_UPDATE_REQUIRED_MESSAGE)
    expect(runtimeEnvironmentCall).toHaveBeenCalledTimes(1)
  })
})
