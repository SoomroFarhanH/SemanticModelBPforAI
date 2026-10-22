---
name: app-validation
description: >
  Run focused checks while implementing and one final static, browser, and
  persistence validation sequence before calling a Universal App complete.
---

# App Validation

Static checks and browser checks prove different things.
The build can succeed while a chart is empty, a number is scaled incorrectly, a date shifts by a day, or a saved row disappears after reload.

## Efficient cadence

During implementation, run the smallest check that covers the behavior you changed.
Examples include one utility spec, one query invocation, one pack validator, or one focused browser path.
Do not restart the full validation campaign after every edit.

At completion, run each applicable gate once and in this order:

1. `npm run typecheck`
2. `npm run build`
3. `npm run lint`
4. `npm test`
5. Pack validators such as `npm run validate:functions` and
   `npm run validate:visual`
6. Browser validation
7. Persistence create, reload, update, and delete checks for app-owned records

Pack validators can distinguish a failure from an incomplete static check.
When `validate:visual` reports `status: "incomplete"` and `ok: false`, inspect
its `coverage` field and counts.
If zero schemas were checked, run `npm run validate:visual:preview` only to
permit deployment for browser validation.
If some schemas were checked, the partial-coverage result already exits zero and
needs no preview flag.
Neither result is a completed visual-validation gate.
Missing or broken Vega-Lite/AJV tooling and actual spec errors report `failed`
and exit nonzero even through the preview script.
Complete the alternate browser route only after the final report records the
Fabric route or URL checked, the runtime-built charts exercised, whether their
loading states settled, and whether relevant console or render errors remained.
Do not infer browser validation from a successful build, deployment, or
validator exit code.

For a first deployment, run steps 1 through 5 before the remote write.
Use the preview escape hatch only when step 5 reports `incomplete` with zero
schemas checked, never for partial coverage or `failed`.
Deploy after the user confirms the target, then run steps 6 and 7 against the
Fabric URL produced by that deployment.
Pre-deploy runtime checks are useful only when the installed guide and current
environment already support a local or deployed app.
They do not replace validation of the newly deployed result.

`npm run build` uses `tsc -b --noCheck`.
It produces the deployable frontend quickly, but it does not prove type safety.
Keep `npm run typecheck` as a separate required gate.
Do not race typecheck and build because both use the TypeScript build outputs.

If a gate fails, fix the cause and rerun that gate.
Also rerun later gates only when the fix could invalidate their result.

## Where to validate the app

Validate the deployed app through the direct static-hosting URL emitted by the Rayfin CLI, in a fresh standalone browser session.
Also check the actual Fabric or external host when the app uses embedded capabilities.
Keep `assetAccess: protected` for the default deployment.
Signed-out users must not reach app content, including the welcome page, and authentication or configuration failures must remain gated.

Choose additional checks for the configured posture:

- A public site must show its signed-out Microsoft sign-in screen in a clean
  browser session, then establish an authenticated app session after sign-in.
- A protected site must restore or establish the current Fabric user's session
  without rendering authenticated content for a stale persisted identity.
- An embedded site must complete the current host handoff before trusting a
  persisted session.

Use the documented local path only when the installed guide and environment support it.
Do not replace a required deployed check with an HTML fetch or a successful build.
Local `autoLogin` intentionally skips the public signed-out screen, so it
cannot substitute for that deployed check.

## Browser checks

- Confirm every region renders and all loading states settle.
- Check the app's own console errors.
  Ignore unrelated portal noise.
- Trace one representative displayed value to its real source.
  For a semantic model, invoke the exact query file through the connector and explain any transformation between source and display.
- Check dates, currency, percentages, grids, and custom cards independently.
- Confirm keyboard access, visible focus, readable contrast, responsive layout, and reduced-motion behavior where animation exists.
- Exercise important interactions and verify permanent auth, permission, configuration, or query failures appear as errors rather than endless loading.
- Keep `AuthGate` in place for public and protected hosting. Public asset access
  does not weaken API, data, connector, or Functions authorization.

## Authentication checks

Run the paths applicable to the configured host posture:

1. Public standalone: start signed out, verify the sign-in screen, sign in, and
   confirm authenticated data loads.
2. Protected standalone: reload with a valid stored session and confirm it is
   restored; repeat with a stale session and confirm the current identity wins.
3. Fabric or external embed: load through the real host and confirm the handoff
   completes before authenticated content renders.
4. Local development: confirm `rayfin login` state can establish a session,
   stop or misconfigure the backend to verify an actionable failure, then
   restore it and confirm recovery without weakening the gate.

## Layout failures static checks miss

- A chart title renders while the chart body is empty.
- A chart container collapses because it has no definite height.
- Spacing tokens resolve to zero or an invalid class.
- Marks have insufficient contrast with their card background.
- Axis and data-label styling differs accidentally between neighboring charts.

## Specs

Write specs for utility functions, query factories, hooks, and components with logic worth protecting.
Use fixtures shaped like verified query or service results.
Do not add tests only to increase coverage.

## Persistence checks

Skip this section when the app reads existing data and owns no records.

For an app-owned entity:

1. Create a row that should pass the default filters.
2. Reload the page and confirm the row remains visible.
3. Update it and confirm the returned values render safely.
4. Delete it and confirm it stays deleted after reload.

The reload distinguishes a backend write from optimistic React state.
Static access-policy validation remains separate from this browser exercise.
