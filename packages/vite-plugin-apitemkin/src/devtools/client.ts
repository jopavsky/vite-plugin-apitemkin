// Browser-side entry for the apitemkin dev-tools overlay.
// Built as an IIFE bundle to dist/devtools.client.js and served by the plugin
// at GET /_apitemkin/devtools.js. Loaded via a <script type="module"> tag that
// the plugin injects into the host app's HTML during dev only.
//
// v1.2 chunk 1: stub. UI, discovery, and fetch interception arrive in
// chunks 3 and 4.
console.debug('[apitemkin] devtools client loaded');
