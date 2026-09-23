import { describe, expect, it } from 'vitest'
import type { BackupComponentStatus } from '../services/api'
import {
  BACKUP_SHIP_STALE_FOR_SECONDS,
  BACKUP_SHIP_STALE_SECONDS,
  BACKUP_STALE_FOR_SECONDS,
  BACKUP_STALE_SECONDS,
  BACKUP_UNSHIPPED_LIMIT,
  BACKUP_UNSHIPPED_PILEUP_FOR_SECONDS,
  UNREPORTED_LABEL,
  ageState,
  componentKey,
  componentTone,
  formatAge,
  runState,
  staleForSeconds,
  staleThresholdSeconds,
  toMillis,
  unshippedState,
} from './backup'

/* ------------------------------------------------------------------ *
 * Backup reading rules.
 *
 * The thresholds have to match baedalus/monitoring/prometheus/rules/basic.yml,
 * otherwise the console calls a backup healthy while Prometheus is paging
 * about it. The null handling matters just as much: every one of these fields
 * is absent until a backup job writes it, and a zero in its place would read
 * as a measurement.
 * ------------------------------------------------------------------ */

function component(overrides: Partial<BackupComponentStatus> = {}): BackupComponentStatus {
  return {
    component: 'postgresql',
    instance: 'vm3-node:9100',
    job: 'vm3-node',
    last_success_timestamp: 1758600000,
    last_run_timestamp: 1758600000,
    last_run_status: 0,
    unshipped_total: 0,
    age_seconds: 600,
    ...overrides,
  }
}

describe('staleThresholdSeconds', () => {
  it('uses the BackupStale threshold of eight hours for a local backup', () => {
    expect(staleThresholdSeconds('postgresql')).toBe(BACKUP_STALE_SECONDS)
    expect(BACKUP_STALE_SECONDS).toBe(8 * 3600)
  })

  it('uses the BackupShipStale threshold of fourteen hours for offsite shipping', () => {
    expect(staleThresholdSeconds('ship')).toBe(BACKUP_SHIP_STALE_SECONDS)
    expect(BACKUP_SHIP_STALE_SECONDS).toBe(14 * 3600)
  })
})

describe('alert "for" durations', () => {
  // These mirror the `for:` clause of each rule in
  // baedalus/monitoring/prometheus/rules/basic.yml. Crossing the threshold
  // does not page by itself - the breach has to hold for this long first.
  it('holds BackupStale and BackupShipStale to a 15-minute for clause', () => {
    expect(BACKUP_STALE_FOR_SECONDS).toBe(15 * 60)
    expect(BACKUP_SHIP_STALE_FOR_SECONDS).toBe(15 * 60)
  })

  it('holds BackupUnshippedPileup to a 30-minute for clause', () => {
    expect(BACKUP_UNSHIPPED_PILEUP_FOR_SECONDS).toBe(30 * 60)
  })

  it('staleForSeconds picks the same 15-minute for clause for both stale rules', () => {
    expect(staleForSeconds('postgresql')).toBe(BACKUP_STALE_FOR_SECONDS)
    expect(staleForSeconds('ship')).toBe(BACKUP_SHIP_STALE_FOR_SECONDS)
  })
})

describe('ageState', () => {
  it('reports a null age as unreported rather than as fresh', () => {
    expect(ageState('postgresql', null)).toBe('unreported')
    expect(ageState('postgresql', undefined)).toBe('unreported')
    expect(ageState('postgresql', Number.NaN)).toBe('unreported')
  })

  it('treats an age at the threshold as fresh and one past it as stale', () => {
    expect(ageState('postgresql', BACKUP_STALE_SECONDS)).toBe('fresh')
    expect(ageState('postgresql', BACKUP_STALE_SECONDS + 1)).toBe('stale')
  })

  it('holds the shipping component to its own longer threshold', () => {
    expect(ageState('ship', 9 * 3600)).toBe('fresh')
    expect(ageState('ship', 15 * 3600)).toBe('stale')
  })

  it('does not call a clock skew stale', () => {
    expect(ageState('postgresql', -30)).toBe('fresh')
  })
})

