import type { ReactNode } from 'react';

/**
 * The states every data-backed list has to handle, in one place.
 *
 * These exist because "it works" and "it works when the list is empty, the network is
 * down, or the user has no rows yet" are different bars, and the second one is what
 * ships. Each has a deliberate shape: empty is inviting, error is actionable, loading
 * holds layout instead of collapsing it.
 */

export function LoadingState({ rows = 3 }: { readonly rows?: number }) {
  return (
    <div
      className="space-y-2"
      role="status"
      aria-busy="true"
      aria-label="Loading"
    >
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="h-14 animate-pulse rounded-lg bg-black/5 dark:bg-white/10"
        />
      ))}
    </div>
  );
}

export interface EmptyStateProps {
  readonly title: string;
  /** One line on what this list is for, or how to add the first item. */
  readonly hint?: string;
  readonly action?: ReactNode;
}

export function EmptyState({ title, hint, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-black/15 px-6 py-12 text-center dark:border-white/20">
      <p className="text-base font-semibold">{title}</p>
      {hint ? <p className="max-w-sm text-sm opacity-70">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export interface ErrorStateProps {
  readonly message: string;
  readonly onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-red-400/60 bg-red-50 px-4 py-3 text-red-900 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-100"
    >
      <span aria-hidden="true" className="mt-0.5">
        ⚠️
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">That didn't work</p>
        <p className="mt-0.5 opacity-90">{message}</p>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded px-2 py-1 text-xs font-medium underline underline-offset-2"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

/**
 * Confirmation for an irreversible action.
 *
 * Deliberately requires the caller to name the thing being deleted: "Delete this
 * item?" is a prompt people click through without reading.
 */
export interface ConfirmDeleteProps {
  readonly label: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly pending?: boolean;
}

export function ConfirmDelete({
  label,
  onConfirm,
  onCancel,
  pending,
}: ConfirmDeleteProps) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={`Delete ${label}`}
      className="flex flex-wrap items-center gap-3 rounded-lg border border-red-400/60 bg-red-50 px-4 py-3 text-sm dark:border-red-500/40 dark:bg-red-950/40"
    >
      <span className="flex-1">
        Delete <strong>{label}</strong>? This can't be undone.
      </span>
      <button
        type="button"
        onClick={onCancel}
        disabled={pending}
        className="rounded px-3 py-1 font-medium disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={pending}
        className="rounded bg-red-600 px-3 py-1 font-medium text-white disabled:opacity-50"
      >
        {pending ? 'Deleting…' : 'Delete'}
      </button>
    </div>
  );
}
