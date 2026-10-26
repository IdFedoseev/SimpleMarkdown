/// <reference types="vite/client" />
import { Crepe } from '@milkdown/crepe'
import './editor.css'

export interface EditorHandle {
  getMarkdown(): string
  setMarkdown(md: string): Promise<void>
  destroy(): void
}

export async function createEditor(
  container: HTMLElement,
  initialMarkdown: string,
  onChange: () => void,
): Promise<EditorHandle> {
  let crepe: Crepe | null = null
  let disposed = false
  let queue: Promise<void> = Promise.resolve()

  const spawn = async (md: string): Promise<Crepe> => {
    const instance = new Crepe({ root: container, defaultValue: md })
    instance.on((api) => api.markdownUpdated(() => onChange()))
    await instance.create()
    return instance
  }

  const enqueue = (task: () => Promise<void>): Promise<void> => {
    queue = queue.then(task).catch(() => undefined)
    return queue
  }

  crepe = await spawn(initialMarkdown)

  return {
    getMarkdown: () => (crepe ? crepe.getMarkdown() : ''),
    setMarkdown: (md: string) =>
      enqueue(async () => {
        if (disposed) return
        if (crepe) {
          await crepe.destroy()
          crepe = null
        }
        crepe = await spawn(md)
      }),
    destroy: () => {
      disposed = true
      void enqueue(async () => {
        if (crepe) {
          await crepe.destroy()
          crepe = null
        }
      })
    },
  }
}