describe('runState', () => {
  it('reads 0 as a successful run and 1 as a failed one', () => {
    expect(runState(0)).toBe('success')
    expect(runState(1)).toBe('failure')
  })

  it('reports an unwritten status as unreported', () => {
    expect(runState(null)).toBe('unreported')
    expect(runState(undefined)).toBe('unreported')
  })

  it('does not fold an unexpected number into success or failure', () => {
    expect(runState(2)).toBe('unknown')
    expect(runState(-1)).toBe('unknown')
  })
})

describe('unshippedState', () => {
  it('reports a missing counter as unreported, never as zero waiting', () => {
    expect(unshippedState(null)).toBe('unreported')
    expect(unshippedState(undefined)).toBe('unreported')
  })

  it('applies the BackupUnshippedPileup limit of four', () => {
    expect(BACKUP_UNSHIPPED_LIMIT).toBe(4)
    expect(unshippedState(0)).toBe('clear')
    expect(unshippedState(4)).toBe('clear')
    expect(unshippedState(5)).toBe('pileup')
  })
})

describe('componentTone', () => {
  it('is success when the backup is fresh and the last run succeeded', () => {
    expect(componentTone(component())).toBe('success')
  })

  it('warns when the last success passed the threshold', () => {
    expect(componentTone(component({ age_seconds: 364 * 24 * 3600 }))).toBe('warning')
  })

  it('warns when the last run failed even though the last success is fresh', () => {
    expect(componentTone(component({ last_run_status: 1 }))).toBe('warning')
  })

  it('warns when unshipped copies piled up', () => {
    expect(componentTone(component({ unshipped_total: 6 }))).toBe('warning')
  })

  it('stays neutral for a component that has never reported a success', () => {
    const neverRan = component({
      component: 'all',
      last_success_timestamp: null,
      age_seconds: null,
      unshipped_total: null,
    })
    expect(componentTone(neverRan)).toBe('neutral')
  })

  it('warns for the fixture row whose only report is a failed run', () => {
    // `all` in the captured Prometheus response carries a run status of 1 and
    // no success timestamp at all.
    const allFailed = component({
      component: 'all',
      last_success_timestamp: null,
      age_seconds: null,
      unshipped_total: null,
      last_run_status: 1,
    })
    expect(componentTone(allFailed)).toBe('warning')
  })
})

describe('formatAge', () => {
  it('labels a missing age as unreported', () => {
    expect(formatAge(null)).toBe(UNREPORTED_LABEL)
    expect(formatAge(undefined)).toBe(UNREPORTED_LABEL)
  })

  it('scales the unit with the size of the gap', () => {
    expect(formatAge(45)).toBe('45초 경과')
    expect(formatAge(600)).toBe('10분 경과')
    expect(formatAge(3 * 3600 + 25 * 60)).toBe('3시간 25분 경과')
    expect(formatAge(50 * 3600)).toBe('2일 2시간 경과')
  })

  it('names a timestamp ahead of the server clock instead of printing a negative', () => {
    expect(formatAge(-120)).toBe('시각 역전')
  })
})

describe('componentKey', () => {
  it('distinguishes two instances reporting the same component', () => {
    const vm3 = component({ instance: 'vm3-node:9100', job: 'vm3-node' })
    const vm4 = component({ instance: 'vm4-node:9100', job: 'vm4-node' })
    expect(componentKey(vm3)).not.toBe(componentKey(vm4))
  })

  it('is stable and reproducible for the same fields', () => {
    expect(componentKey(component())).toBe('postgresql|vm3-node:9100|vm3-node')
  })

  it('falls back to an empty segment when instance or job is missing', () => {
    const neverRan = component({ component: 'all', instance: null, job: null })
    expect(componentKey(neverRan)).toBe('all||')
  })
})

describe('toMillis', () => {
  it('converts a Prometheus unix timestamp to milliseconds', () => {
    expect(toMillis(1758600000)).toBe(1758600000000)
  })

  it('keeps a missing timestamp missing', () => {
    expect(toMillis(null)).toBeNull()
    expect(toMillis(undefined)).toBeNull()
    expect(toMillis(Number.POSITIVE_INFINITY)).toBeNull()
  })
})
