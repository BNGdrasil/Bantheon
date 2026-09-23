import { describe, expect, it } from 'vitest'
import { describeRegistryOutcome } from './registry'

/* ------------------------------------------------------------------ *
 * Registry reload wording.
 *
 * A write whose reload failed answers 207, and axios treats every 2xx as a
 * success, so nothing throws. If this mapping reported such a write as a plain
 * success the operator would believe the gateway routes to a record it never
 * loaded, which is exactly the state 207 exists to announce.
 * ------------------------------------------------------------------ */

describe('describeRegistryOutcome', () => {
  it('states that the registry was reloaded on a clean write', () => {
    const outcome = describeRegistryOutcome('create', 'wegis', {
      registry_reloaded: true,
      registry_error: null,
    })
    expect(outcome.reloaded).toBe(true)
    expect(outcome.tone).toBe('success')
    expect(outcome.message).toBe('wegis 서비스를 등록했습니다. 등록부도 함께 다시 적재됐습니다.')
    expect(outcome.error).toBeNull()
  })

  it('warns and keeps the server reason when the reload failed', () => {
    const outcome = describeRegistryOutcome('update', 'auth-server', {
      registry_reloaded: false,
      registry_error: 'RegistryLoadError: database unavailable during load',
    })
    expect(outcome.reloaded).toBe(false)
    expect(outcome.tone).toBe('warning')
    expect(outcome.error).toBe('RegistryLoadError: database unavailable during load')
    expect(outcome.message).toContain('auth-server 서비스를 수정했습니다')
    expect(outcome.message).toContain('등록부를 다시 적재하지 못했습니다')
    expect(outcome.message).toContain('등록부 다시 적재')
  })

  it('uses the wording of the action it was given', () => {
    expect(describeRegistryOutcome('delete', 'wegis', { registry_reloaded: true }).message).toContain(
      'wegis 서비스를 삭제했습니다'
    )
    expect(describeRegistryOutcome('delete', 'wegis', { registry_reloaded: false }).message).toContain(
      'wegis 서비스를 삭제했습니다'
    )
  })

  it('warns even when the server sent no reason with the failure', () => {
    const outcome = describeRegistryOutcome('delete', 'wegis', { registry_reloaded: false })
    expect(outcome.tone).toBe('warning')
    expect(outcome.error).toBeNull()
  })

  it('reads a body without the field as a reload that succeeded', () => {
    expect(describeRegistryOutcome('create', 'wegis', {}).reloaded).toBe(true)
    expect(describeRegistryOutcome('create', 'wegis', null).reloaded).toBe(true)
    expect(describeRegistryOutcome('create', 'wegis', undefined).tone).toBe('success')
  })
})
