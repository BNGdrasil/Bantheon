import { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it } from 'vitest'
import { issueWithheldPlaintext, rotateWithheldPlaintext } from './apikeys'
import type { ApiKeyCreateRequest, ApiKeyCreated } from '../services/api'

/* ------------------------------------------------------------------ *
 * The plaintext key and the mutation cache.
 *
 * TanStack Query stores what a `mutationFn` resolves with, and that store
 * outlives the dialog that showed the value: it is what the devtools read and
 * what would be replayed. So the plaintext must never be part of a resolved
 * value, and this file checks the cache itself rather than the screen.
 *
 * The mutation is driven through the real `MutationCache` without React, so
 * the run needs no DOM. `cache.build(...).execute(...)` is the same path
 * `useMutation` takes once an observer calls it.
 * ------------------------------------------------------------------ */

const PLAINTEXT = 'bng_0123456789abcdefghijklmnopqrstuvwxyzABCDE'

const CREATED: ApiKeyCreated = {
  id: 11,
  key_name: 'deploy-runner',
  user_id: 2,
  is_active: true,
  key_prefix: 'bng_0123',
  expires_at: null,
  created_at: '2026-09-28T00:00:00',
  last_used_at: null,
  key: PLAINTEXT,
}

const client = new QueryClient()

afterEach(() => {
  client.getMutationCache().clear()
})

/**
 * Everything the cache holds, as one string.
 *
 * The mutation objects themselves refer back to the client, so the state of
 * each one is serialised instead: that state is where `data`, `variables`,
 * `error` and `context` live, which is every value the cache carries.
 */
function serializeMutationCache(): string {
  return JSON.stringify(client.getMutationCache().getAll().map((mutation) => mutation.state))
}

describe('issueWithheldPlaintext', () => {
  it('keeps the plaintext out of the mutation cache while handing it to the caller', async () => {
    let held: string | null = null
    const payload: ApiKeyCreateRequest = { key_name: 'deploy-runner', user_id: 2 }

    const mutation = client.getMutationCache().build(client, {
      mutationFn: issueWithheldPlaintext(
        async () => ({ ...CREATED }),
        (plaintext) => {
          held = plaintext
        }
      ),
    })
    const result = await mutation.execute(payload)

    // The screen still receives the value, which is the whole point of the
    // dialog: it is handed over through the sink rather than through the
    // resolved value.
    expect(held).toBe(PLAINTEXT)
    expect('key' in result).toBe(false)
    expect(result.key_prefix).toBe('bng_0123')

    const cached = serializeMutationCache()
    expect(cached).not.toContain(PLAINTEXT)
    // The prefix is not a credential and does belong in the cached record, so
    // the check above has to be passing for the right reason.
    expect(cached).toContain('bng_0123')
    expect(mutation.state.data).not.toHaveProperty('key')
    // The request body never carried key material either, and `variables` is
    // cached alongside the result.
    expect(JSON.stringify(mutation.state.variables)).not.toContain(PLAINTEXT)
  })

  it('leaves nothing behind when the request is refused', async () => {
    let held: string | null = null
    const mutation = client.getMutationCache().build(client, {
      retry: false,
      mutationFn: issueWithheldPlaintext(
        async () => {
          throw new Error('User 2 already holds 2 active API keys')
        },
        (plaintext) => {
          held = plaintext
        }
      ),
    })

    await expect(mutation.execute({ key_name: 'one-too-many', user_id: 2 })).rejects.toThrow(
      'already holds'
    )
    expect(held).toBeNull()
    expect(serializeMutationCache()).not.toContain(PLAINTEXT)
  })
})

describe('rotateWithheldPlaintext', () => {
  it('keeps the rotated plaintext out of the mutation cache as well', async () => {
    let held: string | null = null
    const mutation = client.getMutationCache().build(client, {
      mutationFn: rotateWithheldPlaintext(
        async () => ({ ...CREATED, id: 12 }),
        (plaintext) => {
          held = plaintext
        }
      ),
    })
    const result = await mutation.execute(2)

    expect(held).toBe(PLAINTEXT)
    expect('key' in result).toBe(false)
    expect(serializeMutationCache()).not.toContain(PLAINTEXT)
  })

  it('still holds nothing after both writes ran in the same cache', async () => {
    const sink = () => undefined
    const issue = client.getMutationCache().build(client, {
      mutationFn: issueWithheldPlaintext(async () => ({ ...CREATED }), sink),
    })
    const rotate = client.getMutationCache().build(client, {
      mutationFn: rotateWithheldPlaintext(async () => ({ ...CREATED, id: 12 }), sink),
    })

    await issue.execute({ key_name: 'deploy-runner', user_id: 2 })
    await rotate.execute(2)

    expect(client.getMutationCache().getAll()).toHaveLength(2)
    expect(serializeMutationCache()).not.toContain(PLAINTEXT)
    expect(serializeMutationCache()).not.toContain('bng_0123456789')
  })
})
