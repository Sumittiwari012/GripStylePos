import React from 'react'
import JsBarcode from 'jsbarcode'

// -----------------------------------------------------------------------
// Barcode rendering — CODE128 bars via jsbarcode's low-level encoder.
//
// IMPORTANT: the previous version called the public JsBarcode(svgNode, ...)
// API, which draws bars by directly mutating a REAL DOM <svg> node (and
// then reads it back via getBBox()). That only works when the component
// is actually mounted in a browser. CheckCoupon.jsx's export pipeline
// renders VoucherCanvas via ReactDOMServer.renderToStaticMarkup, which
// never creates real DOM nodes and never runs effects/refs — so
// ref.current was always null there, JsBarcode never actually drew
// anything, and the exported artwork silently had no barcode at all
// (while the live on-screen preview, which does mount for real, looked
// fine).
//
// The fix: JsBarcode.getModule(format) returns the raw Encoder class
// used internally, completely independent of any DOM. `encoder.encode()`
// returns { data, text } where `data` is a binary string (one character
// per module: '1' = bar, '0' = space) — a pure, synchronous computation.
// We turn that directly into scaled <rect> elements ourselves, mirroring
// exactly what JsBarcode's own SVGRenderer does internally (each
// consecutive run of '1's becomes one bar), just without ever touching
// the DOM. This renders identically whether mounted live or serialized
// statically for export — same as QrCells.
export function BarcodeCells({ value, x, y, width, height, color }) {
  let data = ''
  try {
    const Encoder = JsBarcode.getModule('CODE128')
    const encoder = new Encoder(value || ' ', {})
    if (encoder.valid()) {
      const encoded = encoder.encode()
      // encode() can return a single {data, text} or (for some formats)
      // an array of them — CODE128 always returns a single object, but
      // guard for the array shape just in case a future format/value
      // combination triggers it, concatenating all module strings in
      // order same as JsBarcode's own linearizeEncodings step would.
      data = Array.isArray(encoded) ? encoded.map((e) => e.data).join('') : encoded.data
    }
  } catch (e) {
    // Invalid value for the chosen format — render nothing rather than
    // crashing the canvas, same behavior as the previous implementation.
    data = ''
  }

  if (!data) return null

  const totalModules = data.length
  const fillColor = color || '#000000'
  const bars = []
  let runStart = -1

  for (let i = 0; i <= totalModules; i++) {
    const isBar = i < totalModules && data[i] === '1'
    if (isBar && runStart === -1) {
      runStart = i
    } else if (!isBar && runStart !== -1) {
      const barX = x + (runStart / totalModules) * width
      const barWidth = ((i - runStart) / totalModules) * width
      bars.push(<rect key={runStart} x={barX} y={y} width={barWidth} height={height} fill={fillColor} />)
      runStart = -1
    }
  }

  return <g>{bars}</g>
}

export default BarcodeCells