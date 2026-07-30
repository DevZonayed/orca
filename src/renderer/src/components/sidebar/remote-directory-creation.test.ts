import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRemoteDirectory, validateRemoteDirectoryName } from './remote-directory-creation'
import { createRuntimeServerDirectory } from '@/runtime/runtime-server-directory-browser'

vi.mock('@/runtime/runtime-server-directory-browser', () => ({
  createRuntimeServerDirectory: vi.fn()
}))

const getState = vi.fn()
const createDir = vi.fn()

beforeEach(() => {
  getState.mockReset()
  createDir.mockReset()
  vi.mocked(createRuntimeServerDirectory).mockReset()
  vi.stubGlobal('window', {
    api: {
      fs: { createDir },
      ssh: { getState }
    }
  })
})

describe('remote directory creation', () => {
  it('creates a directory on the selected SSH target with generation provenance', async () => {
    getState.mockResolvedValue({
      targetId: 'ssh-1',
      status: 'connected',
      connectionGeneration: 7
    })
    createDir.mockResolvedValue(undefined)

    await expect(
      createRemoteDirectory({ kind: 'ssh', targetId: 'ssh-1' }, '/home/me/Projects', "client's app")
    ).resolves.toBe("/home/me/Projects/client's app")

    expect(createDir).toHaveBeenCalledWith({
      dirPath: "/home/me/Projects/client's app",
      connectionId: 'ssh-1',
      expectedExecutionHostId: 'ssh:ssh-1',
      expectedSshTargetId: 'ssh-1',
      expectedSshConnectionGeneration: 7
    })
  })

  it('creates a directory on the explicitly selected runtime environment', async () => {
    vi.mocked(createRuntimeServerDirectory).mockResolvedValue({
      resolvedPath: '/home/me/Projects/new-project',
      entries: [],
      pathFlavor: 'posix'
    })

    await expect(
      createRemoteDirectory(
        { kind: 'runtime', environmentId: 'env-1' },
        '/home/me/Projects',
        'new-project'
      )
    ).resolves.toBe('/home/me/Projects/new-project')

    expect(createRuntimeServerDirectory).toHaveBeenCalledWith(
      'env-1',
      '/home/me/Projects',
      'new-project'
    )
    expect(getState).not.toHaveBeenCalled()
  })

  it('preserves Windows separators when creating on an SSH host', async () => {
    getState.mockResolvedValue({
      targetId: 'ssh-1',
      status: 'connected',
      connectionGeneration: 7
    })
    createDir.mockResolvedValue(undefined)

    await expect(
      createRemoteDirectory(
        { kind: 'ssh', targetId: 'ssh-1' },
        'C:\\Users\\me\\Projects',
        'new project',
        'win32'
      )
    ).resolves.toBe('C:\\Users\\me\\Projects\\new project')

    expect(createDir).toHaveBeenCalledWith(
      expect.objectContaining({ dirPath: 'C:\\Users\\me\\Projects\\new project' })
    )
  })

  it.each(['', ' ', '.', '..', '../escape', 'nested/folder', 'nested\\folder', 'bad\u0000name'])(
    'rejects invalid folder name %j before selecting a host',
    async (name) => {
      await expect(
        createRemoteDirectory({ kind: 'ssh', targetId: 'ssh-1' }, '/home/me/Projects', name)
      ).rejects.toThrow('Enter a valid folder name')

      expect(getState).not.toHaveBeenCalled()
      expect(createDir).not.toHaveBeenCalled()
    }
  )

  it('rejects a stale SSH connection before mutating the remote filesystem', async () => {
    getState.mockResolvedValue({
      targetId: 'ssh-1',
      status: 'reconnecting',
      connectionGeneration: 7
    })

    await expect(
      createRemoteDirectory({ kind: 'ssh', targetId: 'ssh-1' }, '/home/me/Projects', 'new-project')
    ).rejects.toThrow('Remote connection changed')

    expect(createDir).not.toHaveBeenCalled()
  })

  it('trims a valid leaf name without changing internal spaces', () => {
    expect(validateRemoteDirectoryName('  client project  ')).toBe('client project')
  })
})
