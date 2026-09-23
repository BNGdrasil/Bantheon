/* ------------------------------------------------------------------ *
 * Wording for the registry reload outcome of a service write.
 *
 * The server commits the record first and reloads the routing table after, and
 * a failed reload answers 207 instead of 200 or 201. axios accepts 207 as a
 * success, so the write never throws in that case: the only signal is
 * `registry_reloaded`. Reporting such a write as a plain success would tell the
 * operator the gateway routes to a record it has not loaded.
 * ------------------------------------------------------------------ */
// Type-only imports: this module is pure wording and must not pull the axios
// clients or the React panels into a unit test that only checks the text.
import type { RegistryReloadOutcome } from '../services/api'
import type { PanelTone } from '../components/StatusPanel'

export type RegistryAction = 'create' | 'update' | 'delete'

export interface RegistryOutcomeNotice {
  reloaded: boolean
  tone: PanelTone
  title: string
  message: string
  /** The server-reported reason, shown verbatim. Null on success. */
  error: string | null
}

const SAVED_TEXT: Record<RegistryAction, string> = {
  create: '등록했습니다',
  update: '수정했습니다',
  delete: '삭제했습니다',
}

const RETRY_TEXT =
  '서비스 화면의 "등록부 다시 적재"를 눌러 다시 시도하세요. 적재에 성공할 때까지 게이트웨이는 이전 라우팅 표를 그대로 사용합니다.'

/**
 * Builds the notice for one write result.
 *
 * A response without `registry_reloaded` is read as a reload that succeeded,
 * which is what a server that predates this field means by 200 or 201.
 */
export function describeRegistryOutcome(
  action: RegistryAction,
  subject: string,
  result: Partial<RegistryReloadOutcome> | null | undefined
): RegistryOutcomeNotice {
  const reloaded = result?.registry_reloaded !== false
  const saved = SAVED_TEXT[action]

  if (reloaded) {
    return {
      reloaded: true,
      tone: 'success',
      title: '작업을 마쳤습니다',
      message: `${subject} 서비스를 ${saved}. 등록부도 함께 다시 적재됐습니다.`,
      error: null,
    }
  }

  return {
    reloaded: false,
    tone: 'warning',
    title: '저장은 됐지만 등록부에 반영하지 못했습니다',
    message: `${subject} 서비스를 ${saved}. 다만 게이트웨이 등록부를 다시 적재하지 못했습니다. ${RETRY_TEXT}`,
    error: result?.registry_error ?? null,
  }
}
