import { describe, expect, it } from 'vitest';

import { cn } from './utils';

describe('cn', () => {
  it('keeps a custom font-size token alongside a color class', () => {
    expect(cn('text-200 font-medium', 'bg-danger-soft text-danger')).toBe(
      'text-200 font-medium bg-danger-soft text-danger'
    );
    expect(cn('text-hero-800 leading-hero-800', 'text-success')).toContain(
      'text-hero-800'
    );
  });

  it('still lets a later size or color override an earlier one', () => {
    expect(cn('text-200', 'text-300')).toBe('text-300');
    expect(cn('text-danger', 'text-success')).toBe('text-success');
  });
});
