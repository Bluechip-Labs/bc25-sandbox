// Vercel serverless function: live basket prices (CoinGecko proxy).
// Keeps the API key server-side; CDN-cached. Returns {ok, prices} or {ok:false}
// so the frontend can fall back to illustrative data if the API is unavailable.
export default async function handler(req, res) {
  const ids = [
    "bitcoin", "ethereum", "solana",
    "ripple", "binancecoin", "cardano", "tron", "chainlink", "dogecoin",
    "usd-coin", "tether", "dai", "pax-gold",
  ];
  const key = process.env.COINGECKO_DEMO_API_KEY || "";
  const url =
    "https://api.coingecko.com/api/v3/simple/price?ids=" + ids.join(",") +
    "&vs_currencies=usd&include_24hr_change=true" +
    (key ? "&x_cg_demo_api_key=" + key : "");
  try {
    const r = await fetch(url, { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error("coingecko " + r.status);
    const prices = await r.json();
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    res.status(200).json({ ok: true, prices });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e) });
  }
}
