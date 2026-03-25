// pages/index.js — CarKno AI with live in-app camera car scanner
import { useState, useCallback, useRef, useEffect } from 'react';
import Head from 'next/head';

// ── Data ─────────────────────────────────────────────────────────────────────
const CUR = {
  USD:{s:"$",n:"US Dollar",r:1},EUR:{s:"€",n:"Euro",r:0.92},GBP:{s:"£",n:"British Pound",r:0.79},
  DKK:{s:"kr",n:"Danish Krone",r:6.89},NOK:{s:"kr",n:"Norwegian Krone",r:10.55},SEK:{s:"kr",n:"Swedish Krona",r:10.42},
  CHF:{s:"Fr",n:"Swiss Franc",r:0.90},JPY:{s:"¥",n:"Japanese Yen",r:149.5},AUD:{s:"A$",n:"AUD",r:1.53},CAD:{s:"C$",n:"CAD",r:1.36},
};
const LANGS = {
  en:{flag:"🇬🇧",name:"English"},
  da:{flag:"🇩🇰",name:"Dansk"},
  de:{flag:"🇩🇪",name:"Deutsch"},
  fr:{flag:"🇫🇷",name:"Français"},
  no:{flag:"🇳🇴",name:"Norsk"},
  sv:{flag:"🇸🇪",name:"Svenska"},
  es:{flag:"🇪🇸",name:"Español"},
};
const CHIPS = ["Ferrari F40","Porsche 911 GT3 RS","McLaren P1","BMW M3 E46","Lamborghini Aventador SVJ","Nissan GT-R R35","Toyota GR Yaris","Audi RS6 Avant"];
const STEPS = ["auto-data.net / ultimatespecs.com...","zeroto60times.com / encycarpedia.com...","autoscout24.com pricing...","bilbasen.dk / mobile.de pricing...","Compiling full report..."];

function fmtP(usd, cur) { if (!usd && usd !== 0) return "—"; return CUR[cur].s + Math.round(Number(usd) * CUR[cur].r).toLocaleString(); }
function fuelCls(t = "") { const v = t.toLowerCase(); return v.includes("diesel") ? "fd" : v.includes("electric") ? "fe" : v.includes("hybrid") ? "fh" : "fp"; }
function extractJSON(text) {
  if (!text) return null; let r = null;
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { r = JSON.parse(m[0]); } catch (e) {} }
  if (!r) { try { r = JSON.parse(text.replace(/```[a-z]*/g, "").replace(/```/g, "").trim()); } catch (e) {} }
  if (!r) { const s = text.indexOf("{"), e = text.lastIndexOf("}"); if (s > -1 && e > s) { try { r = JSON.parse(text.slice(s, e + 1)); } catch (e2) {} } }
  return r;
}

