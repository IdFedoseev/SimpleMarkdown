import { describe, expect, it } from 'vitest'
import { fadeAlpha } from './draw'

describe('fadeAlpha', () => {
  const ttl = 5000
  const fade = 600
  const done = 100000

  it('stays fully opaque until ttl', () => {
    expect(fadeAlpha(done, done, ttl, fade)).toBe(1)
    expect(fadeAlpha(done, done + ttl, ttl, fade)).toBe(1)
  })

  it('fades linearly during the fade window', () => {
    expect(fadeAlpha(done, done + ttl + 300, ttl, fade)).toBeCloseTo(0.5)
  })

  it('returns null once fully faded', () => {
    expect(fadeAlpha(done, done + ttl + 600, ttl, fade)).toBeNull()
    expect(fadeAlpha(done, done + ttl + 60000, ttl, fade)).toBeNull()
  })
})
