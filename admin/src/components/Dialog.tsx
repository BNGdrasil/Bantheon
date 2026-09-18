import { FormEvent, KeyboardEvent, ReactNode, useEffect, useRef } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Modal dialog with the keyboard behaviour a dialog has to have: focus moves
 * in on open, Tab stays inside, Escape closes, and focus returns to whatever
 * opened it. Escape is ignored while a write is in flight so that a half-sent
 * request cannot be abandoned by accident.
 */
export function Dialog({
  labelledBy,
  onClose,
  closeDisabled = false,
  onSubmit,
  children,
}: {
  labelledBy: string
  onClose: () => void
  closeDisabled?: boolean
  onSubmit?: (event: FormEvent) => void
  children: ReactNode
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null
    const first = containerRef.current?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()

    return () => {
      openerRef.current?.focus?.()
    }
  }, [])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      if (!closeDisabled) {
        event.stopPropagation()
        onClose()
      }
      return
    }
    if (event.key !== 'Tab') {
      return
    }

    const focusable = Array.from(
      containerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []
    ).filter((element) => element.offsetParent !== null)
    if (focusable.length === 0) {
      return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const current = document.activeElement

    if (event.shiftKey && current === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && current === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const content = onSubmit ? (
    <form className="modal" onSubmit={onSubmit}>
      {children}
    </form>
  ) : (
    <div className="modal">{children}</div>
  )

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      ref={containerRef}
      onKeyDown={handleKeyDown}
    >
      {content}
    </div>
  )
}
