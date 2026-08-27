import React from 'react'

// -----------------------------------------------------------------------
// Ribbon layer — a decorative accent band over the voucher canvas.
// Registry-based like BackgroundPattern, so RIBBON_STYLES (picker UI)
// and the renderers can never drift apart.
//
// TO ADD A NEW RIBBON: add one entry to RIBBONS with a `render` that
// uses the `fill` prop it's given (don't hardcode a color/gradient).
// -----------------------------------------------------------------------
const RIBBONS = {
  none: {
    label: 'None',
    render: () => null,
  },

  diagonal: {
    label: 'Diagonal',
    render: ({ viewH, sx, sy, fill }) => (
      <rect
        x={112 * sx} y={-10 * sy} width={18 * sx} height={viewH + 20 * sy}
        fill={fill}
        transform={`rotate(8 ${121 * sx} ${50 * sy})`}
        opacity="0.95"
      />
    ),
  },

  diagonalThin: {
    label: 'Diagonal (thin)',
    render: ({ viewH, sx, sy, fill }) => (
      <rect
        x={116 * sx} y={-10 * sy} width={9 * sx} height={viewH + 20 * sy}
        fill={fill}
        transform={`rotate(10 ${120 * sx} ${50 * sy})`}
        opacity="0.95"
      />
    ),
  },

  double: {
    label: 'Double diagonal',
    render: ({ viewH, sx, sy, fill }) => (
      <g opacity="0.95">
        <rect x={108 * sx} y={-10 * sy} width={7 * sx} height={viewH + 20 * sy} fill={fill} transform={`rotate(8 ${112 * sx} ${50 * sy})`} />
        <rect x={122 * sx} y={-10 * sy} width={7 * sx} height={viewH + 20 * sy} fill={fill} transform={`rotate(8 ${126 * sx} ${50 * sy})`} opacity="0.6" />
      </g>
    ),
  },

  horizontal: {
    label: 'Horizontal band',
    render: ({ viewW, sy, fill }) => (
      <rect x={0} y={44 * sy} width={viewW} height={12 * sy} fill={fill} opacity="0.95" />
    ),
  },

  corner: {
    label: 'Corner banner',
    render: ({ viewW, sx, sy, fill }) => (
      <polygon
        points={`${viewW - 34 * sx},0 ${viewW},0 ${viewW},${34 * sy}`}
        fill={fill}
        opacity="0.95"
      />
    ),
  },

  edge: {
    label: 'Edge bar',
    render: ({ viewH, sx, fill }) => (
      <rect x={0} y={0} width={6 * sx} height={viewH} fill={fill} opacity="0.95" />
    ),
  },
}

// Picker list — derived from the registry, so it's always in sync.
export const RIBBON_STYLES = Object.entries(RIBBONS).map(([value, { label }]) => ({ value, label }))

export function RibbonLayer({ style, viewW, viewH, sx, sy, uid, ribbonColor }) {
  const entry = RIBBONS[style] || RIBBONS.none
  // A custom color goes on as a flat fill; otherwise fall back to the
  // existing accent → accentDark gradient already defined in <defs>.
  const fill = ribbonColor || `url(#vgrad-${uid})`
  return entry.render({ viewW, viewH, sx, sy, fill })
}

export default RibbonLayer