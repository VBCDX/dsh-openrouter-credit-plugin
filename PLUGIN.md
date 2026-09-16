# OpenRouter Credit Plugin — package notes

This repo is a real DSH composition plugin package (not a dynamic plugin):

- The host half (`lib/index.js`) is an ES module exporting `inject` and
  `apply`, loaded as a composition plugin row.
- The browser half (`lib/client.js`) is a `window.__ModuleLoader__.load`
  bundle exporting `apply` + `inject`, discovered through the `dsh.client`
  field in `package.json`.
- `cordis.patch.yml` (referenced by `dsh.bundle`) inserts the plugin row into
  the Web profile composition.

## Installing / updating

```sh
dsh plugin --profile <profile> add <path-or-git-url>
```

Updates: pull the newest code, then run `pnpm update` (or `dsh plugin
--profile <profile> update @vbcdx/dsh-openrouter-credit-plugin`) in
`${DSH_HOME:-~/.dsh}/profiles/<profile>`, and restart the harness. When
installed from a local path, pnpm links the directory, so a `git pull` alone
refreshes the code — the restart is what reloads it.

## Uninstall

```sh
dsh plugin --profile <profile> remove @vbcdx/dsh-openrouter-credit-plugin
```

## Notes

- The OpenRouter API key is never written to disk by this plugin; it is read
  from the DSH credential store per request and passed to `curl` through the
  process environment.
- `web.fetch` cannot be used for the OpenRouter call: its request type
  carries only a URL, so the `Authorization` header must go through
  `shell` + `curl`.
- If the key has no spending limit, OpenRouter reports `limit: null`; the
  widget then shows usage instead of a remaining amount.
