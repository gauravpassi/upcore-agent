// Minimal diagnostic server
const http = require('http');
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', port: PORT, env: process.env.NODE_ENV }));
});
// No host restriction — listen on all interfaces (IPv4 + IPv6)
server.listen(PORT, () => {
  console.log(`[diag] Server listening on port ${PORT}`);
  console.log(`[diag] PORT env var: ${process.env.PORT}`);
  console.log(`[diag] All env vars: ${JSON.stringify(Object.keys(process.env).filter(k => k.includes('PORT') || k.includes('RAIL')))}`);
});
