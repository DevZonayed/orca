// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RemoteDirectoryCreation } from './RemoteDirectoryCreation'
import { RemoteFileBrowser } from './RemoteFileBrowser'

const browseDir = vi.fn(async ({ dirPath }: { dirPath: string; targetId: string }) => ({
  entries: [],
  resolvedPath: dirPath === '~' ? '/home/alice/Projects' : dirPath,
  pathFlavor: 'posix' as const
}))
const createDir = vi.fn()
const getState = vi.fn()

/** Drains queued microtasks before React state assertions. */
async function flushPromises(count = 6): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await Promise.resolve()
  }
}

/** Finds a rendered button by its visible label. */
function findButton(container: HTMLElement, label: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label
  )
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button "${label}" was not rendered`)
  }
  return button
}

/** Mounts the SSH browser after its initial listing resolves. */
async function renderBrowser(): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<RemoteFileBrowser targetId="ssh-1" onSelect={vi.fn()} onCancel={vi.fn()} />)
    await flushPromises()
  })
  return { container, root }
}

/** Opens the folder form and enters a name through its DOM event path. */
async function enterFolderName(container: HTMLElement, name: string): Promise<void> {
  await act(async () => {
    findButton(container, 'New folder').click()
  })
  const input = container.querySelector('input[aria-label="Folder name"]')
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('Folder name input was not rendered')
  }
  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    valueSetter?.call(input, name)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('RemoteFileBrowser directory creation', () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    browseDir.mockClear()
    createDir.mockReset()
    getState.mockReset()
    getState.mockResolvedValue({
      targetId: 'ssh-1',
      status: 'connected',
      connectionGeneration: 4
    })
    createDir.mockResolvedValue(undefined)
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        fs: { createDir },
        ssh: { browseDir, getState }
      }
    })
  })

  afterEach(() => {
    document.body.replaceChildren()
    vi.restoreAllMocks()
  })

  it('creates and navigates into a new folder on the selected SSH host', async () => {
    const { container, root } = await renderBrowser()
    await enterFolderName(container, 'new project')

    await act(async () => {
      findButton(container, 'Create').click()
      await flushPromises()
    })

    expect(createDir).toHaveBeenCalledWith({
      dirPath: '/home/alice/Projects/new project',
      connectionId: 'ssh-1',
      expectedExecutionHostId: 'ssh:ssh-1',
      expectedSshTargetId: 'ssh-1',
      expectedSshConnectionGeneration: 4
    })
    expect(browseDir).toHaveBeenLastCalledWith({
      targetId: 'ssh-1',
      dirPath: '/home/alice/Projects/new project'
    })
    expect(container.textContent).toContain(
      'Opens as a project on this host · /home/alice/Projects/new project'
    )

    await act(async () => root.unmount())
  })

  it('keeps remote creation errors inline without leaving the current directory', async () => {
    createDir.mockRejectedValue(new Error("A folder named 'existing' already exists"))
    const { container, root } = await renderBrowser()
    await enterFolderName(container, 'existing')

    await act(async () => {
      findButton(container, 'Create').click()
      await flushPromises()
    })

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('already exists')
    expect(container.textContent).toContain(
      'Opens as a project on this host · /home/alice/Projects'
    )
    expect(browseDir).toHaveBeenCalledTimes(1)

    await act(async () => root.unmount())
  })

  it('releases parent pending state when the creation form unmounts', async () => {
    let finishCreate: (() => void) | undefined
    const createPromise = new Promise<void>((resolve) => {
      finishCreate = resolve
    })
    const onPendingChange = vi.fn()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <RemoteDirectoryCreation
          disabled={false}
          onCreate={() => createPromise}
          onPendingChange={onPendingChange}
        />
      )
    })
    await enterFolderName(container, 'new project')
    await act(async () => {
      findButton(container, 'Create').click()
      await flushPromises()
    })
    expect(onPendingChange).toHaveBeenLastCalledWith(true)

    await act(async () => root.unmount())
    await act(async () => {
      finishCreate?.()
      await createPromise
      await flushPromises()
    })

    expect(onPendingChange).toHaveBeenLastCalledWith(false)
  })
})
