import { describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../../orca-runtime'
import type { RpcRequest } from '../core'
import { RpcDispatcher } from '../dispatcher'
import { FILE_METHODS } from './files'

function makeRequest(method: string, params?: unknown): RpcRequest {
  return { id: 'req-1', authToken: 'tok', method, params }
}

describe('server directory RPC methods', () => {
  it('creates server directories before a project is added', async () => {
    const runtime = {
      getRuntimeId: () => 'test-runtime',
      createServerDir: vi.fn().mockResolvedValue({
        resolvedPath: '/home/me/new-project',
        entries: []
      })
    } as unknown as OrcaRuntimeService
    const dispatcher = new RpcDispatcher({ runtime, methods: FILE_METHODS })

    const response = await dispatcher.dispatch(
      makeRequest('files.createServerDir', { path: '/home/me', name: 'new-project' })
    )

    expect(runtime.createServerDir).toHaveBeenCalledWith('/home/me', 'new-project')
    expect(response).toMatchObject({
      ok: true,
      result: { resolvedPath: '/home/me/new-project', entries: [] }
    })
  })
})
