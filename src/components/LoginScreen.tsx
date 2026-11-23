import { useState } from 'react';
import { Companion } from './Companion';

interface LoginScreenProps {
  /**
   * شروع ورود سازمانی. وقتی Keycloak راه‌اندازی شد، این پروپ به
   * AuthService.doLogin وصل می‌شود (docs/KEYCLOAK-INTEGRATION-GUIDE.md).
   * تا آن زمان دکمه یک توضیح درون‌خطی نشان می‌دهد.
   */
  onSso?: () => void;
  /** ادامه با شناسهٔ مهمان روی همین مرورگر. */
  onGuest: () => void;
}

const ICON_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const FEATURES = [
  {
    title: 'پاسخ بر پایهٔ اسناد رسمی',
    description: 'هر پاسخ همراه با منبع رسمی می‌آید.',
    icon: (
      <svg {...ICON_PROPS} aria-hidden="true">
        <path d="M6.5 3.5h7.2L18.5 8v12.5h-12Z" />
        <path d="M13.5 3.7V8h4.8" />
        <path d="m9.2 14.6 1.8 1.8 3.4-3.7" />
      </svg>
    ),
  },
  {
    title: 'پوشش کامل محصولات',
    description: 'عمر، خودرو، درمان و آتش سوزی.',
    icon: (
      <svg {...ICON_PROPS} aria-hidden="true">
        <path d="M12 3.5 5 6.2v5.1c0 4.3 2.9 7.5 7 9.2 4.1-1.7 7-4.9 7-9.2V6.2Z" />
        <path d="m9.3 12.1 1.9 1.9 3.5-3.7" />
      </svg>
    ),
  },
  {
    title: 'گفتگوی محرمانه',
    description: 'هویت و گفتگوی شما نزد سامان امن می‌ماند.',
    icon: (
      <svg {...ICON_PROPS} aria-hidden="true">
        <rect x="5.5" y="10.5" width="13" height="9.5" rx="2.4" />
        <path d="M8.6 10.5V8a3.4 3.4 0 0 1 6.8 0v2.5" />
        <path d="M12 14.4v2" />
      </svg>
    ),
  },
];

const SSO_NOTICE =
  'ورود با حساب سامان هنوز در این نسخه فعال نشده است. می‌توانید به‌عنوان مهمان ادامه دهید.';

/**
 * صفحهٔ ورود دستیار.
 * جلد سرمه‌ای با نشان «همراه» و کارت ورود روی بوم روشن؛
 * دو مسیر: حساب سازمانی (Keycloak) و ادامه به‌عنوان مهمان.
 */
export function LoginScreen({ onSso, onGuest }: LoginScreenProps) {
  const [notice, setNotice] = useState<string | null>(null);

  function handleSso(): void {
    if (onSso) {
      setNotice(null);
      onSso();
      return;
    }
    setNotice(SSO_NOTICE);
  }

  return (
    <div className="auth">
      <section className="auth-cover" aria-label="معرفی دستیار">
        <div className="auth-brand">
          <span className="auth-brand-mark" aria-hidden="true">
            S
          </span>
          <div className="auth-brand-text">
            <strong>دستیار بیمهٔ سامان</strong>
            <small>سامانهٔ هوشمند دانش بیمه</small>
          </div>
        </div>

        <div className="auth-hero">
          <div className="auth-mark">
            <Companion size={176} />
          </div>
          <span className="auth-badge">دستیار هوشمند سامان</span>
          <p className="auth-headline">
            دانش بیمهٔ سامان، <strong>سریع و دقیق</strong>
          </p>
          <p className="auth-sub">
          دستیار شما در درک قوانین و مقررات بیمه،
           بررسی شرایط و استثنائات پوشش و دریافت پاسخ‌های دقیق و مستند، همراه با منابع معتبر
          </p>

          <ul className="auth-features">
            {FEATURES.map((feature) => (
              <li className="auth-feature" key={feature.title}>
                <span className="auth-feature-icon" aria-hidden="true">
                  {feature.icon}
                </span>
                <span className="auth-feature-text">
                  <span className="auth-feature-title">{feature.title}</span>
                  <span className="auth-feature-desc">
                    {feature.description}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="auth-cover-footer">© ۱۴۰۵ بیمهٔ سامان</p>
      </section>

      <main className="auth-panel">
        <div className="auth-card">
          <div className="auth-card-head">
            <span className="auth-rule" aria-hidden="true" />
            {/* <span className="auth-eyebrow">خوش آمدید</span> */}
            <h1>ورود به دستیار</h1>
            <p className="auth-lead">
              برای شروع گفتگو و دسترسی به دستیار هوشمند، وارد حساب کاربری خود
              شوید.
            </p>
          </div>

          <div className="auth-actions">
            <button type="button" className="auth-primary" onClick={handleSso}>
              <svg {...ICON_PROPS} aria-hidden="true">
                <path d="M12 3.5 5 6.2v5.1c0 4.3 2.9 7.5 7 9.2 4.1-1.7 7-4.9 7-9.2V6.2Z" />
                <path d="m9.3 12.1 1.9 1.9 3.5-3.7" />
              </svg>
              ورود با  حساب کاربری بیمه سامان
            </button>

            <div className="auth-divider" role="separator">
              یا
            </div>

            <button
              type="button"
              className="auth-secondary"
              onClick={onGuest}
            >
              <svg {...ICON_PROPS} aria-hidden="true">
                <circle cx="12" cy="8.4" r="3.6" />
                <path d="M5.5 20c.7-3.4 3.2-5.3 6.5-5.3s5.8 1.9 6.5 5.3" />
              </svg>
              ادامه به‌عنوان مهمان
            </button>
            <p className="auth-hint">
              بدون نیاز به حساب؛ یک شناسهٔ آزمایشی روی همین مرورگر ساخته
              می‌شود.
            </p>
          </div>

          <div className="auth-live" aria-live="polite">
            {notice ? (
              <div className="auth-notice">
                <svg {...ICON_PROPS} aria-hidden="true">
                  <circle cx="12" cy="12" r="8.5" />
                  <path d="M12 11v5.2" />
                  <circle
                    cx="12"
                    cy="7.9"
                    r="0.9"
                    fill="currentColor"
                    stroke="none"
                  />
                </svg>
                <span>{notice}</span>
              </div>
            ) : null}
          </div>

          <p className="auth-legal">
            با ورود، شرایط استفاده و سیاست حریم خصوصی بیمهٔ سامان را می‌پذیرید.
          </p>

          <div className="auth-meta">
            <svg {...ICON_PROPS} aria-hidden="true">
              <rect x="5.5" y="10.5" width="13" height="9.5" rx="2.4" />
              <path d="M8.6 10.5V8a3.4 3.4 0 0 1 6.8 0v2.5" />
            </svg>
            <span>اتصال امن</span>
            <span className="auth-meta-sep" aria-hidden="true">
              ·
            </span>
            <span>احراز هویت توسط سامانهٔ هویت سنجی بیمهٔ سامان</span>
          </div>
        </div>
      </main>
    </div>
  );
}
