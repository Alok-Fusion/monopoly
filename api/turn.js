/**
 * Vercel function: hands the game short-lived TURN relay details, so players on networks
 * that block direct connections can still reach each other.
 *
 * Set TURN_CREDENTIALS_URL in Vercel to your provider's credentials address. It holds a
 * secret key, which is why it lives here and not in the code sent to browsers.
 */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  // Other websites can't spend this game's relay allowance
  const site = req.headers['sec-fetch-site'];
  if (site === 'cross-site' || site === 'same-site') return res.status(403).json({ error: 'forbidden' });

  const url = process.env.TURN_CREDENTIALS_URL;
  if (!url) return res.status(404).json({ error: 'relay not configured' });

  try {
    const upstream = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!upstream.ok) return res.status(502).json({ error: 'relay unavailable' });
    const servers = await upstream.json();
    if (!Array.isArray(servers)) return res.status(502).json({ error: 'relay unavailable' });
    return res.status(200).json(servers);
  } catch {
    return res.status(502).json({ error: 'relay unavailable' });
  }
}
