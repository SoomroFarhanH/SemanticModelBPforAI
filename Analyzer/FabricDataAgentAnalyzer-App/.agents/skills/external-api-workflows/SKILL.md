---
name: external-api-workflows
description: >
  Build a Universal App workflow that calls a third-party API or custom model
  endpoint through a server-side function.
  Use for API keys, webhooks, Azure OpenAI-compatible endpoints, payment,
  messaging, or any provider credential that must stay out of the browser.
---

# External API workflows

Use a Rayfin function as the trust boundary between the UI and the external
provider.
Read `functions-capability` and apply its pack before implementing this
workflow.

## Secret contract

Declare only the secret name and a non-sensitive description in
`rayfin/rayfin.yml`.
Never put the value in YAML:

```yaml
secrets:
  - name: THIRD_PARTY_API_KEY
    description: Credential used by the server-side fulfillment request.
```

Deploy the app once before provisioning the value. Obtain the user's
confirmation for the target workspace and remote deployment.
Read `app-deployment` and complete its version-matched Rayfin CLI workflow.
The current secret command requires a deployed AppBackend endpoint.

Then ask the user to run:

```sh
npx rayfin secret set THIRD_PARTY_API_KEY
```

This command requires an interactive terminal for its masked prompt.
If the host can spawn an independent interactive terminal, open it at the app
root and start this command there so the masked prompt is immediately waiting.
Do not claim that a terminal was opened unless the launch succeeded.
Otherwise, pause and tell the user where to run the exact command.
Do not pass the value through a non-interactive shell tool.
The user enters the value directly into that command's masked prompt.
Do not ask the user to paste a secret into chat.
Do not place the value in source, YAML, frontend environment variables,
command arguments, logs, or function output.
Wait for the user to confirm that provisioning completed before invoking the
deployed workflow.

After the value is provisioned, open the deployed `fabricUrl` and have the user
invoke the workflow in the authenticated UI.
Confirm that the UI receives only the bounded result contract.
Do not report the workflow complete before this deployed invocation succeeds
unless the user explicitly defers runtime validation.

Retrieve the production value only inside the function. The secret is declared
with `rayfin secret set`, so it is typed — read it as a property:

```ts
const apiKey: string = ctx.Secrets.THIRD_PARTY_API_KEY;
```

`ctx.Secrets.<NAME>` is typed `string`, not `string | undefined`: declaring the
secret is what makes it expected, and a name that was never declared is a
compile error. If the value was not supplied at invoke time the read throws a
diagnosable error rather than silently yielding `undefined`, so no
`SECRET_NOT_CONFIGURED` branch is needed. Catch it at the function boundary if
you want to map it onto the bounded result contract:

```ts
try {
  const apiKey: string = ctx.Secrets.THIRD_PARTY_API_KEY;
  // ...call the external service...
} catch {
  return {
    ok: false,
    code: 'SECRET_NOT_CONFIGURED',
    message: 'The external service credential is not configured.',
  };
}
```

Never hard-code the secret name anywhere else — it comes from `rayfin.yml` via
the generated registry. `ctx.getSecret('NAME')` is deprecated and flagged by
`@typescript-eslint/no-deprecated`; it remains valid only for a value
deliberately not modelled in `rayfin.yml`.

Do not return `apiKey`, compare it against browser input, or include it in an
exception.
An environment fallback may be used only for local debugging through the
functions project's ignored local settings.

## Provider boundary

- Do not call generic cloud or provider best-practices tools for a
  provider-neutral request. Use a provider-specific tool only after the user
  identifies that provider and the tool is needed to establish its contract.
- Validate and bound every browser-supplied value before making a request.
- Set an explicit outbound deadline appropriate for the provider.
- Send only required headers and fields.
- Treat non-success provider responses as expected domain outcomes when the UI
  can act on them.
- Do not return raw provider bodies or stack traces.
- Select and bound the provider fields returned to the browser.
- Do not log the request body, response body, authorization header, secret,
  prompt, or user content.

Use a bounded result rather than exposing provider data directly:

```ts
type ExternalCallResult =
  | { ok: true; value: string }
  | {
      ok: false;
      code:
        | 'SECRET_NOT_CONFIGURED'
        | 'AUTHENTICATION_FAILED'
        | 'PROVIDER_REJECTED'
        | 'PROVIDER_TIMEOUT';
      message: string;
    };
```

Expected provider failures use the safe result.
Unexpected failures may still throw, but the thrown message must not contain a
secret, request body, raw provider response, or sensitive exception detail.

## UI contract

Show an in-progress state for the complete invocation.
Render safe, actionable outcomes for missing configuration, invalid
authentication, provider rejection, and timeout.
Keep an unexpected-failure state for failures outside the known domain result.

If the provider can take longer than the browser client's configured deadline,
do not increase the global timeout for unrelated app operations.
Use a dedicated client only as a documented temporary workaround until the SDK
supports a per-invocation timeout.
