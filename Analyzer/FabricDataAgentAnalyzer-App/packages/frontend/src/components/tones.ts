import type { Tone } from '@/lib/analyzer-types';

/** Static class names, so Tailwind can see every one of them. */
export const TONE_TEXT: Record<Tone, string> = {
  good: 'text-success',
  warn: 'text-warning',
  bad: 'text-danger',
  info: 'text-info',
  muted: 'text-muted-foreground',
};

export const TONE_SOFT: Record<Tone, string> = {
  good: 'bg-success-soft text-success',
  warn: 'bg-warning-soft text-warning',
  bad: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  muted: 'bg-muted text-muted-foreground',
};

export const TONE_SOLID: Record<Tone, string> = {
  good: 'bg-success',
  warn: 'bg-warning',
  bad: 'bg-danger',
  info: 'bg-info',
  muted: 'bg-muted-foreground',
};

export const TONE_STROKE: Record<Tone, string> = {
  good: 'stroke-success',
  warn: 'stroke-warning',
  bad: 'stroke-danger',
  info: 'stroke-info',
  muted: 'stroke-muted-foreground',
};
