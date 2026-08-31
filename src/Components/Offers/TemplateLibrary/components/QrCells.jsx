import React from 'react'
import QRCode from 'qrcode'

// -----------------------------------------------------------------------
// QR rendering — real scannable modules via the `qrcode` package.
//
// IMPORTANT: QRCode.create() is a SYNCHRONOUS, pure function of `value` —
// it does no I/O and returns immediately. The previous version wrapped it
// in useEffect/useState for no functional reason, which meant it only
// ever produced output once the component had mounted in a real browser
// and its effect had run. That breaks the export pipeline in
// CheckCoupon.jsx, which renders VoucherCanvas via
// ReactDOMServer.renderToStaticMarkup — a render path that NEVER runs
// effects. The exported SVG markup therefore always had qr=null and
// rendered nothing, even though the live on-screen preview (which does
// get to run its effect) looked correct. Computing the matrix directly
// during render — the same way the text elements already work — makes
// this component render identically whether it's mounted live or
// serialized statically for export.
export function QrCells({ value, x, y, size, color, quietZone = 1.5 }) {
  let qr = null
  try {
    qr = QRCode.create(value || ' ', { errorCorrectionLevel: 'M' })
  } catch (e) {
    qr = null
  }

  if (!qr) return null

  const n = qr.modules.size
  const data = qr.modules.data
  const total = n + quietZone * 2
  const cell = size / total
  const cells = []
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (data[row * n + col]) {
        cells.push(
          <rect
            key={`${row}-${col}`}
            x={x + (col + quietZone) * cell}
            y={y + (row + quietZone) * cell}
            width={cell}
            height={cell}
            fill={color}
          />
        )
      }
    }
  }
  return <g>{cells}</g>
}

export default QrCells