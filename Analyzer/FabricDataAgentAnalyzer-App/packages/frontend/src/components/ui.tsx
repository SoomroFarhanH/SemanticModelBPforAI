import {
  CircleCheck,
  CircleHelp,
  CircleMinus,
  CircleX,
  TriangleAlert,
} from 'lucide-react';
import type { ReactNode } from 'react';

import type { Tone } from '@/lib/analyzer-types';
import { cn } from '@/lib/utils';

import { TONE_SOFT, TONE_SOLID } from './tones';

export function Pill({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-100 whitespace-nowrap rounded-full px-200 py-100 text-200 font-medium leading-200',
        TONE_SOFT[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function StatusIcon({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const props = { 'aria-hidden': true, className: cn('icon-size-300', className) };
  switch (status) {
    case 'PASS':
      return <CircleCheck {...props} />;
    case 'FAIL':
      return <CircleX {...props} />;
    case 'WARN':
      return <TriangleAlert {...props} />;
    case 'NA':
    case 'NOT_APPLICABLE':
      return <CircleMinus {...props} />;
    default:
      return <CircleHelp {...props} />;
  }
}

export function Card({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        'flex min-w-0 flex-col rounded-2xl border border-border bg-card text-card-foreground',
        className
      )}
    >
      {title || action ? (
        <header className="flex items-start justify-between gap-300 px-500 pt-500">
          <div className="min-w-0">
            {title ? (
              <h2 className="text-400 font-semibold leading-400">{title}</h2>
            ) : null}
            {description ? (
              <p className="mt-100 text-200 leading-200 text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {action}
        </header>
      ) : null}
      <div className={cn('min-h-0 flex-1 p-500', title && 'pt-400', bodyClassName)}>
        {children}
      </div>
    </section>
  );
}

export function Meter({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null | undefined;
  tone: Tone;
}) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="flex items-baseline justify-between text-200 leading-200">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-numeric font-semibold tabular-nums">
          {value == null ? 'N/A' : `${value}%`}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value ?? undefined}
        className="mt-100 h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none',
            TONE_SOLID[tone]
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
