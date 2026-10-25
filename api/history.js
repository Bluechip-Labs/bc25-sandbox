// Vercel serverless function: historical daily prices for the Time Machine.
// Returns {ok, days, series:{coin:[prices...]}} or {ok:false} for frontend fallback.
// Cached 1h at the CDN. Stables are treated as flat $1 by the frontend (not fetched).
export default async function handler(req, res) {
  const days = Math.min(365, parseInt((req.query && req.query.days) || "365", 10) || 365);
  const coins = [
    "bitcoin", "ethereum", "solana",
    "ripple", "binancecoin", "cardano", "tron", "chainlink", "dogecoin",
    "pax-gold",
  ];
  const key = process.env.COINGECKO_DEMO_API_KEY || "";
  try {
    const series = {};
    for (const c of coins) {
      const url =
        "https://api.coingecko.com/api/v3/coins/" + c +
        "/market_chart?vs_currency=usd&days=" + days + "&interval=daily" +
        (key ? "&x_cg_demo_api_key=" + key : "");
      const r = await fetch(url, { headers: { accept: "application/json" } });
      if (!r.ok) throw new Error(c + " " + r.status);
      const d = await r.json();
      series[c] = (d.prices || []).map((p) => p[1]);
      await new Promise((s) => setTimeout(s, 250)); // gentle on the rate limit
    }
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
    res.status(200).json({ ok: true, days, series });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e) });
  }
}
