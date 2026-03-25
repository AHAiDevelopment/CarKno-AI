export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const { q } = req.query;
  if (!q?.trim()) return res.status(400).json({ photos: [] });
  const carQuery = q.trim();
  const photos = [];
  const pexelsKey = process.env.PEXELS_API_KEY;

  if (pexelsKey) {
    try {
      for (const query of [`${carQuery}`, `${carQuery} car`, `${carQuery} automobile`]) {
        const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=4&orientation=landscape`, { headers: { Authorization: pexelsKey } });
        if (r.ok) {
          const d = await r.json();
          for (const p of (d.photos || [])) {
            if (!photos.some(x => x.url === p.src.large))
              photos.push({ url: p.src.large, thumb: p.src.medium, source: 'Pexels', credit: p.photographer, creditUrl: p.photographer_url, alt: p.alt || carQuery });
          }
        }
      }
    } catch (e) { console.error('Pexels:', e.message); }
  }

  try {
    const sr = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(carQuery + ' car')}&srnamespace=6&format=json&srlimit=10&origin=*`);
    if (sr.ok) {
      const sd = await sr.json();
      for (const result of (sd.query?.search || []).slice(0, 8)) {
        try {
          const ir = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(result.title)}&prop=imageinfo&iiprop=url|thumburl|extmetadata|size&iiurlwidth=1200&format=json&origin=*`);
          if (!ir.ok) continue;
          const id = await ir.json();
          const page = Object.values(id.query?.pages || {})[0];
          const info = page?.imageinfo?.[0];
          if (!info?.url) continue;
          const ext = info.url.split('.').pop().toLowerCase().split('?')[0];
          if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) continue;
          if (info.width && info.width < 400) continue;
          const credit = (info.extmetadata?.Artist?.value || '').replace(/<[^>]+>/g, '').trim().slice(0, 80) || 'Wikimedia';
          const displayUrl = info.thumburl || info.url;
          if (!photos.some(x => x.url === displayUrl))
            photos.push({ url: displayUrl, thumb: info.thumburl || info.url, source: 'Wikimedia Commons', credit, creditUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(result.title)}`, alt: result.title.replace('File:', '').replace(/\.[^.]+$/, '') });
        } catch (e) {}
      }
    }
  } catch (e) { console.error('Wikimedia:', e.message); }

  return res.status(200).json({
    photos: photos.slice(0, 16),
    istockUrl: `https://www.istockphoto.com/search/2/image?phrase=${encodeURIComponent(carQuery + ' car')}`,
    unsplashUrl: `https://unsplash.com/s/photos/${encodeURIComponent(carQuery + '-car')}`,
  });
}
