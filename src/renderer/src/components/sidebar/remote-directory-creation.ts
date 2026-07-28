import { toSshExecutionHostId } from '../../../../shared/execution-host'
import { validateRemoteDirectoryName } from '../../../../shared/remote-directory-name'
import { createRuntimeServerDirectory } from '@/runtime/runtime-server-directory-browser'
import { joinPath } from './remote-file-browser-helpers'

export { validateRemoteDirectoryName } from '../../../../shared/remote-directory-name'

type RemoteDirectoryTarget =
  | { kind: 'ssh'; targetId: string }
  | { kind: 'runtime'; environmentId: string }

export async function createRemoteDirectory(
  target: RemoteDirectoryTarget,
  parentPath: string,
  name: string
): Promise<string> {
  const directoryName = validateRemoteDirectoryName(name)
  if (target.kind === 'ssh') {
    const connectionState = await window.api.ssh.getState({ targetId: target.targetId })
    if (
      connectionState?.status !== 'connected' ||
      connectionState.connectionGeneration === undefined
    ) {
      throw new Error('Remote connection changed. Reconnect and try again.')
    }
    const dirPath = joinPath(parentPath, directoryName)
    await window.api.fs.createDir({
      dirPath,
      connectionId: target.targetId,
      expectedExecutionHostId: toSshExecutionHostId(target.targetId),
      expectedSshTargetId: target.targetId,
      expectedSshConnectionGeneration: connectionState.connectionGeneration
    })
    return dirPath
  }

  const result = await createRuntimeServerDirectory(target.environmentId, parentPath, directoryName)
  return result.resolvedPath
}
