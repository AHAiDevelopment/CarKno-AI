export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { query } = req.body || {}
  if (!query || !query.trim()) return res.status(400).json({ error: 'Query is required' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set. Go to Vercel → your project → Settings → Environment Variables and add it.' })

  const systemPrompt = `You are CarKno AI, an expert automotive encyclopedia with deep knowledge of every car ever made — specs, pricing, history, production numbers, special editions, materials.

Return ONLY a raw JSON object. No markdown. No backticks. No explanation. Just the JSON object.

{
  "carName": "Full official name with year range e.g. Ferrari F40 (1987-1992)",
  "engine": "e.g. 2.9L Twin-Turbo V8",
  "hp": "e.g. 478 hp",
  "torque": "e.g. 577 Nm",
  "acceleration": "e.g. 3.8s",
  "topSpeed": "e.g. 324 km/h",
  "weight": "e.g. 1,100 kg",
  "totalProduced": "e.g. 1,311 units",
  "productionStart": "1987",
  "productionEnd": "1992",
  "stillInProduction": false,
  "productionProgressPercent": 100,
  "productionNarrative": "2-3 sentences about when and why production started, any milestones, and when and why it ended or continues.",
  "fuelType": "Petrol",
  "fuelCombined": "19.7 L/100km",
  "fuelCombinedMpg": "12 mpg",
  "fuelCity": "23.5 L/100km",
  "fuelHighway": "16.0 L/100km",
  "fuelCO2": "472 g/km",
  "tankSize": "78 L",
  "range": "~396 km",
  "pricing": [
    { "variant": "Early model high mileage", "mileage": "80,000 km", "priceUSD": 1000000 },
    { "variant": "Mid model average mileage", "mileage": "40,000 km", "priceUSD": 1400000 },
    { "variant": "Late model low mileage", "mileage": "10,000 km", "priceUSD": 1900000 },
    { "variant": "Current market average", "mileage": "Varies", "priceUSD": 1400000 }
  ],
  "specialModels": [
    { "name": "Edition name", "year": "1990", "units": "50 built", "description": "What makes it special" }
  ],
  "materials": [
    { "name": "Carbon Fibre", "usage": "Body panels and structural tub" },
    { "name": "Kevlar", "usage": "Mixed with carbon fibre for impact resistance" },
    { "name": "Steel Tubular Frame", "usage": "Main chassis structure" },
    { "name": "Aluminium", "usage": "Suspension components and engine internals" },
    { "name": "Leather", "usage": "Interior trim and steering wheel" },
    { "name": "Titanium", "usage": "Exhaust system and fasteners" },
    { "name": "Cast Iron", "usage": "Brake discs" },
    { "name": "Rubber", "usage": "Tyres and seals" },
    { "name": "Glass", "usage": "Windscreen and windows" },
    { "name": "Copper", "usage": "Wiring harness" },
    { "name": "Fibreglass", "usage": "Non-structural body panels" },
    { "name": "Foam", "usage": "Seat padding and sound insulation" }
  ],
  "fullReport": "4-5 sentences covering the car's engineering philosophy, what makes it significant, driving character, market position and legacy."
}

RULES:
- priceUSD must be a plain number with no currency symbols
- stillInProduction must be boolean true or false (not a string)
- pricing must have at least 4 rows
- materials must have at least 10 items
- Be accurate — use your real knowledge of this car
- Return ONLY the JSON object, nothing else at all`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `Give me complete and accurate data for this car: ${query.trim()}`
        }],
      }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      const errMsg = err?.error?.message || `API error ${response.status}`
      return res.status(response.status).json({ error: errMsg })
    }

    const data = await response.json()
    const text = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')

    return res.status(200).json({ text })

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' })
  }
}
