import {
  useEffect,
  useState,
  type FormEvent,
  type RefObject,
} from 'react';

interface IdentityPanelProps {
  userId: string;
  inputRef: RefObject<HTMLInputElement>;
  onSave: (value: string) => void;
}

const IDENTITY_PATTERN = /^[A-Za-z0-9._:@-]{1,128}$/;

export function IdentityPanel({ userId, inputRef, onSave }: IdentityPanelProps) {
  const [draft, setDraft] = useState(userId);

  useEffect(() => {
    setDraft(userId);
  }, [userId]);

  const trimmed = draft.trim();
  const valid = IDENTITY_PATTERN.test(trimmed);
  const dirty = trimmed !== userId;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (valid && dirty) onSave(trimmed);
  }

  return (
    <form className="identity" onSubmit={handleSubmit}>
      <label className="identity-label" htmlFor="identity-input">
        شناسهٔ کاربر
      </label>
      <div className="identity-row">
        <input
          id="identity-input"
          ref={inputRef}
          className="identity-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          spellCheck={false}
          autoComplete="off"
          dir="ltr"
          maxLength={128}
        />
        <button
          type="submit"
          className="identity-save"
          disabled={!valid || !dirty}
        >
          ذخیره
        </button>
      </div>
      <p className={`identity-hint${valid ? '' : ' invalid'}`}>
        {valid
          ? 'این شناسه با هر درخواست در هدر هویت ارسال می‌شود.'
          : 'فقط حروف لاتین، رقم و نشانه‌های . _ : @ - مجاز است.'}
      </p>
    </form>
  );
}
