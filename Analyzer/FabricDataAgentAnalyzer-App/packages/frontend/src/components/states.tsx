import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

/** Loading holds layout, empty invites, error is actionable. */

export function LoadingState({ rows = 3 }: { readonly rows?: number }) {
  return (
    <div
      className="space-y-200"
      role="status"
      aria-busy="true"
      aria-label="Loading"
    >
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="h-[72px] animate-pulse rounded-xl bg-muted motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  readonly title: string;
  readonly hint?: string;
  readonly action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-200 rounded-xl border border-dashed border-input px-600 py-800 text-center">
      <p className="text-400 font-semibold leading-400">{title}</p>
      {hint ? (
        <p className="max-w-sm text-300 leading-300 text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {action ? <div className="mt-200">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex items-start gap-300 rounded-xl border border-danger/40 bg-danger-soft px-400 py-300 text-danger"
    >
      <TriangleAlert aria-hidden="true" className="icon-size-300 mt-100 shrink-0" />
      <div className="min-w-0 flex-1 text-300 leading-300">
        <p className="font-semibold">That didn&apos;t work</p>
        <p className="mt-100 break-words">{message}</p>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-md px-200 py-100 text-200 font-medium underline underline-offset-2"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

/** Confirmation that names what is being deleted. */
export function ConfirmDelete({
  label,
  onConfirm,
  onCancel,
  pending,
}: {
  readonly label: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly pending?: boolean;
}) {
  return (
    <div
      role="alertdialog"
      aria-label={`Delete ${label}`}
      className="space-y-200 rounded-lg border border-danger/40 bg-danger-soft px-300 py-300 text-200 leading-200"
    >
      <p>
        Delete <strong>{label}</strong> and its findings? This can&apos;t be
        undone.
      </p>
      <div className="flex justify-end gap-200">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-md px-300 py-100 font-medium hover:bg-card disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className="rounded-md bg-destructive px-300 py-100 font-medium text-destructive-foreground disabled:opacity-50"
        >
          {pending ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  );
}
