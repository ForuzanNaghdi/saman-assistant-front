import type { ReactNode } from 'react';
import { Companion } from './Companion';

interface WelcomeProps {
  onAsk: (question: string) => void;
}

interface HeroCard {
  title: string;
  description: string;
  prompt: string;
  icon: ReactNode;
}

const ICON_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const CARDS: HeroCard[] = [
  {
    title: 'بدنهٔ کیلومتری',
    description: 'سقف ۵، ۸ یا ۱۲ هزار کیلومتر',
    prompt:
      'بیمهٔ بدنهٔ کیلومتری چه تفاوتی با بیمهٔ بدنهٔ عادی دارد؟ در بسته‌های ۵، ۸ و ۱۲ هزار کیلومتری دقیقاً چه چیزی یکسان می‌ماند و چه چیزی تغییر می‌کند؟',
    icon: (
      <svg {...ICON_PROPS} aria-hidden="true">
        <path d="M4 16.5v-2.2l1.6-4A2 2 0 0 1 7.5 9h9a2 2 0 0 1 1.9 1.3l1.6 4v2.2" />
        <path d="M4 16.5h16" />
        <circle cx="7.4" cy="16.6" r="1.5" />
        <circle cx="16.6" cy="16.6" r="1.5" />
        <path d="M9.6 6.2h4.8" />
      </svg>
    ),
  },
  {
    title: 'مرز شخص ثالث',
    description: 'رانندهٔ مقصر هم ثالث است؟',
    prompt:
      'در یک تصادف چه کسانی شخص ثالث محسوب می‌شوند و چه کسی نمی‌شود؟ اگر رانندهٔ مقصر خودش آسیب ببیند، کدام پوشش بیمه‌نامه خسارت او را جبران می‌کند؟',
    icon: (
      <svg {...ICON_PROPS} aria-hidden="true">
        <path d="M12 3.5 5 6.2v5.1c0 4.3 2.9 7.5 7 9.2 4.1-1.7 7-4.9 7-9.2V6.2Z" />
        <circle cx="12" cy="10.4" r="2.1" />
        <path d="M8.7 16.2c.6-1.6 1.8-2.4 3.3-2.4s2.7.8 3.3 2.4" />
      </svg>
    ),
  },
  {
    title: 'درمان گروهی',
    description: 'فرانشیز، انتظار و دندان‌پزشکی',
    prompt:
      'برای یک خانواده، بیمهٔ درمان گروهی بهتر است یا بیمهٔ تکمیلی خانواده؟ فرانشیز، دورهٔ انتظار و پوشش دندان‌پزشکی در هر کدام چگونه تعیین می‌شود؟',
    icon: (
      <svg {...ICON_PROPS} aria-hidden="true">
        <path d="M12 20.5s-7-4.3-7-9.2A4.3 4.3 0 0 1 12 8.6a4.3 4.3 0 0 1 7 2.7c0 4.9-7 9.2-7 9.2Z" />
        <path d="M9 12.4h1.7l1-1.9 1.2 3.4 1-1.5H16" />
      </svg>
    ),
  },
  {
    title: 'مازاد ثالث',
    description: 'وقتی سقف تعهدات کافی نیست',
    prompt:
      'پوشش مازاد شخص ثالث دقیقاً چه زمانی وارد می‌شود، چرا جایگزین بیمهٔ شخص ثالث نیست، و برای چه کسانی مناسب‌تر است؟',
    icon: (
      <svg {...ICON_PROPS} aria-hidden="true">
        <path d="M12 3.5 5 6.2v5.1c0 4.3 2.9 7.5 7 9.2 4.1-1.7 7-4.9 7-9.2V6.2Z" />
        <path d="M12 8.6v6.2M8.9 11.7h6.2" />
      </svg>
    ),
  },
];

export function Welcome({ onAsk }: WelcomeProps) {
  return (
    <div className="hero">
      <Companion size={156} className="hero-companion" />
      <span className="hero-badge">دستیار هوشمند بیمهٔ سامان</span>

      <h2>
        پاسخ از دل <strong>دانش سازمانی سامان</strong> روشن می‌شود.
      </h2>
      <p>
        بپرسید یا از موضوعات پیشنهادی شروع کنید؛ پاسخ همراه با منبعش می‌آید تا
        با اطمینان تصمیم بگیرید.
      </p>

      <div className="hero-cards">
        {CARDS.map((card) => (
          <button
            key={card.title}
            type="button"
            className="hero-card"
            onClick={() => onAsk(card.prompt)}
          >
            <span className="hero-card-icon" aria-hidden="true">
              {card.icon}
            </span>
            <span className="hero-card-text">
              <span className="hero-card-title">{card.title}</span>
              <span className="hero-card-desc">{card.description}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
