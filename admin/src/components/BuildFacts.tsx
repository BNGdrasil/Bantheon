import { useState } from 'react'
import {
  BuildFacts,
  NOT_RECORDED_LABEL,
  buildValue,
  shortSha,
  uptimeLabel,
} from '../lib/build'
import { formatKst } from '../lib/datetime'

/* ------------------------------------------------------------------ *
 * Rendering of the five build fields.
 *
 * The gateway's own build and an upstream's build carry the same shape, so
 * one component draws both. Keeping it in one place is what stops the two
 * screens from disagreeing about which value counts as missing.
 * ------------------------------------------------------------------ */

/** A value the source never recorded. Never drawn as a blank cell. */
function Missing() {
  return <span className="detail">{NOT_RECORDED_LABEL}</span>
}

/**
 * A commit SHA, shortened for the line and kept whole in the title.
 *
 * The copy button is a convenience: clipboard access needs a secure context
 * and a permission the browser may refuse, so a refused copy falls back to
 * printing the full value for the operator to select by hand instead of
 * failing silently.
 */
export function ShaValue({ value }: { value: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle')

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setState('copied')
    } catch {
      setState('manual')
    }
  }

  return (
    <>
      <span className="definition-value mono" title={value}>
        {shortSha(value)}
      </span>
      <p className="spaced-top-sm">
        <button type="button" className="btn btn--sm" onClick={handleCopy}>
          전체 SHA 복사
        </button>
      </p>
      {state === 'copied' && <p className="detail spaced-top-sm">전체 SHA를 복사했습니다.</p>}
      {state === 'manual' && (
        <div className="spaced-top-sm">
          <p className="detail">브라우저가 복사를 허용하지 않아 전체 값을 아래에 적었습니다.</p>
          <p className="mono break-all">{value}</p>
        </div>
      )}
    </>
  )
}

/**
 * The five build fields as a definition list, with the elapsed time since the
 * process started.
 *
 * `now` comes from the caller's `useNow()` so that the elapsed label keeps
 * moving on the same tick as every other elapsed label on the screen.
 */
export function BuildFactsList({
  build,
  now,
}: {
  build: BuildFacts | null | undefined
  now: number
}) {
  const version = buildValue(build?.version)
  const sha = buildValue(build?.build_sha)
  const buildTime = buildValue(build?.build_time)
  const ref = buildValue(build?.build_ref)
  const startedAt = buildValue(build?.started_at)
  const uptime = uptimeLabel(startedAt, now)

  return (
    <div className="definition-list">
      <div>
        <p className="definition-term">버전</p>
        {version ? <p className="definition-value mono">{version}</p> : <Missing />}
      </div>
      <div>
        <p className="definition-term">커밋 SHA</p>
        {sha ? <ShaValue value={sha} /> : <Missing />}
      </div>
      <div>
        <p className="definition-term">빌드 시각</p>
        {buildTime ? (
          <>
            <p className="definition-value">{formatKst(buildTime, NOT_RECORDED_LABEL)}</p>
            <p className="detail mono break-all">{buildTime}</p>
          </>
        ) : (
          <Missing />
        )}
      </div>
      <div>
        <p className="definition-term">빌드 기준</p>
        {ref ? <p className="definition-value mono break-all">{ref}</p> : <Missing />}
      </div>
      <div>
        <p className="definition-term">기동 시각</p>
        {startedAt ? (
          <p className="definition-value">{formatKst(startedAt, NOT_RECORDED_LABEL)}</p>
        ) : (
          <Missing />
        )}
      </div>
      <div>
        <p className="definition-term">기동 이후 경과</p>
        {uptime ? <p className="definition-value">{uptime}</p> : <Missing />}
      </div>
    </div>
  )
}
