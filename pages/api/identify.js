// pages/api/identify.js
// Receives a base64 JPEG from the camera, sends to Claude vision,
// returns identified car make/model/year/variant as JSON.

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { imageBase64 } = req.body;
  if (!imageBase64) return res.status(400).json({ error: 'No image provided' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured in Vercel.' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: `You are an expert car identification AI. Study every detail of this photo carefully — body shape, grille, headlights, badges, vents, wheels, roofline, proportions.

Return ONLY a raw JSON object, nothing else:
{
  "identified": true,
  "make": "e.g. Ferrari",
  "model": "e.g. F40",
  "year": "e.g. 1990 or range 1987-1992",
  "variant": "e.g. LM, GTS, Competition — or null",
  "fullName": "e.g. Ferrari F40 (1987-1992)",
  "bodyStyle": "e.g. Coupe, Sedan, SUV, Convertible",
  "colour": "e.g. Rosso Corsa Red",
  "confidence": "high",
  "notACar": false,
  "notes": "Any notable visible features, trim details, or modifications"
}

If confidence is not high, still give your best estimate but set confidence to medium or low.
If the image has no car at all, set notACar true and identified false.
Return ONLY the JSON.`,
            },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const e = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: e?.error?.message || `API error ${response.status}` });
    }

    const data = await response.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');

    let result = null;
    const m = text.match(/\{[\s\S]*\}/);
    if (m) { try { result = JSON.parse(m[0]); } catch (e) {} }
    if (!result) { try { result = JSON.parse(text.trim()); } catch (e) {} }

    if (!result) return res.status(200).json({ identified: false, error: 'Could not parse result' });

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
