import React, { useEffect, useState } from 'react'
import QRCode from 'qrcode'

// -----------------------------------------------------------------------
// QR rendering — real scannable modules via the `qrcode` package.
// -----------------------------------------------------------------------
export function QrCells({ value, x, y, size, color, quietZone = 1.5 }) {
  const [qr, setQr] = useState(null)
  useEffect(() => {
    let cancelled = false
    try {
      const matrix = QRCode.create(value || ' ', { errorCorrectionLevel: 'M' })
      if (!cancelled) setQr(matrix)
    } catch (e) {
      if (!cancelled) setQr(null)
    }
    return () => { cancelled = true }
  }, [value])

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
