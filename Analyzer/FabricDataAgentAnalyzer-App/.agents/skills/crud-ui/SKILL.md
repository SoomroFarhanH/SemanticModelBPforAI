---
name: crud-ui
description: >
  Use when a data-backed app needs a working interface — a list people can add to,
  edit, and delete from, with the states that make it feel finished. Pairs with
  data-modeling, which defines the entities; this covers the React side: optimistic
  updates, forms, loading / empty / error states, and delete confirmation. Triggers:
  CRUD, add edit delete, list, form, table, manage, tracker, admin screen, "let me
  add items", "I want to edit them", inline edit, optimistic.
---

# CRUD UI — a list people can actually use

`data-modeling` gives you entities and a typed client. This gives you the interface
over them, and the states that separate a demo from something usable.

**Prerequisites:** entities defined per `data-modeling`.
Keep the template's dynamic sign-in flow and app-wide auth gate intact, including outside the portal.

> **The client API is the package's, not this skill's.** For the query chain,
> mutations, filtering, `findById`, and relationship writes, read
> `node_modules/@microsoft/rayfin-guide/assets/docs/data/graphql.md`. For paging,
> cursors and text-field nullability, read
> `node_modules/@microsoft/rayfin-data/assets/docs/index.md`. Those move between
> releases; the React patterns below do not.

Copy the two files this skill ships into the app:

```text
.agents/skills/crud-ui/kit/components/useCrud.ts   ->  packages/frontend/src/components/useCrud.ts
.agents/skills/crud-ui/kit/components/states.tsx   ->  packages/frontend/src/components/states.tsx
```

## The shape

`useCrud` owns state and mutations; you own rendering. Give it four functions
bound to your entity and it returns items plus optimistic `create` / `update` /
`remove`. The four functions are ordinary client calls — see `data/graphql.md`
for their exact signatures.

