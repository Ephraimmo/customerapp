/*
 * Standalone HTML for catastrophic SSR failures. It cannot import the React
 * logo component or the stylesheet, so the mark and the brand colours are
 * inlined here — keep them in step with src/components/app/logo.tsx.
 */
const FLAME =
  '<svg viewBox="0 0 32 32" width="40" height="40" aria-hidden="true">' +
  '<rect width="32" height="32" rx="7" fill="#fb4500"/>' +
  '<g transform="translate(16 16) scale(0.78) translate(-16 -16)">' +
  '<path fill="#fcfaf7" fill-rule="evenodd" d="M16 4C20.5 10 25 13.5 25 19A9 9 0 0 1 7 19C7 13.5 11.5 10 16 4ZM16 13C18 16 20 17.8 20 20.5A4 4 0 0 1 12 20.5C12 17.8 14 16 16 13Z"/>' +
  "</g></svg>";

export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>This page didn't load — Kasi Zonke Link</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <style>
      body { font: 15px/1.5 Inter, ui-sans-serif, system-ui, -apple-system, sans-serif; background: #fcfaf7; color: #1c1917; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; -webkit-font-smoothing: antialiased; }
      .card { max-width: 26rem; width: 100%; text-align: center; padding: 2rem; }
      .brand { display: flex; align-items: center; justify-content: center; gap: 0.625rem; margin: 0 0 1.75rem; }
      .brand span { font-size: 1.125rem; font-weight: 900; letter-spacing: -0.02em; }
      h1 { font-size: 1.25rem; font-weight: 900; letter-spacing: -0.02em; margin: 0 0 0.5rem; }
      p { color: #6b6460; margin: 0 0 1.5rem; font-size: 0.875rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.75rem 1.25rem; border-radius: 0.75rem; font: inherit; font-size: 0.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #fb4500; color: #fff; }
      .secondary { background: #f0eae1; color: #1c1917; border-color: rgba(28,25,23,0.09); }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="brand">${FLAME}<span>Kasi Zonke Link</span></div>
      <h1>This page didn't load</h1>
      <p>Something went wrong on our end. You can try refreshing or head back home.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a class="secondary" href="/">Go home</a>
      </div>
    </div>
  </body>
</html>`;
}
