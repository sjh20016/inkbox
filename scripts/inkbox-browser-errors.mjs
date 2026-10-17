// CDP exceptions and Log errors do not include Runtime console.error events.
// Player acceptance must reject either kind of browser error.
export function collectBrowserErrors(session) {
  const consoleErrors = (session?.cdp?.events || [])
    .filter(event => event.method === 'Runtime.consoleAPICalled' && event.params?.type === 'error')
    .map(event => ({ type: 'console.error', timestamp: event.params.timestamp,
      text: event.params.args?.map(arg => String(arg.description ?? arg.value ?? arg.type)).join(' ') || 'console.error()' }));
  return [...(session?.errors() || []), ...consoleErrors];
}
