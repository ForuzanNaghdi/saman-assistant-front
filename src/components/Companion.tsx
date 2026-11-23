import { useId } from 'react';

interface CompanionProps {
  size?: number;
  /** نسخهٔ فشرده برای آواتار هدر؛ مدار و حرکت‌ها حذف می‌شوند. */
  compact?: boolean;
  /** حالت «در حال پاسخ»: سه نقطهٔ سرخ روی روبان به سمت گرهٔ سرخ می‌روند. */
  thinking?: boolean;
  className?: string;
}

/**
 * نشان هوش مصنوعی بیمه سامان.
 * «S» سامان به‌صورت یک روبان پیوستهٔ سرمه‌ای در دل یک مدار نازک؛
 * جریان نور از دل روبان می‌گذرد و گرهٔ سرخ برند را روشن می‌کند.
 */
/*
 * Geometry copied 1:1 from "companion logo animation.html" (version 2):
 * exactly 180°-symmetric about (60, 60) — the bottom half is the top half
 * rotated, so both bowls share the same curvature. The path starts at
 * (40, 100) and ends on the red node at (80, 20); keep the copy in theme.css
 * (.companion-dot offset-path) in sync.
 */
const RIBBON = 'M40 100 C95 95 85 65 60 60 C35 55 25 25 80 20';

export function Companion({
  size = 120,
  compact = false,
  thinking = false,
  className,
}: CompanionProps) {
  const uid = useId().replace(/:/g, '');
  const ribbonId = `cp-ribbon-${uid}`;
  const glowId = `cp-glow-${uid}`;
  const classes = [
    'companion',
    compact ? 'companion--compact' : '',
    thinking ? 'companion--thinking' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      className={classes}
      role="img"
      aria-label="همیار هوش مصنوعی بیمه سامان"
    >
      <defs>
        <linearGradient
          id={ribbonId}
          x1="80"
          y1="20"
          x2="40"
          y2="100"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#4a6eb1" />
          <stop offset="55%" stopColor="#264480" />
          <stop offset="100%" stopColor="#1a3160" />
        </linearGradient>
        <filter
          id={glowId}
          x="-45%"
          y="-45%"
          width="190%"
          height="190%"
        >
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {!compact && (
        <circle
          className="companion-orbit"
          cx="60"
          cy="59"
          r="46"
          stroke="#264480"
          strokeWidth="1.2"
        />
      )}

      <path
        className="companion-ribbon"
        d={RIBBON}
        pathLength={100}
        stroke={`url(#${ribbonId})`}
        strokeWidth="7.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {!compact && !thinking && (
        <>
          <path
            className="companion-pulse"
            d={RIBBON}
            pathLength={100}
            stroke="#e8f0ff"
            strokeWidth="7.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter={`url(#${glowId})`}
          />
          <circle
            className="companion-halo"
            cx="80"
            cy="20"
            r="11"
            fill="#ec3237"
          />
        </>
      )}

      <circle
        className="companion-node"
        cx="80"
        cy="20"
        r="4.2"
        fill="#ec3237"
      />

      {thinking && (
        <g aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <circle
              key={index}
              className="companion-dot"
              r="6"
              fill="#ec3237"
              filter={`url(#${glowId})`}
            />
          ))}
        </g>
      )}
    </svg>
  );
}
