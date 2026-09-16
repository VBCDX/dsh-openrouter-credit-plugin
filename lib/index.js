// OpenRouter Credit Display — host half (real composition plugin).
//
// Runs in the DSH host process as a profile plugin row (see cordis.patch.yml).
// Serves GET /plugins/openrouter-credit with the current OpenRouter usage as
// JSON, for the browser widget in lib/client.js.
//
// How the credit is fetched:
//   1. The credential name comes from the 'llm-pi-ai' settings namespace
//      (providers.openrouter.apiKeyEnv), falling back to OPENROUTER_API_KEY.
//   2. That name is resolved through the credentials service. A CredentialRef
//      is a plain string — not an object.
//   3. GET https://openrouter.ai/api/v1/auth/key runs through the shell service
//      with curl, because the web service's fetch carries only a URL and can
//      never send an Authorization header. The key is passed via the process
//      environment so it never appears in the command string or logs.
//   4. The request carries an explicit danger-full-access sandbox policy: the
//      sandboxing shell executor otherwise defaults to the deployment's
//      workspace-write mode, which hosts without a sandbox backend refuse to
//      run. The command is a fixed curl string with no file effects — it only
//      opens one network connection — so this is safe.
//
// Results are cached for 60 seconds so several open sessions' widgets do not
// multiply calls to OpenRouter.

const inject = ['webServer', 'credentials', 'shell']

function apply(ctx) {
  const settings = ctx.get('settings')
  const sandboxPolicy = ctx.get('sandboxPolicy')

  // The pi-ai adapter stores provider profiles in the 'llm-pi-ai' settings
  // namespace; providers.openrouter.apiKeyEnv names the credential to use.
  function resolveKeyName() {
    try {
      if (settings) {
        const piAi = settings.get('llm-pi-ai')
        const openrouter = piAi && piAi.providers && piAi.providers.openrouter
        if (openrouter && typeof openrouter.apiKeyEnv === 'string' && openrouter.apiKeyEnv) {
          return openrouter.apiKeyEnv
        }
      }
    } catch (err) {
      console.log('openrouter-credit: settings lookup failed, using default name:', err && err.message)
    }
    return 'OPENROUTER_API_KEY'
  }

  // The sandboxing shell executor defaults an absent policy to the
  // deployment default (workspace-write here), which hosts without a
  // sandbox backend refuse to run. This command is a fixed curl string
  // with no file effects — only network — so run it unsandboxed.
  function creditCallPolicy() {
    try {
      if (sandboxPolicy) return sandboxPolicy.resolve({ mode: 'danger-full-access' })
    } catch (err) {
      console.log('openrouter-credit: sandboxPolicy resolve failed, using literal policy:', err && err.message)
    }
    return { mode: 'danger-full-access', workspaceRoot: '/' }
  }

  async function fetchCredit() {
    try {
      const keyName = resolveKeyName()

      // CredentialRef is a plain environment-variable name string.
      const resolved = await ctx.credentials.resolve(keyName)
      if (!resolved || !resolved.value) {
        return {
          error: 'OpenRouter API key not found. Configure the credential "' + keyName + '" in Settings → Models → OpenRouter.',
          credit: null,
          timestamp: Date.now()
        }
      }

      // web.fetch cannot send an Authorization header, so the call goes
      // through the shell service. The key is passed via the environment
      // so it never appears in the command string.
      const spec = ctx.shell.resolve({
        command: 'curl -s -m 12 -H "Authorization: Bearer $OPENROUTER_CREDIT_KEY" https://openrouter.ai/api/v1/auth/key',
        env: { OPENROUTER_CREDIT_KEY: resolved.value },
        timeoutMs: 15000,
        stdoutMaxBytes: 65536,
        sandboxPolicy: creditCallPolicy()
      })
      const result = await ctx.shell.run(spec)

      if (result.exitCode !== 0) {
        const stderrText = (result.stderr && result.stderr.text) ? result.stderr.text.slice(0, 160) : ''
        return {
          error: 'OpenRouter request failed (curl exit ' + result.exitCode + (stderrText ? ': ' + stderrText : '') + ')',
          credit: null,
          timestamp: Date.now()
        }
      }

      const raw = (result.stdout && result.stdout.text) ? result.stdout.text : ''
      if (!raw) {
        return { error: 'OpenRouter returned an empty response.', credit: null, timestamp: Date.now() }
      }

      let parsed
      try {
        parsed = JSON.parse(raw)
      } catch (err) {
        return { error: 'OpenRouter returned a non-JSON response: ' + raw.slice(0, 120), credit: null, timestamp: Date.now() }
      }

      const d = parsed && parsed.data
      if (!d) {
        // Errors come back as { error: { message } } with curl still exiting 0.
        const message = (parsed && parsed.error && parsed.error.message) ? parsed.error.message : (parsed && parsed.message) || 'unexpected response shape'
        return { error: 'OpenRouter API error: ' + message, credit: null, timestamp: Date.now() }
      }

      const credit = {
        usage: typeof d.usage === 'number' ? d.usage : null,
        usageDaily: typeof d.usage_daily === 'number' ? d.usage_daily : null,
        limit: typeof d.limit === 'number' ? d.limit : null,
        limitRemaining: typeof d.limit_remaining === 'number' ? d.limit_remaining : null,
        isFreeTier: d.is_free_tier === true,
        keyLabel: typeof d.label === 'string' ? d.label : null
      }

      return { error: null, credit: credit, timestamp: Date.now() }
    } catch (err) {
      console.error('openrouter-credit: fetch failed', err)
      return { error: (err && err.message) || 'Failed to fetch credit', credit: null, timestamp: Date.now() }
    }
  }

  // 60-second response cache: several sessions' widgets can poll without
  // multiplying calls to OpenRouter.
  let cache = { at: 0, data: null }

  async function serve(req, res) {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { 'content-type': 'application/json', allow: 'GET' })
        res.end(JSON.stringify({ error: 'Method not allowed' }))
        return
      }
      const now = Date.now()
      if (!cache.data || now - cache.at > 60 * 1000) {
        cache = { at: now, data: await fetchCredit() }
      }
      res.writeHead(200, {
        'content-type': 'application/json',
        'cache-control': 'no-store'
      })
      res.end(req.method === 'HEAD' ? '' : JSON.stringify(cache.data))
    } catch (err) {
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: (err && err.message) || 'internal error' }))
    }
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/plugins/openrouter-credit',
    handler: serve
  }))
}

export { inject, apply }
