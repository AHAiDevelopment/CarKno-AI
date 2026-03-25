export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { query } = req.body;
  if (!query?.trim()) return res.status(400).json({ error: 'Query required' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set.' });

  const SYSTEM = `You are CarKno AI. Search auto-data.net, ultimatespecs.com, encycarpedia.com, zeroto60times.com, autoscout24.com, bilbasen.dk, mobile.de, Edmunds, Hagerty.
Return ONLY raw JSON — no markdown, no backticks:
{"carName":"Full name + year range","engine":"e.g. 2.9L Twin-Turbo V8","hp":"e.g. 478 hp","torque":"e.g. 577 Nm","acceleration":"e.g. 3.8s","topSpeed":"e.g. 324 km/h","weight":"e.g. 1,100 kg","totalProduced":"e.g. 1,311 units","productionStart":"1987","productionEnd":"1992","stillInProduction":false,"productionProgressPercent":100,"productionNarrative":"2-3 sentences.","fuel":{"type":"Petrol","combined":"19.7 L/100km","combinedMpg":"12 mpg","city":"23.5 L/100km","cityMpg":"10 mpg","highway":"16.0 L/100km","highwayMpg":"15 mpg","co2":"472 g/km","tankSize":"78 L","range":"~396 km"},"pricing":[{"variant":"Early model","mileage":"60,000 km","priceUSD":1200000},{"variant":"Mid model","mileage":"30,000 km","priceUSD":1600000},{"variant":"Late model","mileage":"10,000 km","priceUSD":2100000},{"variant":"Current Market","mileage":"Varies","priceUSD":1500000}],"specialModels":[{"name":"Name","year":"year","units":"X built","description":"desc"}],"materials":[{"name":"Material","usage":"usage"}],"fullReport":"4-5 sentence summary."}
Rules: priceUSD=plain number, stillInProduction=boolean, pricing min 4 rows, materials min 12, ONLY JSON`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'web-search-2025-03-05' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 4000, system: SYSTEM, tools: [{ type: 'web_search_20250305', name: 'web_search' }], messages: [{ role: 'user', content: `Find accurate data from auto-data.net, ultimatespecs.com, zeroto60times.com, autoscout24.com, bilbasen.dk, mobile.de about: ${query.trim()}. Return JSON.` }] })
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); return res.status(r.status).json({ error: e?.error?.message || `Error ${r.status}` }); }
    const data = await r.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
