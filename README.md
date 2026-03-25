# CarKno AI — Deploy to Vercel

## Files (at ROOT level in GitHub):
```
pages/api/identify.js   ← AI car identification from camera photo
pages/api/search.js     ← car data search  
pages/api/photos.js     ← Pexels + Wikimedia photos
pages/index.js          ← frontend
next.config.js
package.json
```

## Environment Variables in Vercel:
| Name | Required | Get it from |
|------|----------|-------------|
| ANTHROPIC_API_KEY | ✅ Yes | console.anthropic.com → API Keys |
| PEXELS_API_KEY | Optional | pexels.com/api (free, instant) |

## Deploy:
1. console.anthropic.com → API Keys → Create Key
2. github.com → New repo → carkno-ai → upload all files from INSIDE this zip
3. vercel.com → Add New Project → import → add ANTHROPIC_API_KEY env var → Deploy

## Camera Scanner Feature:
- App must be on HTTPS (Vercel deploys with HTTPS automatically)
- On mobile: tap "Scan a Car with Your Camera" → allow camera → live viewfinder opens
- Point at any car → tap the white circle button → AI identifies it
- Tap "Search Full Specs & Info" → full specs load automatically
- Flip camera button switches front/rear
- Gallery button lets you upload a photo from your phone instead
- Works on: Chrome Android, Safari iOS 14.3+, Firefox mobile, Samsung Internet
