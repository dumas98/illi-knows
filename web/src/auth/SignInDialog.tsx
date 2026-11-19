import { useEffect, useRef } from 'react';
import { useAuth } from './context';
import { SignInForm } from './SignInForm';

export function SignInDialog() {
  const { dialog, closeDialog } = useAuth();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (dialog.open && !el.open) el.showModal();
    if (!dialog.open && el.open) el.close();
  }, [dialog.open]);

  return (
    <dialog ref={ref} aria-labelledby="signin-dialog-title" onClose={closeDialog}>
      <div className="stack" style={{ gap: 14 }}>
        <h2 id="signin-dialog-title">{dialog.title}</h2>
        <p className="small muted">RSVPs, reminders, and your planner need an account. Browsing never does.</p>
        {dialog.open && <SignInForm idPrefix="dialog" />}
        <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={closeDialog}>
          Keep browsing
        </button>
      </div>
    </dialog>
  );
}