// Resize + compress image to JPEG base64, max 1200px
function compressToBase64(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const MAX = 1200;
      let w = img.width, h = img.height;
      if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CAMERA SCANNER COMPONENT
// Full-screen live camera with a car silhouette targeting overlay.
// Uses getUserMedia for live preview. Falls back to file input on browsers
// that block getUserMedia (e.g. iOS Safari on non-HTTPS, old Android).
// ─────────────────────────────────────────────────────────────────────────────
function CameraScanner({ onResult, onClose }) {
  const videoRef       = useRef(null);
  const canvasRef      = useRef(null);
  const streamRef      = useRef(null);
  const fileInputRef   = useRef(null);

  const [mode, setMode]           = useState('loading'); // loading | live | preview | identifying | result | error | fallback
  const [previewSrc, setPreview]  = useState(null);
  const [capturedB64, setCaptured] = useState(null);
  const [result, setResult]       = useState(null);
  const [camError, setCamError]   = useState('');
  const [facingMode, setFacing]   = useState('environment'); // environment = rear camera
  const [flash, setFlash]         = useState(false);

  // Start the camera stream
  const startCamera = useCallback(async (facing = 'environment') => {
    setMode('loading');
    setCamError('');
    // Stop any existing stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setMode('live');
    } catch (err) {
      console.error('Camera error:', err);
      // If camera access is denied or unavailable, fall back to file picker
      setMode('fallback');
      setCamError(err.name === 'NotAllowedError'
        ? 'Camera access was denied. Please allow camera access in your browser settings, or use the upload option below.'
        : 'Camera not available on this device. Use the upload option below.');
    }
  }, []);

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      // Clean up stream when component unmounts
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  // Capture a frame from the video feed
  const capture = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    // Shutter flash effect
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
    // Get JPEG base64 from canvas
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    const b64 = dataUrl.split(',')[1];
    setCaptured(b64);
    setPreview(dataUrl);
    // Stop live stream — we have our photo
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    setMode('preview');
  }, []);

  // Handle file picked from gallery / file picker fallback
  const handleFile = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const b64 = await compressToBase64(file);
      setCaptured(b64);
      setPreview(URL.createObjectURL(file));
      setMode('preview');
    } catch (e) {
      setCamError('Could not read this image file.');
    }
  }, []);

  // Send captured photo to AI for identification
  const identify = useCallback(async () => {
    if (!capturedB64) return;
    setMode('identifying');
    try {
      const res = await fetch('/api/identify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ imageBase64: capturedB64 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
      setResult(json);
      setMode('result');
    } catch (err) {
      setCamError(err.message);
      setMode('error');
    }
  }, [capturedB64]);

  // Retake — restart the camera
  const retake = useCallback(() => {
    setResult(null); setCaptured(null); setPreview(null); setCamError('');
    if (mode === 'fallback' || mode === 'error') { setMode('fallback'); }
    else { startCamera(facingMode); }
  }, [mode, facingMode, startCamera]);

  // Flip between front and rear camera
  const flipCamera = useCallback(() => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacing(next);
    startCamera(next);
  }, [facingMode, startCamera]);

  const confColor = result?.confidence === 'high' ? '#00e676' : result?.confidence === 'medium' ? '#ffb300' : '#ff6b00';

  return (
    <div className="scanner-overlay">
      {/* Hidden canvas for capturing frames */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* ── LIVE CAMERA MODE ── */}
      {(mode === 'loading' || mode === 'live') && (
        <div className="scanner-live">
          {/* Live video feed — fills the whole screen */}
          <video
            ref={videoRef}
            className="scanner-video"
            autoPlay
            playsInline
            muted
          />

          {/* Flash effect overlay */}
          {flash && <div className="scanner-flash" />}

          {/* Top bar */}
          <div className="scanner-topbar">
            <button className="scanner-close" onClick={onClose}>✕</button>
            <div className="scanner-title">
              <span className="scanner-title-icon">🚗</span>
              CarKno Scanner
            </div>
            <button className="scanner-flip" onClick={flipCamera} title="Flip camera">
              🔄
            </button>
          </div>

          {/* Targeting overlay — car silhouette frame */}
          <div className="scanner-frame-wrap">
            <div className="scanner-frame">
              {/* Corner brackets */}
              <div className="corner tl" /><div className="corner tr" />
              <div className="corner bl" /><div className="corner br" />
              {/* Scanning line animation */}
              <div className="scan-line" />
            </div>
            <div className="scanner-hint">
              {mode === 'loading' ? 'Starting camera...' : 'Point at a car and tap the button'}
            </div>
          </div>

          {/* Bottom bar with capture button */}
          <div className="scanner-bottom">
            {/* Upload from gallery button (left) */}
            <button className="scanner-gallery" onClick={() => fileInputRef.current?.click()} title="Upload photo">
              🖼️
            </button>
            {/* Main capture button */}
            <button
              className="scanner-capture-btn"
              onClick={capture}
              disabled={mode === 'loading'}
            >
              <div className="capture-inner" />
            </button>
            {/* Spacer */}
            <div style={{ width: 48 }} />
          </div>
        </div>
      )}

      {/* ── PREVIEW MODE — photo taken, confirm before sending ── */}
      {mode === 'preview' && (
        <div className="scanner-preview">
          <div className="scanner-topbar">
            <button className="scanner-close" onClick={onClose}>✕</button>
            <div className="scanner-title">Confirm Photo</div>
            <div style={{ width: 40 }} />
          </div>
          <div className="preview-img-wrap">
            <img src={previewSrc} alt="Captured car" className="preview-img" />
          </div>
          <div className="preview-actions">
            <button className="preview-retake" onClick={retake}>↩ Retake</button>
            <button className="preview-identify" onClick={identify}>
              🔍 Identify This Car
            </button>
          </div>
        </div>
      )}

      {/* ── IDENTIFYING — spinner while AI works ── */}
      {mode === 'identifying' && (
        <div className="scanner-identifying">
          <div className="id-glow-ring">
            <div className="id-glow-spinner" />
            <div className="id-car-icon">🚗</div>
          </div>
          <div className="id-title">Identifying Car...</div>
          <div className="id-subtitle">Claude AI is analysing your photo</div>
          <img src={previewSrc} alt="Analysing" className="id-thumb" />
        </div>
      )}

      {/* ── RESULT — car identified ── */}
      {mode === 'result' && result && (
        <div className="scanner-result">
          <div className="scanner-topbar">
            <button className="scanner-close" onClick={onClose}>✕</button>
            <div className="scanner-title">Car Identified</div>
            <div style={{ width: 40 }} />
          </div>

          <div className="result-scroll">
            {/* Photo thumbnail */}
            <div className="result-photo-wrap">
              <img src={previewSrc} alt="Identified car" className="result-photo" />
              <div className="result-photo-overlay">
                <span className="result-conf-badge" style={{ background: `${confColor}22`, color: confColor, borderColor: `${confColor}55` }}>
                  {result.confidence === 'high' ? '✓ High Confidence' : result.confidence === 'medium' ? '~ Medium Confidence' : '? Low Confidence'}
                </span>
              </div>
            </div>

            {result.notACar || !result.identified ? (
              <div className="result-notcar">
                <div className="result-notcar-icon">❌</div>
                <div className="result-notcar-title">No car detected</div>
                <div className="result-notcar-sub">Please try a clearer photo of a car.</div>
                <button className="preview-retake" onClick={retake}>Try Again</button>
              </div>
            ) : (
              <>
                {/* Main identification */}
                <div className="result-card">
                  <div className="result-make">{result.make}</div>
                  <div className="result-model">{result.model}{result.variant ? ` ${result.variant}` : ''}</div>
                  <div className="result-year">{result.year}</div>
                </div>

                {/* Details grid */}
                <div className="result-details">
                  {result.bodyStyle && (
                    <div className="result-detail-item">
                      <span className="rdi-label">Body</span>
                      <span className="rdi-value">{result.bodyStyle}</span>
                    </div>
                  )}
                  {result.colour && (
                    <div className="result-detail-item">
                      <span className="rdi-label">Colour</span>
                      <span className="rdi-value">{result.colour}</span>
                    </div>
                  )}
                </div>

                {result.notes && (
                  <div className="result-notes">
                    <span className="result-notes-label">AI Notes:</span> {result.notes}
                  </div>
                )}

                {/* CTA buttons */}
                <div className="result-cta">
                  <button
                    className="result-search-btn"
                    onClick={() => { onResult(result.fullName || `${result.make} ${result.model}`); onClose(); }}
                  >
                    🔍 Search Full Specs & Info
                  </button>
                  <button className="preview-retake" onClick={retake}>📷 Scan Another Car</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── ERROR ── */}
      {mode === 'error' && (
        <div className="scanner-fallback">
          <div className="scanner-topbar">
            <button className="scanner-close" onClick={onClose}>✕</button>
            <div className="scanner-title">Error</div>
            <div style={{ width: 40 }} />
          </div>
          <div className="fallback-content">
            <div className="fallback-icon">⚠️</div>
            <div className="fallback-msg">{camError || 'Identification failed.'}</div>
            <button className="preview-retake" onClick={retake}>Try Again</button>
          </div>
        </div>
      )}

      {/* ── FALLBACK — no camera access, show file picker ── */}
      {mode === 'fallback' && (
        <div className="scanner-fallback">
          <div className="scanner-topbar">
            <button className="scanner-close" onClick={onClose}>✕</button>
            <div className="scanner-title">
              <span className="scanner-title-icon">🚗</span> CarKno Scanner
            </div>
            <div style={{ width: 40 }} />
          </div>
          <div className="fallback-content">
            <div className="fallback-icon">📷</div>
            {camError && <div className="fallback-msg">{camError}</div>}
            <button className="fallback-pick-btn" onClick={() => fileInputRef.current?.click()}>
              📁 Choose a Photo from Gallery
            </button>
            <div className="fallback-note">
              On iOS: tap above, then choose a photo or take a new one.<br/>
              On Android: allow camera access in your browser settings.
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input — used by gallery button and fallback */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
      />
    </div>
  );
}

// ── PhotoGallery ─────────────────────────────────────────────────────────────
function PhotoGallery({ carName }) {
  const [photos, setPhotos] = useState([]);
  const [loadingPh, setLoadingPh] = useState(false);
  const [lbox, setLbox] = useState(null);
  const [filter, setFilter] = useState('all');
  const [istockUrl, setIstock] = useState('');
  const [unsplashUrl, setUnsplash] = useState('');

  useEffect(() => {
    if (!carName) return;
    let cancelled = false;
    async function load() {
      setLoadingPh(true); setPhotos([]); setFilter('all');
      try {
        const r = await fetch(`/api/photos?q=${encodeURIComponent(carName)}`);
        const d = await r.json();
        if (!cancelled) { setPhotos(d.photos || []); setIstock(d.istockUrl || ''); setUnsplash(d.unsplashUrl || ''); }
      } catch (e) { console.error(e); }
      finally { if (!cancelled) setLoadingPh(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [carName]);

  const sources = ['all', ...new Set(photos.map(p => p.source))];
  const visible = filter === 'all' ? photos : photos.filter(p => p.source === filter);

  return (
    <div className="card photo-card">
      <div className="ph-header">
        <div className="ct">📸 Photos</div>
        <div className="ph-right">
          {photos.length > 0 && (
            <div className="src-pills">
              {sources.map(s => (
                <button key={s} className={filter === s ? 'src-pill active' : 'src-pill'} onClick={() => setFilter(s)}>
                  {s === 'all' ? `All (${photos.length})` : s === 'Wikimedia Commons' ? `Wiki (${photos.filter(p=>p.source===s).length})` : `${s} (${photos.filter(p=>p.source===s).length})`}
                </button>
              ))}
            </div>
          )}
          <div className="ext-links">
            {istockUrl && <a href={istockUrl} target="_blank" rel="noopener noreferrer" className="ext-btn istock"><span className="ext-logo">iS</span>iStock →</a>}
            {unsplashUrl && <a href={unsplashUrl} target="_blank" rel="noopener noreferrer" className="ext-btn unsplash"><span className="ext-logo">U</span>Unsplash →</a>}
          </div>
        </div>
      </div>
      {loadingPh && <div className="ph-loading"><div className="ph-spin" /><span>Loading photos from Pexels &amp; Wikimedia...</span></div>}
      {!loadingPh && photos.length === 0 && carName && (
        <div className="ph-empty">
          <div style={{ fontSize: '2rem', opacity: .4 }}>📷</div>
          <div>No photos found. Add a PEXELS_API_KEY in Vercel for more photos.</div>
          <a href="https://www.pexels.com/api/" target="_blank" rel="noopener noreferrer" className="ph-setup-link">Get free Pexels API key →</a>
        </div>
      )}
      {!loadingPh && visible.length > 0 && (
        <div className="photo-grid">
          {visible.map((ph, i) => (
            <div key={i} className="ph-item" onClick={() => setLbox(ph)}>
              <img src={ph.thumb || ph.url} alt={ph.alt || carName} className="ph-img" loading="lazy" onError={e => { e.target.closest('.ph-item').style.display = 'none'; }} />
              <div className="ph-overlay">
                <span className="ph-src-badge">{ph.source === 'Wikimedia Commons' ? 'Wikipedia' : ph.source}</span>
                <span className="ph-credit-text">by {(ph.credit || '').slice(0, 30)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {lbox && (
        <div className="lbox" onClick={() => setLbox(null)}>
          <div className="lbox-content" onClick={e => e.stopPropagation()}>
            <button className="lbox-x" onClick={() => setLbox(null)}>✕</button>
            <img src={lbox.url} alt="" className="lbox-img" />
            <div className="lbox-bar">
              <span className="lbox-src-tag">{lbox.source}</span>
              <span className="lbox-credit">by <a href={lbox.creditUrl} target="_blank" rel="noopener noreferrer">{lbox.credit}</a></span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function Home() {
  const [q, setQ]           = useState('');
  const [loading, setLoad]  = useState(false);
  const [step, setStep]     = useState(-1);
  const [err, setErr]       = useState('');
  const [carData, setCarData] = useState(null);
  const [carName, setCarName] = useState('');
  const [elapsed, setEl]    = useState(0);
  const [cur, setCur]       = useState('USD');
  const [lang, setLang]     = useState('en');
  const [showScanner, setShowScanner] = useState(false);
  const iv = useRef(null);

  const go = useCallback(async (query) => {
    const sq = (query || q).trim();
    if (!sq) return;
    setLoad(true); setErr(''); setCarData(null); setCarName(''); setStep(0);
    const t0 = Date.now();
    let i = 0;
    iv.current = setInterval(() => { setStep(i++); if (i >= STEPS.length) clearInterval(iv.current); }, 700);
    try {
      const res = await fetch('/api/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: sq }) });
      clearInterval(iv.current);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
      const parsed = extractJSON(json.text);
      if (!parsed) throw new Error('Could not read car data. Try a more specific name.');
      setEl(((Date.now() - t0) / 1000).toFixed(1));
      setCarData(parsed);
      setCarName(parsed.carName || sq);
    } catch (e) { clearInterval(iv.current); setErr(e.message); }
    finally { setLoad(false); setStep(-1); }
  }, [q]);

  // Called when scanner identifies a car — auto-search it
  const onScanResult = useCallback((name) => {
    setQ(name);
    go(name);
  }, [go]);

  const isActive = carData?.stillInProduction === true || carData?.stillInProduction === 'true';

  return (
    <>
      <Head>
        <title>CarKno AI</title>
        <meta name="description" content="Point your phone at any car — CarKno AI identifies it and shows full specs, pricing, history." />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="theme-color" content="#07090d" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🚗</text></svg>" />
        <link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Inter:wght@300;400;500&display=swap" rel="stylesheet" />
      </Head>

      <main>
        {/* Camera Scanner — full screen overlay */}
        {showScanner && (
          <CameraScanner
            onResult={onScanResult}
            onClose={() => setShowScanner(false)}
          />
        )}

        {/* Header */}
        <header className="hdr">
          <div className="logo"><div className="lic">🚗</div><div className="ltx">CarKno <span>AI</span></div></div>
          <div className="hbadge">⚡ Live Multi-Source</div>
        </header>

        {/* Filter bar */}
        <div className="fbar">
          <span className="flbl">Currency:</span>
          <select className="fsel" value={cur} onChange={e => setCur(e.target.value)}>
            {Object.entries(CUR).map(([k, v]) => <option key={k} value={k}>{k} — {v.n} ({v.s})</option>)}
          </select>
          <div className="fdiv" />
          <span className="flbl">Language:</span>
          <select className="fsel" value={lang} onChange={e => setLang(e.target.value)}>
            {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v.flag} {v.name}</option>)}
          </select>
        </div>

        {/* Hero */}
        <section className="hero">
          <h1>ANY CAR.<br /><em>EVERY DETAIL.</em></h1>
          <p>Search by name, or point your phone at any car to instantly identify it.</p>

          {/* ── BIG SCAN BUTTON ── */}
          <button className="big-scan-btn" onClick={() => setShowScanner(true)}>
            <div className="bsb-icon-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="bsb-cam-svg">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              <div className="bsb-pulse" />
            </div>
            <div className="bsb-text">
              <span className="bsb-main">Scan a Car with Your Camera</span>
              <span className="bsb-sub">Point · Tap · Identify</span>
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="bsb-arrow"><path d="M9 18l6-6-6-6"/></svg>
          </button>

          <div className="or-divider"><span>or search by name</span></div>

          <div className="chips">
            {CHIPS.map(c => <button key={c} className="chip" onClick={() => { setQ(c); go(c); }}>{c}</button>)}
          </div>
          <div className="srow">
            <input className="sin" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()} placeholder="e.g. Ferrari F40, BMW M3, Toyota GR Yaris..." />
            <button className="sbt" onClick={() => go()} disabled={loading}>{loading ? 'Searching...' : 'Search →'}</button>
          </div>
        </section>

        {loading && (
          <div className="load">
            <div className="spin" />
            <div className="ltitle">Scanning Databases</div>
            {STEPS.map((s, i) => <span key={i} className={step === i ? 'lstep on' : 'lstep'}>→ {s}</span>)}
          </div>
        )}
        {err && <div className="ebox">⚠ {err}</div>}

        {carData && (
          <div className="res">
            <div className="rhead">
              <div>
                <div className="rname">{carData.carName || q}</div>
                <span className={isActive ? 'badge active' : 'badge ended'}>
                  <span className={isActive ? 'dot pulse' : 'dot'} />
                  {carData.productionStart || '?'} — {isActive ? 'Still in Production' : (carData.productionEnd || '?')}
                </span>
              </div>
              <div className="rmeta">
                <strong>Sources:</strong> autoscout24 · bilbasen · auto-data.net · ultimatespecs<br />
                <strong>Time:</strong> {elapsed}s &nbsp;|&nbsp; <strong>Currency:</strong> {cur} ({CUR[cur].s})
              </div>
            </div>

            <div style={{ marginBottom: 12 }}><PhotoGallery carName={carName} /></div>

            <div style={{ marginBottom: 12 }}>
              <div className="card">
                <div className="ct">⚡ Performance</div>
                <div className="stats-row">
                  {[{ l: 'Horsepower', v: carData.hp, c: 'o' }, { l: 'Torque', v: carData.torque, c: 'o' }, { l: '0–100 km/h', v: carData.acceleration, c: 'cy' }, { l: 'Top Speed', v: carData.topSpeed, c: 'cy' }, { l: 'Total Built', v: carData.totalProduced, c: 'g' }, { l: 'Engine', v: carData.engine, c: 'cy', sm: true }].map(({ l, v, c, sm }) => (
                    <div key={l} className="stat"><div className="slbl">{l}</div><div className={`sv ${c}${sm ? ' sm' : ''}`}>{v || '—'}</div></div>
                  ))}
                </div>
              </div>
            </div>

            <div className="g2">
              <div className="card">
                <div className="ct">⛽ Fuel Consumption</div>
                {carData.fuel ? (
                  <><span className={`fbadge ${fuelCls(carData.fuel.type)}`}>{carData.fuel.type || '—'}</span>
                    <div className="fgrid">
                      {[{ l: 'Combined (L/100km)', v: carData.fuel.combined }, { l: 'Combined (MPG)', v: carData.fuel.combinedMpg }, { l: 'City (L/100km)', v: carData.fuel.city }, { l: 'City (MPG)', v: carData.fuel.cityMpg }, { l: 'Highway (L/100km)', v: carData.fuel.highway }, { l: 'Highway (MPG)', v: carData.fuel.highwayMpg }, { l: 'CO₂', v: carData.fuel.co2 }, { l: 'Tank', v: carData.fuel.tankSize }, { l: 'Range', v: carData.fuel.range }].filter(r => r.v).map(({ l, v }) => (
                        <div key={l} className={`frow ${fuelCls(carData.fuel.type)}`}><span className="fk">{l}</span><span className="fv">{v}</span></div>
                      ))}
                    </div></>
                ) : <p className="prose">No fuel data.</p>}
              </div>
              <div className="card">
                <div className="ct">🏭 Production History</div>
                <div className="ptrack"><div className="pfill" style={{ width: `${Math.min(100, Math.max(5, carData.productionProgressPercent || 60))}%` }} /></div>
                <div className="pdates"><span>Started: <strong>{carData.productionStart || '?'}</strong></span><span>{isActive ? '🟢 Active' : `🔴 Ended ${carData.productionEnd || ''}`}</span></div>
                <p className="prose">{carData.productionNarrative || '—'}</p>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div className="card">
                <div className="ct">💰 Price Guide — by Year, Mileage &amp; Version</div>
                {carData.pricing?.length ? (
                  <table className="ptbl">
                    <thead><tr><th>Year / Version</th><th>Mileage</th><th>Avg. Price ({cur})</th></tr></thead>
                    <tbody>{carData.pricing.map((r, i) => <tr key={i}><td>{r.variant || '—'}</td><td>{r.mileage || '—'}</td><td className="pv">{fmtP(r.priceUSD, cur)}</td></tr>)}</tbody>
                  </table>
                ) : <p className="prose">No pricing data.</p>}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div className="card">
                <div className="ct">⭐ Special &amp; Limited Editions</div>
                {carData.specialModels?.length ? carData.specialModels.map((m, i) => (
                  <div key={i} className="sm"><div><div className="smn">{m.name || '—'}</div><div className="sms">{m.description || ''}</div></div><div className="smt">{m.year || m.units || '—'}</div></div>
                )) : <p className="prose">No special editions found.</p>}
              </div>
            </div>

            <div className="g2">
              <div className="card">
                <div className="ct">🔩 Materials &amp; Components</div>
                {carData.materials?.length ? (
                  <div className="mgrid">{carData.materials.map((m, i) => <div key={i} className="mat"><div className="mn">{m.name || '—'}</div><div className="mu">{m.usage || ''}</div></div>)}</div>
                ) : <p className="prose">No materials data.</p>}
              </div>
              <div className="card"><div className="ct">📋 Full Report</div><p className="prose">{carData.fullReport || '—'}</p></div>
            </div>
          </div>
        )}

        <footer className="foot">
          <p>CarKno AI · Scan any car with your camera · Multi-source automotive intelligence</p>
          <p>Pexels · Wikimedia Commons · auto-data.net · ultimatespecs.com · autoscout24 · bilbasen.dk · mobile.de</p>
        </footer>
      </main>

      <style jsx global>{`
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html,body{background:#07090d;color:#ddeeff;font-family:'Inter',sans-serif;min-height:100%;-webkit-tap-highlight-color:transparent}
        main{position:relative;max-width:1100px;margin:0 auto;padding:0 18px 90px}
        main::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(0,212,255,.02) 1px,transparent 1px),linear-gradient(90deg,rgba(0,212,255,.02) 1px,transparent 1px);background-size:44px 44px;pointer-events:none;z-index:0}

        .hdr{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;padding:18px 0 20px;border-bottom:1px solid #1e2d3d;margin-bottom:16px}
        .logo{display:flex;align-items:center;gap:10px}
        .lic{width:36px;height:36px;background:linear-gradient(135deg,#00d4ff,#006688);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1rem;box-shadow:0 0 16px rgba(0,212,255,.22);flex-shrink:0}
        .ltx{font-family:'Rajdhani',sans-serif;font-size:1.6rem;font-weight:700;letter-spacing:.07em;line-height:1}
        .ltx span{color:#00d4ff}
        .hbadge{background:rgba(0,212,255,.07);border:1px solid rgba(0,212,255,.18);border-radius:20px;padding:4px 12px;font-size:.66rem;color:#00d4ff;letter-spacing:.12em;text-transform:uppercase}

        .fbar{position:relative;z-index:1;display:flex;flex-wrap:wrap;align-items:center;gap:10px;background:#0e1117;border:1px solid #1e2d3d;border-radius:8px;padding:10px 14px;margin-bottom:20px}
        .flbl{font-size:.65rem;text-transform:uppercase;letter-spacing:.1em;color:#4a6080}
        .fsel{background:#151c25;border:1px solid #1e2d3d;border-radius:5px;color:#ddeeff;font-family:'Inter',sans-serif;font-size:.78rem;padding:5px 26px 5px 9px;cursor:pointer;outline:none;-webkit-appearance:none;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%234a6080'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 8px center}
        .fsel:focus{border-color:#00d4ff}
        .fdiv{width:1px;height:20px;background:#1e2d3d}

        .hero{position:relative;z-index:1;text-align:center;margin-bottom:24px}
        .hero h1{font-family:'Rajdhani',sans-serif;font-size:clamp(2rem,5.5vw,4rem);font-weight:700;line-height:1.05;letter-spacing:.03em;margin-bottom:10px}
        .hero h1 em{color:#00d4ff;font-style:normal;display:block}
        .hero p{color:#4a6080;font-size:.82rem;max-width:480px;margin:0 auto 22px;line-height:1.6}

        /* ── BIG SCAN BUTTON ── */
        .big-scan-btn{width:100%;max-width:560px;margin:0 auto 20px;display:flex;align-items:center;gap:16px;background:linear-gradient(135deg,rgba(0,212,255,.12),rgba(0,212,255,.06));border:2px solid rgba(0,212,255,.35);border-radius:14px;padding:18px 22px;cursor:pointer;transition:all .2s;position:relative;overflow:hidden;text-align:left}
        .big-scan-btn::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,transparent,rgba(0,212,255,.06));opacity:0;transition:opacity .2s}
        .big-scan-btn:hover{border-color:#00d4ff;transform:translateY(-2px);box-shadow:0 8px 32px rgba(0,212,255,.2)}
        .big-scan-btn:hover::before{opacity:1}
        .big-scan-btn:active{transform:translateY(0)}
        .bsb-icon-wrap{position:relative;flex-shrink:0;width:52px;height:52px;display:flex;align-items:center;justify-content:center}
        .bsb-cam-svg{width:34px;height:34px;color:#00d4ff;position:relative;z-index:1}
        .bsb-pulse{position:absolute;inset:-8px;border-radius:50%;border:2px solid rgba(0,212,255,.3);animation:cam-pulse 2s ease-in-out infinite}
        @keyframes cam-pulse{0%,100%{transform:scale(1);opacity:.6}50%{transform:scale(1.15);opacity:.2}}
        .bsb-text{flex:1;min-width:0}
        .bsb-main{display:block;font-family:'Rajdhani',sans-serif;font-size:1.1rem;font-weight:700;color:#ddeeff;letter-spacing:.04em;text-transform:uppercase;margin-bottom:3px}
        .bsb-sub{display:block;font-size:.72rem;color:#4a6080;letter-spacing:.08em;text-transform:uppercase}
        .bsb-arrow{width:20px;height:20px;color:#4a6080;flex-shrink:0;transition:color .2s,transform .2s}
        .big-scan-btn:hover .bsb-arrow{color:#00d4ff;transform:translateX(3px)}

        .or-divider{display:flex;align-items:center;gap:12px;max-width:560px;margin:0 auto 18px;color:#2a3f55;font-size:.72rem;text-transform:uppercase;letter-spacing:.08em}
        .or-divider::before,.or-divider::after{content:'';flex:1;height:1px;background:#1e2d3d}

        .chips{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-bottom:14px}
        .chip{background:#151c25;border:1px solid #1e2d3d;border-radius:4px;padding:5px 11px;font-size:.73rem;color:#4a6080;cursor:pointer;transition:all .15s;font-family:'Inter',sans-serif}
        .chip:hover{border-color:#00d4ff;color:#00d4ff;background:rgba(0,212,255,.06)}
        .srow{display:flex;gap:8px;max-width:680px;margin:0 auto}
        .sin{flex:1;background:#151c25;border:1px solid #1e2d3d;border-radius:7px;padding:12px 15px;font-size:.9rem;color:#ddeeff;font-family:'Inter',sans-serif;outline:none;transition:border-color .2s,box-shadow .2s}
        .sin::placeholder{color:#243040}
        .sin:focus{border-color:#00d4ff;box-shadow:0 0 0 3px rgba(0,212,255,.09)}
        .sbt{background:linear-gradient(135deg,#00d4ff,#007baa);color:#000;border:none;border-radius:7px;padding:12px 22px;font-size:.84rem;font-weight:700;font-family:'Rajdhani',sans-serif;cursor:pointer;letter-spacing:.07em;text-transform:uppercase;transition:all .15s;white-space:nowrap}
        .sbt:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 5px 20px rgba(0,212,255,.25)}
        .sbt:disabled{opacity:.4;cursor:not-allowed;transform:none}

        /* ══════════════════════════════════════════
           CAMERA SCANNER STYLES
        ══════════════════════════════════════════ */
        .scanner-overlay{position:fixed;inset:0;z-index:9999;background:#000;display:flex;flex-direction:column}

        /* Live camera */
        .scanner-live{position:relative;width:100%;height:100%;display:flex;flex-direction:column;background:#000;overflow:hidden}
        .scanner-video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scaleX(1)} /* no mirror on rear cam */
        .scanner-flash{position:absolute;inset:0;background:#fff;z-index:10;animation:flash-anim .18s ease forwards;pointer-events:none}
        @keyframes flash-anim{0%{opacity:.9}100%{opacity:0}}

        /* Top bar */
        .scanner-topbar{position:relative;z-index:5;display:flex;align-items:center;justify-content:space-between;padding:env(safe-area-inset-top, 12px) 16px 12px;background:linear-gradient(to bottom,rgba(0,0,0,.7),transparent)}
        .scanner-close{background:rgba(255,255,255,.15);border:none;border-radius:50%;width:38px;height:38px;color:#fff;font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);transition:background .15s;flex-shrink:0}
        .scanner-close:hover{background:rgba(255,60,60,.5)}
        .scanner-title{display:flex;align-items:center;gap:7px;font-family:'Rajdhani',sans-serif;font-size:.95rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#fff}
        .scanner-title-icon{font-size:1.1rem}
        .scanner-flip{background:rgba(255,255,255,.15);border:none;border-radius:50%;width:38px;height:38px;font-size:1.1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);transition:background .15s;flex-shrink:0}
        .scanner-flip:hover{background:rgba(255,255,255,.25)}

        /* Targeting frame */
        .scanner-frame-wrap{position:relative;z-index:3;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none}
        .scanner-frame{position:relative;width:min(85vw, 480px);height:min(50vw, 270px);border-radius:6px}
        .corner{position:absolute;width:22px;height:22px;border-color:#00d4ff;border-style:solid}
        .corner.tl{top:0;left:0;border-width:3px 0 0 3px;border-radius:4px 0 0 0}
        .corner.tr{top:0;right:0;border-width:3px 3px 0 0;border-radius:0 4px 0 0}
        .corner.bl{bottom:0;left:0;border-width:0 0 3px 3px;border-radius:0 0 0 4px}
        .corner.br{bottom:0;right:0;border-width:0 3px 3px 0;border-radius:0 0 4px 0}
        .scan-line{position:absolute;left:3px;right:3px;height:2px;background:linear-gradient(90deg,transparent,#00d4ff,transparent);animation:scan-move 2.5s ease-in-out infinite;box-shadow:0 0 8px rgba(0,212,255,.6)}
        @keyframes scan-move{0%,100%{top:3px;opacity:.8}50%{top:calc(100% - 5px);opacity:.8}25%,75%{opacity:1}}
        .scanner-hint{margin-top:16px;font-size:.8rem;color:rgba(255,255,255,.65);letter-spacing:.06em;text-align:center;text-shadow:0 1px 4px rgba(0,0,0,.8)}

        /* Capture button */
        .scanner-bottom{position:relative;z-index:5;display:flex;align-items:center;justify-content:space-between;padding:16px 24px calc(env(safe-area-inset-bottom, 16px) + 16px);background:linear-gradient(to top,rgba(0,0,0,.7),transparent)}
        .scanner-gallery{background:rgba(255,255,255,.15);border:none;border-radius:50%;width:48px;height:48px;font-size:1.3rem;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);transition:background .15s}
        .scanner-gallery:hover{background:rgba(255,255,255,.25)}
        .scanner-capture-btn{width:72px;height:72px;border-radius:50%;background:rgba(255,255,255,.25);border:3px solid #fff;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);transition:all .15s;flex-shrink:0}
        .scanner-capture-btn:hover{background:rgba(255,255,255,.35);transform:scale(1.05)}
        .scanner-capture-btn:active{transform:scale(.94)}
        .scanner-capture-btn:disabled{opacity:.4;cursor:not-allowed}
        .capture-inner{width:54px;height:54px;border-radius:50%;background:#fff;transition:all .1s}
        .scanner-capture-btn:active .capture-inner{transform:scale(.88)}

        /* Preview */
        .scanner-preview{width:100%;height:100%;display:flex;flex-direction:column;background:#000}
        .preview-img-wrap{flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:12px}
        .preview-img{max-width:100%;max-height:100%;object-fit:contain;border-radius:6px}
        .preview-actions{display:flex;gap:12px;padding:16px 20px calc(env(safe-area-inset-bottom,16px)+16px);background:rgba(0,0,0,.5)}
        .preview-retake{flex:1;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);border-radius:8px;color:#fff;padding:13px;font-size:.84rem;cursor:pointer;font-family:'Inter',sans-serif;transition:background .15s}
        .preview-retake:hover{background:rgba(255,255,255,.18)}
        .preview-identify{flex:2;background:linear-gradient(135deg,#00d4ff,#007baa);border:none;border-radius:8px;color:#000;padding:13px;font-size:.9rem;font-weight:700;cursor:pointer;font-family:'Rajdhani',sans-serif;letter-spacing:.06em;text-transform:uppercase;transition:all .15s}
        .preview-identify:hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(0,212,255,.3)}

        /* Identifying */
        .scanner-identifying{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;padding:32px;background:#07090d}
        .id-glow-ring{position:relative;width:100px;height:100px;display:flex;align-items:center;justify-content:center}
        .id-glow-spinner{position:absolute;inset:0;border-radius:50%;border:3px solid transparent;border-top-color:#00d4ff;animation:spin .8s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}
        .id-car-icon{font-size:2.6rem}
        .id-title{font-family:'Rajdhani',sans-serif;font-size:1.4rem;font-weight:700;color:#ddeeff;letter-spacing:.06em}
        .id-subtitle{font-size:.78rem;color:#4a6080}
        .id-thumb{width:120px;border-radius:6px;opacity:.5;margin-top:8px}

        /* Result */
        .scanner-result{width:100%;height:100%;display:flex;flex-direction:column;background:#07090d;overflow:hidden}
        .result-scroll{flex:1;overflow-y:auto;padding:16px 20px calc(env(safe-area-inset-bottom,20px)+20px);display:flex;flex-direction:column;gap:14px}
        .result-photo-wrap{position:relative;border-radius:10px;overflow:hidden;background:#151c25;max-height:220px;flex-shrink:0}
        .result-photo{width:100%;max-height:220px;object-fit:cover;display:block}
        .result-photo-overlay{position:absolute;bottom:0;left:0;right:0;padding:10px;background:linear-gradient(transparent,rgba(0,0,0,.7))}
        .result-conf-badge{padding:3px 10px;border-radius:4px;font-size:.72rem;font-weight:600;letter-spacing:.06em;border:1px solid}
        .result-card{background:#0e1117;border:1px solid #1e2d3d;border-left:4px solid #00d4ff;border-radius:8px;padding:16px 18px}
        .result-make{font-size:.8rem;text-transform:uppercase;letter-spacing:.12em;color:#4a6080;margin-bottom:3px}
        .result-model{font-family:'Rajdhani',sans-serif;font-size:2rem;font-weight:700;color:#ddeeff;line-height:1;margin-bottom:4px}
        .result-year{font-family:'Rajdhani',sans-serif;font-size:1.1rem;color:#00d4ff;letter-spacing:.06em}
        .result-details{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        .result-detail-item{background:#151c25;border-radius:6px;padding:10px 12px;border:1px solid #243040}
        .rdi-label{display:block;font-size:.6rem;text-transform:uppercase;letter-spacing:.1em;color:#4a6080;margin-bottom:3px}
        .rdi-value{display:block;font-family:'Rajdhani',sans-serif;font-size:1rem;font-weight:700;color:#ddeeff}
        .result-notes{background:#151c25;border-radius:6px;padding:10px 12px;font-size:.78rem;color:#a8c0d8;line-height:1.6;border:1px solid #243040}
        .result-notes-label{color:#ff6b00;font-weight:600;margin-right:4px}
        .result-cta{display:flex;flex-direction:column;gap:8px}
        .result-search-btn{background:linear-gradient(135deg,#00d4ff,#007baa);color:#000;border:none;border-radius:10px;padding:15px;font-size:.95rem;font-weight:700;cursor:pointer;font-family:'Rajdhani',sans-serif;letter-spacing:.06em;text-transform:uppercase;transition:all .15s}
        .result-search-btn:hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(0,212,255,.3)}
        .result-notcar{display:flex;flex-direction:column;align-items:center;gap:12px;padding:32px;text-align:center}
        .result-notcar-icon{font-size:2.5rem}
        .result-notcar-title{font-family:'Rajdhani',sans-serif;font-size:1.2rem;color:#ff9999}
        .result-notcar-sub{font-size:.8rem;color:#4a6080}

        /* Fallback */
        .scanner-fallback{width:100%;height:100%;display:flex;flex-direction:column;background:#07090d}
        .fallback-content{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:32px;text-align:center}
        .fallback-icon{font-size:3rem;opacity:.5}
        .fallback-msg{font-size:.84rem;color:#ff9999;max-width:340px;line-height:1.6}
        .fallback-pick-btn{background:linear-gradient(135deg,#00d4ff,#007baa);color:#000;border:none;border-radius:10px;padding:14px 28px;font-size:.9rem;font-weight:700;cursor:pointer;font-family:'Rajdhani',sans-serif;letter-spacing:.06em;text-transform:uppercase}
        .fallback-note{font-size:.74rem;color:#4a6080;max-width:320px;line-height:1.65}

        /* ── Results page ── */
        .load{position:relative;z-index:1;text-align:center;padding:48px 0}
        .spin{width:44px;height:44px;border:2px solid #1e2d3d;border-top-color:#00d4ff;border-radius:50%;animation:spin .7s linear infinite;margin:0 auto 14px}
        .ltitle{font-family:'Rajdhani',sans-serif;font-size:.88rem;color:#00d4ff;letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px}
        .lstep{display:block;font-size:.72rem;color:#243040;margin-bottom:3px;transition:color .25s}
        .lstep.on{color:#00d4ff}
        .ebox{position:relative;z-index:1;background:rgba(255,60,60,.07);border:1px solid rgba(255,60,60,.2);border-radius:7px;padding:13px 17px;color:#ff9999;font-size:.84rem;margin-top:16px}
        .res{position:relative;z-index:1;margin-top:26px;animation:up .4s ease}
        @keyframes up{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        .rhead{display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:18px;padding-bottom:14px;border-bottom:2px solid #1e2d3d}
        .rname{font-family:'Rajdhani',sans-serif;font-size:clamp(1.4rem,3vw,2.4rem);font-weight:700;color:#00d4ff;letter-spacing:.04em;line-height:1}
        .rmeta{font-size:.67rem;color:#4a6080;text-align:right;line-height:2}
        .rmeta strong{color:#ff6b00}
        .badge{display:inline-flex;align-items:center;gap:5px;padding:4px 11px;border-radius:20px;font-size:.72rem;font-weight:600;margin-top:5px}
        .badge.active{background:rgba(0,230,118,.08);color:#00e676;border:1px solid rgba(0,230,118,.2)}
        .badge.ended{background:rgba(255,107,0,.08);color:#ff6b00;border:1px solid rgba(255,107,0,.2)}
        .dot{width:6px;height:6px;border-radius:50%;background:currentColor;flex-shrink:0}
        .dot.pulse{animation:pulse 1.8s ease-in-out infinite}
        @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.7)}}
        .g2{display:grid;grid-template-columns:1fr 1fr;gap:11px;margin-bottom:11px}
        .card{background:#0e1117;border:1px solid #1e2d3d;border-radius:9px;padding:16px;position:relative;overflow:hidden}
        .card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,#00d4ff,transparent)}
        .ct{font-family:'Rajdhani',sans-serif;font-size:.67rem;letter-spacing:.16em;text-transform:uppercase;color:#00d4ff;margin-bottom:11px}
        .photo-card{padding:16px}
        .ph-header{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px}
        .ph-header .ct{margin-bottom:0;flex-shrink:0}
        .ph-right{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
        .src-pills{display:flex;gap:5px;flex-wrap:wrap}
        .src-pill{background:#151c25;border:1px solid #1e2d3d;border-radius:20px;padding:3px 10px;font-size:.65rem;color:#4a6080;cursor:pointer;transition:all .15s;font-family:'Inter',sans-serif;white-space:nowrap}
        .src-pill:hover:not(.active){color:#ddeeff;border-color:#4a6080}
        .src-pill.active{border-color:#00d4ff;color:#00d4ff;background:rgba(0,212,255,.08)}
        .ext-links{display:flex;gap:6px;flex-wrap:wrap}
        .ext-btn{display:inline-flex;align-items:center;gap:5px;border-radius:5px;padding:4px 10px;font-size:.67rem;font-weight:600;text-decoration:none;transition:all .15s;white-space:nowrap}
        .ext-btn.istock{background:rgba(255,107,0,.09);border:1px solid rgba(255,107,0,.2);color:#ff6b00}
        .ext-btn.unsplash{background:rgba(0,212,255,.07);border:1px solid rgba(0,212,255,.18);color:#00d4ff}
        .ext-logo{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:3px;font-size:.6rem;font-weight:700;background:currentColor;color:#000;flex-shrink:0}
        .ph-loading{display:flex;align-items:center;gap:10px;padding:28px 12px;color:#4a6080;font-size:.8rem}
        .ph-spin{width:20px;height:20px;border:2px solid #1e2d3d;border-top-color:#00d4ff;border-radius:50%;animation:spin .7s linear infinite;flex-shrink:0}
        .ph-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:32px;color:#4a6080;font-size:.82rem;text-align:center}
        .ph-setup-link{color:#00d4ff;font-size:.76rem;text-decoration:none;border:1px solid rgba(0,212,255,.2);padding:4px 12px;border-radius:5px}
        .photo-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
        .ph-item{position:relative;cursor:pointer;border-radius:6px;overflow:hidden;background:#151c25;aspect-ratio:16/9;transition:transform .2s}
        .ph-item:hover{transform:scale(1.02)}
        .ph-item:hover .ph-overlay{opacity:1}
        .ph-item:hover .ph-img{transform:scale(1.08)}
        .ph-img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .35s ease}
        .ph-overlay{position:absolute;inset:0;background:linear-gradient(transparent 35%,rgba(0,0,0,.82));opacity:0;transition:opacity .22s;display:flex;flex-direction:column;justify-content:flex-end;padding:8px;gap:3px}
        .ph-src-badge{font-size:.58rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#00d4ff;background:rgba(0,0,0,.6);padding:2px 6px;border-radius:3px;width:fit-content}
        .ph-credit-text{font-size:.59rem;color:#bbb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .lbox{position:fixed;inset:0;background:rgba(0,0,0,.96);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;cursor:pointer}
        .lbox-content{position:relative;display:flex;flex-direction:column;align-items:center;gap:12px;cursor:default;max-width:90vw}
        .lbox-x{position:absolute;top:-14px;right:-14px;background:#1e2d3d;border:1px solid #4a6080;border-radius:50%;width:30px;height:30px;color:#ddeeff;cursor:pointer;font-size:.8rem;display:flex;align-items:center;justify-content:center;z-index:1}
        .lbox-x:hover{background:#ff3b3b}
        .lbox-img{max-width:88vw;max-height:72vh;border-radius:6px;object-fit:contain;display:block}
        .lbox-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:center}
        .lbox-src-tag{background:rgba(0,212,255,.1);color:#00d4ff;border:1px solid rgba(0,212,255,.2);border-radius:4px;padding:3px 10px;font-size:.7rem;font-weight:600;text-transform:uppercase}
        .lbox-credit{font-size:.76rem;color:#aaa}
        .lbox-credit a{color:#00d4ff;text-decoration:none}
        .stats-row{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}
        .stat{background:#151c25;border-radius:6px;padding:10px 11px;border:1px solid #243040}
        .slbl{font-size:.59rem;text-transform:uppercase;letter-spacing:.1em;color:#4a6080;margin-bottom:3px}
        .sv{font-family:'Rajdhani',sans-serif;font-size:1.2rem;font-weight:700;line-height:1}
        .sv.cy{color:#00d4ff}.sv.o{color:#ff6b00}.sv.g{color:#00e676}.sv.sm{font-size:.85rem}
        .fgrid{display:grid;grid-template-columns:1fr 1fr;gap:7px}
        .frow{background:#151c25;border-radius:5px;padding:8px 10px;border-left:3px solid #00d4ff;display:flex;justify-content:space-between;align-items:center}
        .frow.fd{border-left-color:#ff6b00}.frow.fe{border-left-color:#00e676}.frow.fh{border-left-color:#a064ff}
        .fk{font-size:.63rem;color:#4a6080;text-transform:uppercase;letter-spacing:.07em}
        .fv{font-family:'Rajdhani',sans-serif;font-size:1rem;font-weight:700;color:#ddeeff}
        .fbadge{display:inline-block;padding:3px 9px;border-radius:4px;font-size:.67rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin-bottom:9px}
        .fp{background:rgba(255,107,0,.1);color:#ff6b00;border:1px solid rgba(255,107,0,.2)}
        .fd{background:rgba(0,212,255,.1);color:#00d4ff;border:1px solid rgba(0,212,255,.2)}
        .fe{background:rgba(0,230,118,.1);color:#00e676;border:1px solid rgba(0,230,118,.2)}
        .fh{background:rgba(160,100,255,.1);color:#a064ff;border:1px solid rgba(160,100,255,.2)}
        .ptrack{background:#151c25;border-radius:20px;height:6px;margin:7px 0;overflow:hidden}
        .pfill{height:100%;background:linear-gradient(90deg,#00d4ff,#00e676);border-radius:20px;transition:width 1.1s ease}
        .pdates{display:flex;justify-content:space-between;font-size:.66rem;color:#4a6080;margin-bottom:10px}
        .pdates strong{color:#ddeeff}
        .ptbl{width:100%;border-collapse:collapse;font-size:.78rem}
        .ptbl th{background:#151c25;color:#00d4ff;padding:7px 9px;text-align:left;font-family:'Rajdhani',sans-serif;letter-spacing:.08em;font-size:.68rem;text-transform:uppercase;border-bottom:1px solid #00d4ff}
        .ptbl td{padding:7px 9px;border-bottom:1px solid #1e2d3d;color:#ddeeff}
        .ptbl tr:last-child td{border-bottom:none}
        .ptbl tr:hover td{background:#1c2535}
        .pv{color:#00e676;font-weight:600;font-family:'Rajdhani',sans-serif;font-size:.9rem}
        .sm{background:#151c25;border-radius:6px;padding:10px 12px;margin-bottom:7px;border-left:3px solid #00d4ff;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:5px}
        .smn{font-family:'Rajdhani',sans-serif;font-size:.9rem;font-weight:700;color:#ddeeff}
        .sms{font-size:.69rem;color:#4a6080;margin-top:2px}
        .smt{background:rgba(0,212,255,.09);color:#00d4ff;border:1px solid rgba(0,212,255,.15);border-radius:4px;padding:2px 8px;font-size:.67rem;white-space:nowrap}
        .mgrid{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}
        .mat{background:#151c25;border-radius:5px;padding:8px 10px;border-left:3px solid #ff6b00}
        .mn{font-size:.77rem;font-weight:500;color:#ddeeff;margin-bottom:1px}
        .mu{font-size:.67rem;color:#4a6080}
        .prose{font-size:.81rem;color:#a8c0d8;line-height:1.7}
        .foot{position:relative;z-index:1;margin-top:55px;padding-top:16px;border-top:1px solid #1e2d3d;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}
        .foot p{font-size:.67rem;color:#243040}

        @media(max-width:900px){.stats-row{grid-template-columns:repeat(3,1fr)}}
        @media(max-width:660px){
          .g2{grid-template-columns:1fr}
          .srow{flex-direction:column}
          .fgrid,.mgrid{grid-template-columns:1fr}
          .photo-grid{grid-template-columns:repeat(2,1fr)}
          .stats-row{grid-template-columns:repeat(2,1fr)}
        }
      `}</style>
    </>
  );
}
