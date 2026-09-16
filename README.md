# @vbcdx/dsh-openrouter-credit-plugin

A DeepSeek Harness (DSH) composition plugin that displays your current
OpenRouter credit usage in the conversation header — and survives restarts,
because it is installed into the profile composition instead of being a
per-session dynamic plugin.

## What the widget shows

- No spending limit on the key: `OR used $33.00 · $9.81 today`
- With a limit: `OR $16.66 / $50.00 · $9.81 today`, colored by how much is left
- Hover for details (total, today, key label, update time); ↻ refreshes now
- Auto-refresh every 5 minutes; while showing an error it retries every 30
  seconds, and clicking the error state retries immediately

## Install

From git (the supported install command):

```sh
dsh plugin --profile <profile> add git+https://<your-git-host>/<org>/dsh-openrouter-credit-plugin.git
```

or from a local checkout:

```sh
dsh plugin --profile <profile> add /path/to/this/repo
```

`dsh plugin add` installs the package and, because the package declares
`dsh.bundle`, appends it to the profile's layer stack automatically. Then
restart the harness; the composition loads at boot.

From npm (once published):

```sh
dsh plugin --profile <profile> add @vbcdx/dsh-openrouter-credit-plugin
```

## Configuration

See [.env.example](.env.example). In short: the preferred way is to set the
key in DSH (Settings → Models → OpenRouter); the documented env-var name
`OPENROUTER_API_KEY` is the fallback credential name the plugin resolves
when the models settings declare none. No real credentials are stored in
this repository.

## How it works

- **`lib/index.js` (host half)** — serves `GET /plugins/openrouter-credit`:
  1. Reads the credential name from the `llm-pi-ai` settings namespace
     (`providers.openrouter.apiKeyEnv`), falling back to `OPENROUTER_API_KEY`.
  2. Resolves that name through the `credentials` service. A `CredentialRef`
     is a **plain string** — not an object.
  3. Calls `GET https://openrouter.ai/api/v1/auth/key` through the `shell`
     service with `curl`, because DSH's `web.fetch` carries only a URL and
     can never send an `Authorization` header. The key is passed via the
     process environment so it never appears in the command string or logs.
  4. The request carries an explicit `danger-full-access` sandbox policy —
     the sandboxing executor otherwise defaults to the deployment's
     workspace-write mode, which hosts without a sandbox backend refuse to
     run. The command is a fixed curl string with no file effects, so this
     is safe.
  5. Responses are cached for 60 seconds, so several sessions' widgets do not
     multiply calls to OpenRouter.
- **`lib/client.js` (browser half)** — found through the `dsh.client` field
  in `package.json`. A small React widget (no JSX) registered in the
  `conversation.session.header.utilities` slot; it fetches the endpoint and
  renders the result with DSW theme tokens.
- **`cordis.patch.yml`** — the composition patch inserting the plugin row.
  Declared through `dsh.bundle` in `package.json`, so `dsh plugin add`
  recognizes the package as a profile layer.

## Updating / uninstalling

See [PLUGIN.md](PLUGIN.md).

## License

MIT
