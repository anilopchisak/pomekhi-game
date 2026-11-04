import { useEffect, useId, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode, RefObject } from 'react';
import styles from './GameDialog.module.css';

export function GameDialog({ title, children, onClose, returnFocus, fallbackFocus, open = true }: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  returnFocus?: HTMLElement | null;
  open?: boolean;
  fallbackFocus?: RefObject<HTMLElement | null>;
}) {
  const heading = useId();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!open) return;
    const dialog = ref.current!;
    const opener = returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    dialog.querySelector<HTMLElement>('[data-dialog-focus]')?.focus();
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
    onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
    }}>
    <h2 id={heading}>{title}</h2>
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
      <button className={styles.close} type="button" data-dialog-focus onClick={() => setOpen(false)}>Закрыть</button>
      {content}
    </GameDialog>}
  </>;
}

interface ConfirmButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  title: string;
  description?: ReactNode;
  confirm: string;
  cancel?: string;
  onConfirm: () => void;
  native?: boolean;
  fallbackFocus?: RefObject<HTMLElement | null>;
}

export function ConfirmButton(props: ConfirmButtonProps) {
  const { title, description, confirm, cancel = 'Отмена', onConfirm, native = false, fallbackFocus, children, ...button } = props;
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  return <>
    <button {...button} type="button" ref={opener} onClick={() => {
      if (!native) setOpen(true);
      else if (window.confirm(typeof description === 'string' ? `${title} ${description}` : title)) onConfirm();
    }}>{children}</button>
    {open && <GameDialog title={title} onClose={() => setOpen(false)} returnFocus={opener.current} fallbackFocus={fallbackFocus}>
      {typeof description === 'string' ? <p>{description}</p> : description}
      <div className={styles.actions}>
        <button type="button" data-dialog-focus onClick={() => setOpen(false)}>{cancel}</button>
        <button type="button" disabled={button.disabled} onClick={() => { setOpen(false); onConfirm(); }}>{confirm}</button>
      </div>
    </GameDialog>}
  </>;
}