```tsx
import { useCrud } from '@/components/useCrud';
import { LoadingState, EmptyState, ErrorState } from '@/components/states';
import { getRayfinClient } from '@/lib/rayfin-client';

interface Task { id: string; title: string; done: boolean }

export function TaskList() {
  const crud = useCrud<Task>({
    list: async () => (await getRayfinClient()).data.Task.select(['id', 'title', 'done']).execute(),
    create: async (input) => (await getRayfinClient()).data.Task.create(input),
    update: async (id, patch) => (await getRayfinClient()).data.Task.update({ id }, patch),
    remove: async (id) => { await (await getRayfinClient()).data.Task.delete({ id }); },
  });

  if (crud.status === 'loading') return <LoadingState />;
  if (crud.status === 'error')   return <ErrorState message={crud.error!} onRetry={crud.refresh} />;

  return (
    <div className="space-y-3">
      {crud.error ? <ErrorState message={crud.error} onRetry={crud.clearError} /> : null}

      <AddTaskForm
        onAdd={(title) => { void crud.create({ title, done: false }); }}
        disabled={crud.pending}
      />

      {crud.items.length === 0 ? (
        <EmptyState title="No tasks yet" hint="Add your first one above." />
      ) : (
        <ul className="space-y-2">
          {crud.items.map((task) => (
            <li key={task.id} className="flex items-center gap-3 rounded-lg border border-black/10 px-4 py-3 dark:border-white/15">
              <input
                type="checkbox"
                checked={task.done}
                onChange={(e) => crud.update(task.id, { done: e.target.checked })}
              />
              <span className={task.done ? 'flex-1 line-through opacity-60' : 'flex-1'}>{task.title}</span>
              <button type="button" onClick={() => crud.remove(task.id)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

### Why optimistic

A Fabric round-trip is slow enough that the naive version feels broken — you click
Add, nothing happens, then a row appears. `useCrud` applies the change locally first
and **rolls it back if the server rejects it**, surfacing the error. The UI tracks
intent without lying about the outcome.

Two details worth knowing: a created row gets a temporary `pending-…` id so React
keys stay stable until the real row arrives, and a failed delete restores the row **in
its original position**, not appended at the end.

### Mutation result contract

The kit merges the row returned by create or update into local state.
Treat that returned row as the service's authoritative representation, including normalized dates, rounded values, generated fields, and defaults.
Do not refetch only to compare every field with the submitted input, and do not turn a successful mutation into a failure because the readback differs.

`useCrud.create`, `useCrud.update`, and `useCrud.remove` catch operation errors, store the message in `crud.error`, roll back optimistic state where needed, and return `Promise<void>`.
Fulfillment of that wrapper promise is not proof that the save succeeded.
Use `crud.pending`, `crud.error`, and the rendered item state for kit-driven UI feedback.
When code calls a lower-level mutation directly, follow that operation's documented success and error contract instead of assuming that resolution or rejection means the same thing across APIs.

## Forms

Controlled inputs, validation before submit, and a disabled button while pending:

```tsx
function AddTaskForm({ onAdd, disabled }: { onAdd(title: string): void; disabled?: boolean }) {
  const [title, setTitle] = useState('');
  const trimmed = title.trim();

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (!trimmed) return; onAdd(trimmed); }}
      className="flex gap-2"
    >
      <label htmlFor="new-task" className="sr-only">Task</label>
      <input
        id="new-task"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a task"
        maxLength={200}
        className="flex-1 rounded-lg border border-black/15 px-3 py-2 dark:border-white/20"
      />
      <button type="submit" disabled={disabled || !trimmed} className="rounded-lg px-4 py-2 font-medium disabled:opacity-50">
        Add
      </button>
    </form>
  );
}
```

- **Match the entity's constraints.** `@text({ max: 200 })` in the schema means
  `maxLength={200}` here. Client validation that disagrees with the server produces
  errors the user can't act on.
- **Do not clear the field from an awaited `useCrud` wrapper alone.**
  Its `Promise<void>` fulfills after either success or internally handled failure.
  Keep the input on error, and clear it only from explicit success state or an operation contract that reports success directly.
- **Every input needs a label** — `sr-only` when the design has no room for one.

## Deleting

Use `ConfirmDelete` for anything irreversible. It requires you to name the item,
because "Delete this item?" is a prompt people click through without reading.

```tsx
{confirming === task.id ? (
  <ConfirmDelete
    label={task.title}
    pending={crud.pending}
    onCancel={() => setConfirming(null)}
    onConfirm={() => { crud.remove(task.id); setConfirming(null); }}
  />
) : (
  <button type="button" onClick={() => setConfirming(task.id)}>Delete</button>
)}
```

Skip confirmation only for genuinely cheap, reversible toggles.

## Per-user data

If each person should see only their own rows, this is **server-side** work, not a
filter in the UI. Add the `@role` policy per `data-modeling` § per-user data — the
decorator and policy DSL are documented in
`node_modules/@microsoft/rayfin-core/assets/docs/permissions.md` — and stamp the
owner column from the session on create:

```ts
const session = client.auth.getSession();
if (!session.isAuthenticated || !session.user) throw new Error('Not signed in.');
create: (input) => client.data.Task.create({ ...input, owner_id: session.user.id }),
```

The column name has to match the one the policy compares against — the
`data-modeling` pack seeds `owner_id`. Stamping a differently-named field leaves
the real one unset, and the policy then refuses every row.

**Never** filter by owner only in the client — the rows would still be fetchable.

## Seed data

Real-feeling content on first run makes an empty app legible. Seed **once, on
demand** — never on every mount, which duplicates rows on refresh:

```tsx
async function seedIfEmpty() {
  const existing = await client.data.Task.select(['id']).execute();
  if (existing.length > 0) return;
  for (const title of ['Read the brief', 'Draft the plan']) {
    await client.data.Task.create({
      title,
      done: false,
      owner_id: session.user.id,
    });
  }
}
```

Prefer wiring this to an explicit "Add sample tasks" button in the empty state, so it
is the user's choice and obviously distinct from real content. Seeded rows are real
rows in their database — if they are invented *figures* rather than starter content,
label them visibly in the UI as sample data, per the Critical Rules in `AGENTS.md`.

## Rendering a row safely

Treat every value crossing into JSX as untrusted display input.
A row written before a field existed may return `null` or `undefined`.
A date can arrive as a `Date`, and objects or arrays are never valid React text without an app-specific conversion.
Do not interpolate a raw `Date`, object, or array.

(Optional vs. required text nullability is a package behaviour — see
`node_modules/@microsoft/rayfin-data/assets/docs/index.md`. The render-time
hazard below is React's, and is this skill's to state.)

```tsx
// Both can throw or render invalid React children.
if (task.description.startsWith('Starter task')) {
  // ...
}
return <span>{task.metadata}</span>;
```

Guard optional reads and convert known values to strings.
Date-only values need an explicit UTC formatter so a value such as `2026-10-15` cannot display as the previous day west of UTC:

```tsx
const dateOnlyFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeZone: 'UTC',
});

function formatDateOnly(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return 'Not set';
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime())
    ? 'Not set'
    : dateOnlyFormatter.format(parsed);
}
```

For arrays, map the intended fields to strings.
For objects, render selected properties or an app-specific summary instead of relying on implicit conversion or dumping raw JSON.
Format numbers explicitly for their units and provide a fallback for missing or invalid values.

## Keep saved rows visible

A created or updated row should render from its own returned fields.
Do not gate its title, date, status, or other saved values on unrelated live-source readiness.

Choose a default filter that includes a just-created row, or explain clearly why the active filter excludes it.
For date-only filters, compare normalized date strings or use UTC fields.
Do not parse a date-only value into local time before deciding whether it belongs in a month or day.

The optimistic row must be replaced by the returned row, which the kit already does.
Do not add a field-by-field readback assertion that can reinterpret rounding, normalized dates, or service defaults as a failed save.

## Checklist

- [ ] Loading, empty, and error states all render — not just the happy path
- [ ] Mutations are optimistic and roll back visibly on failure
- [ ] Submit disabled while pending; success UI follows the actual operation or hook state contract
- [ ] Input limits match the entity's `@text({ max })`
- [ ] Every input has a label
- [ ] Destructive actions confirm, and name the thing
- [ ] Per-user data enforced by a `@role` policy, not a client filter
- [ ] Seeding is idempotent and user-initiated
- [ ] Optional fields and non-primitive JSX values are normalized before rendering
- [ ] Date-only display and filtering cannot shift with the browser timezone
- [ ] Default filters include a newly created row
- [ ] Saved fields do not depend on unrelated live-source state
