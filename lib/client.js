// OpenRouter Credit Display — client half (browser bundle).
//
// Loaded by the DSH web shell's client-module scan (see the dsh.client field
// in package.json). The widget fetches GET /plugins/openrouter-credit —
// served by this package's host half — and renders the usage in the
// conversation header utilities slot.
//
// Display semantics: when the key has a spending limit, shows
// "remaining / limit" colored by how much is left; when the key has no limit
// (limit is null in OpenRouter's response), shows "used $X". Today's usage
// shows inline as "· $X today" whenever OpenRouter reports it; the hover
// tooltip carries the full details.
window.__ModuleLoader__.load({
	id: "@vbcdx/dsh-openrouter-credit-plugin",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");

		// The Cordis client context, set by apply(). The React component
		// below reads the timer service from it (a component render has no
		// cordis context of its own).
		let pluginCtx = null;

		function CreditDisplay() {
			const [credit, setCredit] = React.useState(null)
			const [error, setError] = React.useState(null)
			const [loading, setLoading] = React.useState(true)
			const [lastUpdated, setLastUpdated] = React.useState(null)

			const fetchCredit = React.useCallback(async () => {
				try {
					setLoading(true)
					const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined
					const response = await fetch('/plugins/openrouter-credit', signal === undefined ? {} : { signal })
					const result = await response.json()
					if (result.error) {
						setError(result.error)
						setCredit(null)
					} else {
						setError(null)
						setCredit(result.credit)
					}
					setLastUpdated(result.timestamp ? new Date(result.timestamp) : null)
				} catch (err) {
					setError((err && err.message) || 'Request failed')
					setCredit(null)
				} finally {
					setLoading(false)
				}
			}, [])

			React.useEffect(() => { fetchCredit() }, [fetchCredit])

			// Regular refresh every 5 minutes.
			React.useEffect(() => {
				const dispose = pluginCtx.timer.interval(() => { fetchCredit() }, 5 * 60 * 1000)
				return dispose
			}, [fetchCredit])

			// While showing an error, retry every 30 seconds so transient
			// failures (e.g. right after a page load) self-heal quickly.
			React.useEffect(() => {
				if (!error) return
				const dispose = pluginCtx.timer.interval(() => { fetchCredit() }, 30 * 1000)
				return dispose
			}, [error, fetchCredit])

			const fmt = (v) => (v === null || v === undefined) ? 'N/A' : '$' + v.toFixed(2)

			if (loading && !credit && !error) {
				return React.createElement('div', {
					style: { padding: '4px 8px', fontSize: '12px', color: 'var(--dsw-alias-label-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }
				}, 'Loading credit…')
			}

			if (error) {
				return React.createElement('div', {
					style: {
						padding: '4px 8px',
						fontSize: '12px',
						color: 'var(--dsw-alias-state-error-primary)',
						display: 'flex',
						alignItems: 'center',
						gap: '4px',
						cursor: 'pointer'
					},
					onClick: fetchCredit,
					title: error + ' (click to retry)'
				}, '⚠️ Credit unavailable')
			}

			if (!credit) return null

			const hasLimit = credit.limit !== null && credit.limit !== undefined
			const remaining = (credit.limitRemaining !== null && credit.limitRemaining !== undefined)
				? credit.limitRemaining
				: (hasLimit ? (credit.limit - (credit.usage || 0)) : null)
			const hasDaily = credit.usageDaily !== null && credit.usageDaily !== undefined

			const lines = []
			lines.push('Total usage: ' + fmt(credit.usage))
			if (hasDaily) lines.push('Today: ' + fmt(credit.usageDaily))
			if (hasLimit) lines.push('Limit: ' + fmt(credit.limit))
			if (credit.isFreeTier) lines.push('Free tier key')
			if (credit.keyLabel) lines.push('Key: ' + credit.keyLabel)
			if (lastUpdated) lines.push('Updated ' + lastUpdated.toLocaleTimeString())
			const tooltip = lines.join('\n')

			const remainingColor = !hasLimit
				? 'var(--dsw-alias-label-primary)'
				: remaining > 5 ? 'var(--dsw-alias-state-success-primary)'
					: remaining > 0 ? 'var(--dsw-alias-state-warn-primary)'
						: 'var(--dsw-alias-state-error-primary)'

			return React.createElement('div', {
				style: {
					padding: '4px 8px',
					fontSize: '12px',
					display: 'flex',
					alignItems: 'center',
					gap: '6px',
					backgroundColor: 'var(--dsw-alias-bg-layer-2)',
					borderRadius: '4px',
					border: '1px solid var(--dsw-alias-border-l1)',
					cursor: 'default'
				},
				title: tooltip
			}, [
				React.createElement('span', {
					key: 'label',
					style: { color: 'var(--dsw-alias-label-secondary)' }
				}, 'OR'),
				hasLimit
					? React.createElement('span', {
							key: 'value',
							style: { fontWeight: 'bold', color: remainingColor }
						}, fmt(remaining) + ' / ' + fmt(credit.limit))
					: React.createElement('span', {
							key: 'value',
							style: { fontWeight: 'bold', color: 'var(--dsw-alias-label-primary)' }
						}, 'used ' + fmt(credit.usage)),
				hasDaily && React.createElement('span', {
					key: 'today',
					style: { color: 'var(--dsw-alias-label-secondary)' }
				}, '· ' + fmt(credit.usageDaily) + ' today'),
				React.createElement('button', {
					key: 'refresh',
					onClick: fetchCredit,
					style: {
						background: 'none',
						border: 'none',
						cursor: 'pointer',
						fontSize: '11px',
						color: 'var(--dsw-alias-label-secondary)',
						padding: '2px 4px',
						lineHeight: 1
					},
					title: 'Refresh now'
				}, '↻')
			])
		}

		const inject = ["slots", "timer"];

		function apply(ctx) {
			pluginCtx = ctx
			const slots = ctx.get('slots')
			if (!slots) {
				console.error('openrouter-credit: slots service unavailable')
				return
			}

			ctx.effect(() => {
				const disposeInject = slots.inject('conversation.session.header.utilities', () => {
					const disposeRegister = slots.register(
						{
							name: 'conversation.session.header.utilities',
							id: 'openrouter-credit',
							order: 10,
							label: 'OpenRouter Credit'
						},
						() => React.createElement(CreditDisplay)
					)
					return disposeRegister
				})
				return disposeInject
			})
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
