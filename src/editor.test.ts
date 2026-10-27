import { describe, expect, it, vi } from 'vitest'
import mermaid from 'mermaid'
import { mermaidPreview } from './editor'

vi.mock('mermaid', () => ({
  default: { initialize: vi.fn(), render: vi.fn() },
}))

describe('mermaidPreview', () => {
  it('returns null for non-mermaid blocks', () => {
    const apply = vi.fn()
    expect(mermaidPreview('ts', 'let x = 1', apply)).toBe(null)
    expect(mermaid.render).not.toHaveBeenCalled()
    expect(apply).not.toHaveBeenCalled()
  })

  it('renders mermaid and applies the svg', async () => {
    const apply = vi.fn()
    vi.mocked(mermaid.render).mockResolvedValue({ svg: '<svg></svg>' } as never)
    mermaidPreview('mermaid', 'graph TD; A-->B', apply)
    await vi.waitFor(() => expect(apply).toHaveBeenCalledWith('<svg></svg>'))
    expect(mermaid.render).toHaveBeenCalledWith(
      expect.stringMatching(/^reader-mermaid-/),
      'graph TD; A-->B',
    )
  })

  it('falls back to code on render error', async () => {
    const apply = vi.fn()
    vi.mocked(mermaid.render).mockRejectedValue(new Error('parse error'))
    mermaidPreview('mermaid', 'not a diagram', apply)
    await vi.waitFor(() => expect(apply).toHaveBeenCalledWith(null))
  })
})
