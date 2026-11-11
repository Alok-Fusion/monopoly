/**
 * Vercel function: hands the game short-lived TURN relay details, so players on networks
 * that block direct connections can still reach each other.
 *
 * Set TURN_CREDENTIALS_URL in Vercel to your provider's credentials address. It holds a
 * secret key, which is why it lives here and not in the code sent to browsers.
 */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method not allowed' });
  }

  // Only the game's own pages may ask, so other websites and scripts can't spend the
  // relay allowance. Browsers always say where a request comes from.
  const site = req.headers['sec-fetch-site'];
  if (site !== 'same-origin') return res.status(403).json({ error: 'forbidden' });
  const origin = req.headers.origin || req.headers.referer;
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'forbidden' });
    } catch {
      return res.status(403).json({ error: 'forbidden' });
    }
  }

  const url = process.env.TURN_CREDENTIALS_URL;
  if (!url) return res.status(404).json({ error: 'relay not configured' });

  try {
    const upstream = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!upstream.ok) return res.status(502).json({ error: 'relay unavailable' });
    const servers = await upstream.json();
    if (!Array.isArray(servers)) return res.status(502).json({ error: 'relay unavailable' });
    // Pass on only well-formed relay entries
    const clean = servers
      .filter((s) => s && (typeof s.urls === 'string' || Array.isArray(s.urls)))
      .slice(0, 10)
      .map((s) => ({
        urls: s.urls,
        ...(typeof s.username === 'string' ? { username: s.username } : {}),
        ...(typeof s.credential === 'string' ? { credential: s.credential } : {}),
      }));
    return res.status(200).json(clean);
  } catch {
    return res.status(502).json({ error: 'relay unavailable' });
  }
}
