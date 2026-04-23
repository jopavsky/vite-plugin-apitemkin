const out = document.getElementById('app')!;

async function probe(label: string, url: string, init?: RequestInit): Promise<string> {
  try {
    const res = await fetch(url, init);
    const body = await res.text();
    return `# ${label}\n  ${init?.method ?? 'GET'} ${url}\n  ${res.status} ${res.statusText}\n  ${body}`;
  } catch (err) {
    return `# ${label}\n  ${init?.method ?? 'GET'} ${url}\n  ERROR: ${String(err)}`;
  }
}

const blocks = await Promise.all([
  probe('JSON list', '/api/users'),
  probe('Dynamic item (TS handler with params)', '/api/users/42'),
  probe('Whoami (TS handler reading method + headers)', '/api/whoami'),
  probe('Echo (TS handler echoing JSON body)', '/api/echo', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ hello: 'world' }),
  }),
  probe('Scenarios — default', '/api/orders'),
  probe('Scenarios — empty', '/api/orders?apitemkin_scenario=empty'),
  probe('Scenarios — error (500)', '/api/orders?apitemkin_scenario=error'),
  probe('Discovery — /_apitemkin/scenarios', '/_apitemkin/scenarios'),
]);

out.textContent = blocks.join('\n\n');
