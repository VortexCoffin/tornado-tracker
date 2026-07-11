/** Minimal function to verify serverless deploy (no backend imports). */
export default function handler(req, res) {
  const body = JSON.stringify({
    ok: true,
    service: "Canada Tornado Tracker",
    ts: new Date().toISOString(),
  });
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}
