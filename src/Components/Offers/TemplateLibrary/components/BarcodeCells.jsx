import React, { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'

export function BarcodeCells({ value, x, y, width, height, color }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!ref.current) return
    try {
      // Clear any previous render + attrs so getBBox below reflects
      // only this call's bars, not a stale viewBox from last time.
      while (ref.current.firstChild) ref.current.removeChild(ref.current.firstChild)
      ref.current.removeAttribute('viewBox')

      JsBarcode(ref.current, value || ' ', {
        format: 'CODE128',
        width: 2,
        height: 100,
        displayValue: false,
        margin: 0,
        background: 'transparent',
        lineColor: color || '#000000',
      })

      // Don't trust the width/height JsBarcode writes onto the root
      // <svg> — it can reserve extra space beyond the actual bars
      // (a known quirk, even with margin:0 / displayValue:false).
      // getBBox() gives the true ink extent of what's drawn, so
      // scaling from that crops out the dead whitespace instead of
      // stretching it into our box alongside the real bars.
      const bbox = ref.current.getBBox()
      if (bbox.width && bbox.height) {
        ref.current.setAttribute('viewBox', `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`)
      }
      ref.current.setAttribute('preserveAspectRatio', 'none')
      ref.current.setAttribute('x', x)
      ref.current.setAttribute('y', y)
      ref.current.setAttribute('width', width)
      ref.current.setAttribute('height', height)
    } catch (e) {
      // Invalid value for the chosen format — leave it empty rather
      // than crashing the canvas.
    }
  }, [value, x, y, width, height, color])

  return <svg ref={ref} x={x} y={y} width={width} height={height} />
}

export default BarcodeCells