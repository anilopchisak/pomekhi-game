import { useEffect, useId, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, MouseEvent, ReactNode, RefObject } from 'react';
import styles from './GameDialog.module.css';

function isBackdrop(event: MouseEvent<HTMLDialogElement>) {
  if (event.target !== event.currentTarget) return false;
  const { top, right, bottom, left } = event.currentTarget.getBoundingClientRect();
  return event.clientX < left || event.clientX >= right || event.clientY < top || event.clientY >= bottom;
}

export function GameDialog({ title, eyebrow, children, onClose, returnFocus, fallbackFocus, open = true }: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  onClose: () => void;
  returnFocus?: HTMLElement | null;
  open?: boolean;
  fallbackFocus?: RefObject<HTMLElement | null>;
}) {
  const heading = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const startedOnBackdrop = useRef(false);
  useEffect(() => {
    if (!open) return;
    startedOnBackdrop.current = false;
    const dialog = ref.current!;
    const opener = returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    (dialog.querySelector<HTMLElement>('[data-dialog-focus]') ?? dialog.querySelector('h2'))?.focus();
    return () => {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
      const fallback = fallbackFocus?.current;
      if (opener?.isConnected && !opener.matches(':disabled')) opener.focus();
      else if (fallback?.isConnected && !fallback.matches(':disabled')) fallback.focus();
      else document.querySelector<HTMLElement>('[data-scene-heading]')?.focus();
    };
  }, [open, returnFocus, fallbackFocus]);
  return <dialog ref={ref} className={styles.dialog} aria-labelledby={heading}
    onPointerDown={event => { startedOnBackdrop.current = event.isPrimary && event.button === 0 && isBackdrop(event); }}
    onPointerCancel={() => { startedOnBackdrop.current = false; }}
    onClick={event => {
      const dismiss = startedOnBackdrop.current && isBackdrop(event);
      startedOnBackdrop.current = false;
      if (dismiss) { event.stopPropagation(); onClose(); }
    }}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
    }}>
    <div className={styles.heading}>
      <div>
        {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
        <h2 id={heading} tabIndex={-1}>{title}</h2>
      </div>
      <button data-secondary className={styles.close} type="button" aria-label="Закрыть окно" onClick={onClose}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </button>
    </div>
    {children}
  </dialog>;
}

export function DialogButton({ title, children, content, keepMounted = false, ...button }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'content'> & {
  title: string;
  content: ReactNode;
  keepMounted?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  return <>
    <button {...button} type="button" ref={opener} onClick={() => setOpen(true)}>{children}</button>
    {(open || keepMounted) && <GameDialog title={title} onClose={() => setOpen(false)} returnFocus={open ? opener.current : null} open={open}>
      {content}
    </GameDialog>}
  </>;
}

interface ConfirmButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  title: string;
  eyebrow?: string;
  description?: ReactNode;
  confirm: string;
  cancel?: string;
  onConfirm: () => void;
  native?: boolean;
  fallbackFocus?: RefObject<HTMLElement | null>;
}

export function ConfirmButton(props: ConfirmButtonProps) {
  const { title, eyebrow, description, confirm, cancel = 'Отмена', onConfirm, native = false, fallbackFocus, children, ...button } = props;
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  return <>
    <button {...button} type="button" ref={opener} onClick={() => {
      if (!native) setOpen(true);
      else if (window.confirm(typeof description === 'string' ? `${title} ${description}` : title)) onConfirm();
    }}>{children}</button>
    {open && <GameDialog title={title} eyebrow={eyebrow} onClose={() => setOpen(false)} returnFocus={opener.current} fallbackFocus={fallbackFocus}>
      {typeof description === 'string' ? <p>{description}</p> : description}
      <div className={styles.actions}>
        <button data-secondary type="button" data-dialog-focus onClick={() => setOpen(false)}>{cancel}</button>
        <button type="button" disabled={button.disabled} onClick={() => { setOpen(false); onConfirm(); }}>{confirm}</button>
      </div>
    </GameDialog>}
  </>;
}
