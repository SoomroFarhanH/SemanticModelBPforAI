import { useEffect, useState } from 'react';

import type { Tone } from '@/lib/analyzer-types';
import { cn } from '@/lib/utils';

import { TONE_STROKE } from './tones';

/** Circular readiness score. Color follows the release rating, not the number. */
export function ScoreRing({
  value,
  tone,
  size = 184,
}: {
  value: number | null | undefined;
  tone: Tone;
  size?: number;
}) {
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(value ?? 0));
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <div
      role="img"
      aria-label={
        value == null
          ? 'Readiness score not available'
          : `Readiness score ${value} percent`
      }
      className="relative shrink-0"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          className="fill-none stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - shown / 100)}
          className={cn(
            'fill-none transition-[stroke-dashoffset] duration-1000 ease-out motion-reduce:transition-none',
            TONE_STROKE[tone]
          )}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="font-numeric text-hero-900 font-bold leading-hero-900 tabular-nums">
            {value == null ? 'N/A' : value}
            {value == null ? null : (
              <span className="ml-100 text-500 font-medium text-muted-foreground">
                %
              </span>
            )}
          </div>
          <div className="text-200 font-medium uppercase tracking-wider text-muted-foreground">
            Readiness
          </div>
        </div>
      </div>
    </div>
  );
}
