import type { DirEntry } from '../../../shared/types'
import { SERVER_DIRECTORY_CREATE_RUNTIME_CAPABILITY } from '../../../shared/protocol-version'
import {
  assertRuntimeEnvironmentCapability,
  callRuntimeRpc,
  RuntimeRpcCallError
} from './runtime-rpc-client'

export const SERVER_DIRECTORY_CREATE_UPDATE_REQUIRED_MESSAGE =
  'Update Orca on this host to create folders.'

export type RuntimeServerDirectoryListing = {
  resolvedPath: string
  entries: DirEntry[]
}

export async function browseRuntimeServerDirectory(
  environmentId: string,
  path: string
): Promise<RuntimeServerDirectoryListing> {
  return callRuntimeRpc<RuntimeServerDirectoryListing>(
    { kind: 'environment', environmentId },
    'files.browseServerDir',
    { path },
    { timeoutMs: 15_000 }
  )
}

export async function createRuntimeServerDirectory(
  environmentId: string,
  path: string,
  name: string
): Promise<RuntimeServerDirectoryListing> {
  await assertRuntimeEnvironmentCapability(
    environmentId,
    SERVER_DIRECTORY_CREATE_RUNTIME_CAPABILITY,
    SERVER_DIRECTORY_CREATE_UPDATE_REQUIRED_MESSAGE,
    15_000
  )
  try {
    return await callRuntimeRpc<RuntimeServerDirectoryListing>(
      { kind: 'environment', environmentId },
      'files.createServerDir',
      { path, name },
      { timeoutMs: 15_000 }
    )
  } catch (error) {
    if (error instanceof RuntimeRpcCallError && error.code === 'method_not_found') {
      throw new Error(SERVER_DIRECTORY_CREATE_UPDATE_REQUIRED_MESSAGE)
    }
    throw error
  }
}
