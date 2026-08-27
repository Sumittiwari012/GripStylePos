import React from 'react'

export function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700;800&family=Inter:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,600;9..144,800&family=Playfair+Display:wght@700;800&family=IBM+Plex+Mono:wght@600;700&family=Manrope:wght@500;700&family=IBM+Plex+Sans:wght@400;600;700&family=Source+Serif+4:wght@600;700&family=Bebas+Neue&family=Anton&family=Archivo+Black&family=Poppins:wght@700;800&family=Montserrat:wght@700;800&family=Oswald:wght@600;700&family=Abril+Fatface&family=DM+Serif+Display&family=Cormorant+Garamond:wght@600;700&family=Libre+Baskerville:wght@700&family=Syne:wght@700;800&family=Sora:wght@700;800&family=Unbounded:wght@700;800&family=Outfit:wght@700;800&family=Righteous&family=Rubik+Mono+One&family=Big+Shoulders+Display:wght@700;800&family=Josefin+Sans:wght@600;700&family=Bodoni+Moda:wght@700;800&family=Zilla+Slab:wght@600;700&family=Roboto:wght@400;500;600;700&family=Open+Sans:wght@400;500;600;700&family=Lato:wght@400;700&family=Nunito:wght@400;500;600;700&family=Work+Sans:wght@400;500;600;700&family=Karla:wght@400;500;600;700&family=Mulish:wght@400;500;600;700&family=Rubik:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&family=Barlow:wght@400;500;600;700&family=Inconsolata:wght@400;500;600;700&family=Quicksand:wght@400;500;600;700&family=Raleway:wght@400;500;600;700&family=PT+Sans:wght@400;700&family=Noto+Sans:wght@400;500;600;700&family=Hind:wght@400;500;600;700&family=Overpass:wght@400;500;600;700&family=Cabin:wght@400;500;600;700&family=Assistant:wght@400;500;600;700&family=Public+Sans:wght@400;500;600;700&display=swap&family=Public+Sans:wght@400;500;600;700&family=Caveat:wght@600;700&family=Courier+Prime:wght@400;700&display=swap');

      .vs-wrap { background: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 20px -12px rgba(28,26,36,0.35); font-family: 'Inter', sans-serif; }

      @media (min-width: 900px) {
        .vs-wrap {
          position: fixed;
          inset: 0;
          z-index: 100;
          border-radius: 0;
          box-shadow: none;
          overflow-y: auto;
        }
        .vs-gallery-inner {
          width: 100%;
          max-width: 1040px;
          margin: 0 auto;
          padding: 32px;
        }
      }
      .vs-eyebrow { margin: 0 0 2px; font-size: 11.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.6); }
      .vs-title { margin: 0; font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 20px; color: #1C1A24; }

      .vs-gallery-inner { padding: 22px; }
      .vs-gallery-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 20px; }
      .vs-gallery-header-left { display: flex; align-items: flex-start; gap: 12px; }
      .vs-gallery-header .vs-eyebrow { color: #9C98AC; }
      .vs-eyebrow--dark { color: #B9762E; }
      .vs-back.vs-back--light { background: #F7F6FA; color: #1C1A24; margin-top: 2px; }
      .vs-back.vs-back--light:hover { background: #EDEBF2; }

      .vs-storage-warning { display: flex; align-items: center; gap: 6px; margin: 0 0 16px; padding: 10px 12px; border-radius: 8px; background: #FDEEEE; color: #8E2E2E; font-size: 12.5px; font-weight: 600; }
      .vs-storage-warning--editor { margin: 0; border-radius: 0; }
      .vs-inline-retry { margin-left: auto; border: none; background: transparent; color: #8E2E2E; font-weight: 700; font-size: 12.5px; text-decoration: underline; cursor: pointer; padding: 0; }

      .vs-empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; padding: 48px 24px; border: 1.5px dashed #E3E1EA; border-radius: 14px; color: #6B6680; }
      .vs-empty svg { color: #B9762E; }
      .vs-empty-title { margin: 0; font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 16px; color: #1C1A24; }
      .vs-empty-text { margin: 0 0 6px; font-size: 13.5px; max-width: 380px; line-height: 1.5; }

      .vs-grid { display: grid; grid-template-columns: 1fr; gap: 14px; }
      @media (min-width: 480px) { .vs-grid { grid-template-columns: 1fr 1fr; } }
      @media (min-width: 900px) { .vs-grid { grid-template-columns: repeat(3, 1fr); } }

      .vs-card { border: 1.5px solid #E3E1EA; border-radius: 12px; overflow: hidden; background: #FFFFFF; display: flex; flex-direction: column; }
      .vs-card--selected { border-color: #B9762E; background: #FBF3E8; }
      .vs-card-preview { position: relative; width: 100%; overflow: hidden; border: none; padding: 0; margin: 0; background: none; cursor: pointer; display: block; -webkit-tap-highlight-color: transparent; }
      .vs-card-preview:focus-visible { outline: 3px solid #1C1A24; outline-offset: -3px; }
      .vs-card-preview-hint { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 6px; background: rgba(28,26,36,0.45); color: #FFFFFF; font-weight: 700; font-size: 12.5px; opacity: 0; transition: opacity 0.15s ease; pointer-events: none; }
      .vs-card-preview:hover .vs-card-preview-hint,
      .vs-card-preview:focus-visible .vs-card-preview-hint { opacity: 1; }
      .vs-card-body { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 6px; }
      .vs-card-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
      .vs-card-name { display: flex; align-items: center; gap: 5px; font-weight: 700; font-size: 13.5px; color: #1C1A24; }
      .vs-card-check { flex-shrink: 0; color: #B9762E; }
      .vs-card-dim { font-size: 10.5px; color: #9C98AC; white-space: nowrap; }
      .vs-card-id { display: flex; align-items: center; gap: 5px; border: none; background: #F7F6FA; border-radius: 6px; padding: 4px 7px; font-size: 10.5px; color: #6B6680; cursor: pointer; width: fit-content; max-width: 100%; }
      .vs-card-id span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: 'IBM Plex Mono', monospace; }
      .vs-card-id:hover { background: #EDEBF2; }
      .vs-card-actions { display: flex; gap: 6px; margin-top: 2px; }

      .vs-btn { display: flex; align-items: center; justify-content: center; gap: 6px; border-radius: 10px; padding: 10px 14px; font-weight: 700; font-size: 13.5px; cursor: pointer; border: 1.5px solid transparent; transition: opacity 0.15s ease, background 0.15s ease; -webkit-tap-highlight-color: transparent; white-space: nowrap; }
      .vs-btn--primary { background: #1C1A24; color: #FFFFFF; }
      .vs-btn--primary:hover { opacity: 0.9; }
      .vs-btn--primary:disabled { opacity: 0.6; cursor: default; }
      .vs-btn--ghost { background: #F7F6FA; border-color: #E3E1EA; color: #1C1A24; }
      .vs-btn--ghost:hover { background: #EDEBF2; }
      .vs-btn--ghost:disabled { opacity: 0.6; cursor: default; }
      .vs-btn--onDark { background: rgba(255,255,255,0.12); border-color: transparent; color: #FFFFFF; }
      .vs-btn--onDark:hover { background: rgba(255,255,255,0.2); }
      .vs-btn--danger { background: #FDEEEE; border-color: #F6D8D8; color: #8E2E2E; }
      .vs-btn--danger:hover { background: #FADCDC; }
      .vs-btn--danger:disabled { opacity: 0.6; cursor: default; }
      .vs-btn--small { padding: 7px 10px; font-size: 12px; flex: 1; }
      .vs-btn:focus-visible { outline: 3px solid #1C1A24; outline-offset: 2px; }

      .vs-preview-overlay { position: fixed; inset: 0; z-index: 300; display: flex; align-items: center; justify-content: center; padding: 20px; }
      .vs-preview-scrim { position: absolute; inset: 0; background: rgba(28,26,36,0.55); }
      .vs-confirm-panel { position: relative; background: #FFFFFF; border-radius: 14px; padding: 20px; max-width: 340px; width: 100%; box-shadow: 0 20px 40px -20px rgba(28,26,36,0.5); }

      .vs-preview-panel { position: relative; background: #FFFFFF; border-radius: 16px; padding: 24px; max-width: 560px; width: 100%; max-height: 90vh; overflow-y: auto; box-shadow: 0 24px 48px -20px rgba(28,26,36,0.55); display: flex; flex-direction: column; gap: 16px; }
      .vs-preview-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      .vs-preview-close { flex-shrink: 0; width: 32px; height: 32px; border-radius: 9px; border: none; background: #F7F6FA; color: #1C1A24; display: flex; align-items: center; justify-content: center; cursor: pointer; -webkit-tap-highlight-color: transparent; }
      .vs-preview-close:hover { background: #EDEBF2; }
      .vs-preview-close:focus-visible { outline: 3px solid #1C1A24; outline-offset: 2px; }
      .vs-preview-back { padding: 8px 14px 8px 11px; font-size: 12.5px; }
      .vs-preview-canvas { width: 100%; border-radius: 12px; overflow: hidden; box-shadow: 0 12px 28px -16px rgba(28,26,36,0.4); background: #fff; }
      .vs-preview-info { display: flex; flex-direction: column; gap: 2px; }
      .vs-preview-name { margin: 0; font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 17px; color: #1C1A24; }
      .vs-preview-dim { margin: 0; font-size: 12.5px; color: #9C98AC; }
      .vs-preview-actions { display: flex; flex-wrap: wrap; gap: 8px; }
      .vs-preview-actions .vs-btn { flex: 1; min-width: 120px; }
      .vs-confirm-title { margin: 0 0 6px; font-family: 'Space Grotesk', sans-serif; font-size: 16px; color: #1C1A24; }
      .vs-confirm-text { margin: 0 0 16px; font-size: 13px; color: #6B6680; line-height: 1.5; }
      .vs-confirm-actions { display: flex; gap: 8px; }
      .vs-confirm-actions .vs-btn { flex: 1; }

      .vs-wrap--editor { border-radius: 0; }
      .vs-editor { display: flex; flex-direction: column; min-height: 560px; }
      .vs-editor-header { display: flex; align-items: center; gap: 12px; padding: 16px 18px; background: #1C1A24; }
      .vs-editor-heading { flex: 1; min-width: 0; }
      .vs-name-input { border: none; background: transparent; outline: none; font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 18px; color: #FFFFFF; width: 100%; padding: 2px 0; border-bottom: 1.5px solid transparent; }
      .vs-name-input:focus { border-bottom-color: rgba(255,255,255,0.4); }
      .vs-back { width: 34px; height: 34px; flex-shrink: 0; border-radius: 9px; border: none; background: rgba(255,255,255,0.12); color: #FFFFFF; display: flex; align-items: center; justify-content: center; cursor: pointer; -webkit-tap-highlight-color: transparent; }
      .vs-back:hover { background: rgba(255,255,255,0.2); }
      .vs-back:focus-visible { outline: 3px solid #FFFFFF; outline-offset: 2px; }

      .vs-editor-body { display: flex; flex-direction: column; flex: 1; }
      @media (min-width: 900px) { .vs-editor-body { flex-direction: row; } }

      .vs-canvas-pane { padding: 20px 18px; display: flex; flex-direction: column; gap: 10px; align-items: center; background: #FAF9FB; }
      @media (min-width: 900px) { .vs-canvas-pane { flex: 1; justify-content: center; } }
      .vs-canvas-frame { width: 100%; max-width: 560px; border-radius: 10px; overflow: hidden; box-shadow: 0 12px 28px -16px rgba(28,26,36,0.4); background: #fff; }
      .vs-canvas-hint { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 12px; color: #9C98AC; text-align: center; }

      .vs-panel { border-top: 1.5px solid #E3E1EA; background: #FFFFFF; }
       @media (min-width: 900px) { .vs-panel { flex: 1; border-top: none; border-left: 1.5px solid #E3E1EA; max-width: 50%; overflow-y: auto; } }
      .vs-panel-tabs { display: flex; border-bottom: 1.5px solid #E3E1EA; }
      .vs-tab { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 12px; border: none; background: transparent; font-weight: 700; font-size: 12.5px; color: #9C98AC; cursor: pointer; border-bottom: 2px solid transparent; }
      .vs-tab--active { color: #1C1A24; border-bottom-color: #1C1A24; }
      .vs-tab:focus-visible { outline: 3px solid #1C1A24; outline-offset: -3px; }

      .vs-panel-body { padding: 16px; }
      .vs-section-stack { display: flex; flex-direction: column; gap: 20px; }
      .vs-section-title { margin: 0 0 10px; font-size: 12px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #9C98AC; }

      .vs-section-header-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
      .vs-section-header-row .vs-section-title { margin: 0; }
      .vs-toggle-row--inline { padding: 0; flex-shrink: 0; }

      .vs-preset-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
      .vs-chip { border: 1.5px solid #E3E1EA; background: #FFFFFF; border-radius: 999px; padding: 6px 11px; font-weight: 600; font-size: 12px; color: #6B6680; cursor: pointer; }
      .vs-chip:hover { background: #F7F6FA; }
      .vs-chip--active { background: #1C1A24; border-color: #1C1A24; color: #FFFFFF; }

      .vs-field-row { display: flex; gap: 10px; }
      .vs-field-row .vs-field { flex: 1; }
      .vs-field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 10px; }
      .vs-field-label { font-size: 11.5px; font-weight: 600; color: #6B6680; }
      .vs-input { border: 1.5px solid #E3E1EA; border-radius: 8px; padding: 8px 10px; font-size: 13px; color: #1C1A24; background: #FFFFFF; outline: none; font-family: 'Inter', sans-serif; }
      .vs-input:focus { border-color: #1C1A24; }
      .vs-input--number { width: 100%; }
      .vs-number-wrap { position: relative; display: flex; align-items: center; }
      .vs-suffix { position: absolute; right: 10px; font-size: 11px; color: #9C98AC; pointer-events: none; }

      .vs-color-wrap { display: flex; align-items: center; gap: 8px; }
      .vs-color-input { width: 30px; height: 30px; border-radius: 7px; border: 1.5px solid #E3E1EA; padding: 0; cursor: pointer; background: none; }
      .vs-color-hex { font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; color: #6B6680; flex: 1; }
      .vs-color-clear { border: none; background: #F7F6FA; border-radius: 6px; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; color: #6B6680; cursor: pointer; }
      .vs-color-clear:hover { background: #EDEBF2; }

      .vs-intensity-row { display: flex; align-items: center; gap: 8px; }
      .vs-intensity-slider { flex: 1; accent-color: #1C1A24; height: 4px; cursor: pointer; }
      .vs-intensity-value { font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; color: #6B6680; width: 34px; text-align: right; flex-shrink: 0; }

      .vs-toggle-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 13px; color: #1C1A24; cursor: pointer; }
      .vs-toggle-row input { width: 16px; height: 16px; accent-color: #1C1A24; }

      .vs-element-list { display: flex; flex-direction: column; gap: 6px; }
      .vs-element-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; border: 1.5px solid #E3E1EA; background: #FFFFFF; border-radius: 9px; padding: 9px 10px; font-size: 13px; font-weight: 600; color: #1C1A24; cursor: pointer; text-align: left; }
      .vs-element-item:hover { background: #F7F6FA; }
      .vs-element-item--active { border-color: #1C1A24; background: #F7F6FA; }
      .vs-element-item input { width: 15px; height: 15px; accent-color: #1C1A24; }

      @media (prefers-reduced-motion: reduce) {
        .vs-btn, .vs-chip, .vs-card-id, .vs-card-preview-hint { transition: none; }
      }
      .vs-dep-controls {
  display: flex;
  gap: 8px;
  margin: 8px 0;
}
.vs-dep-control {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 11px;
  color: #6b6b6b;
}
.vs-dep-control input,
.vs-dep-control select {
  font-size: 12px;
  padding: 4px 6px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #fff;
}
.vs-dep-control input { width: 56px; }
.vs-dep-control--grow { flex: 1; }
.vs-dep-control--grow select { width: 100%; }

.vs-dep-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  background: #FBF3E8;
  border-radius: 8px;
  margin-bottom: 10px;
  overflow: hidden;
  padding: 0 8px;
}

.vs-preset-row--compact {
  gap: 6px;
}
.vs-chip--compact {
  font-size: 11px;
  padding: 4px 8px;
}
  .vs-dep-control--checkbox {
  flex-direction: row;
  align-items: center;
  gap: 6px;
  justify-content: center;
  padding-top: 14px; /* rough vertical alignment with the adjacent select's label row */
}
.vs-dep-control--checkbox input { width: 15px; height: 15px; accent-color: #1C1A24; margin: 0; }
.vs-layer-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vs-layer-actions { display: flex; gap: 4px; flex-shrink: 0; }
.vs-layer-btn {
  width: 24px; height: 24px; border-radius: 6px; border: none;
  background: #F7F6FA; color: #6B6680; display: flex; align-items: center; justify-content: center;
  cursor: pointer;
}
.vs-layer-btn:hover { background: #EDEBF2; color: #1C1A24; }
    `}</style>
  )
}

export default GlobalStyles