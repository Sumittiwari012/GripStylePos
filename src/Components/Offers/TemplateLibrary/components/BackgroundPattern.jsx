import React from 'react'

// -----------------------------------------------------------------------
// Every pattern lives in the PATTERNS registry below as a small render
// function keyed by its `value`. PATTERN_STYLES is just the {value, label}
// list used to build the picker UI — it's derived from the registry so
// the two can never drift out of sync.
//
// Each pattern also carries a `defaultOpacity` — the subtle intensity it
// was originally tuned at. When the person picks a custom pattern color,
// BackgroundPattern() below auto-boosts opacity so the color actually
// reads as vibrant instead of getting washed out by that low default.
// The person can still override the exact intensity via the slider in
// CanvasPanel, which always wins over the auto-boost.
//
// TO ADD A NEW PATTERN: add one entry to PATTERNS, with a `render` that
// uses the `opacity` prop it's given (don't hardcode opacity="0.1" etc).
// -----------------------------------------------------------------------
const PATTERNS = {
  none: {
    label: 'None',
    defaultOpacity: 0,
    render: () => null,
  },

  texture: {
    label: 'Polygon texture',
    defaultOpacity: 0.12,
    render: ({ viewH, sx, sy, colors, opacity }) => (
      <g opacity={opacity}>
        <polygon points={`0,0 ${60 * sx},0 ${30 * sx},${38 * sy}`} fill={colors.accent} />
        <polygon points={`${60 * sx},0 ${100 * sx},0 ${70 * sx},${30 * sy} ${40 * sx},${20 * sy}`} fill={colors.accent} opacity="0.66" />
        <polygon points={`0,${38 * sy} ${30 * sx},${38 * sy} ${10 * sx},${viewH} 0,${viewH}`} fill={colors.accentDark} opacity="0.66" />
        <polygon points={`${10 * sx},${viewH} ${60 * sx},${viewH} ${30 * sx},${60 * sy}`} fill={colors.accent} opacity="0.83" />
      </g>
    ),
  },

  diagonals: {
    label: 'Diagonal stripes',
    defaultOpacity: 0.15,
    render: ({ viewH, sx, sy, colors, opacity }) => (
      <g opacity={opacity}>
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={i} x={i * 20 * sx - 10} y={-10 * sy} width={8 * sx} height={viewH + 20 * sy}
            fill={colors.accent} transform={`rotate(20 ${i * 20 * sx} ${viewH / 2})`} />
        ))}
      </g>
    ),
  },

  triangles: {
    label: 'Triangles',
    defaultOpacity: 0.12,
    render: ({ sx, sy, colors, opacity }) => (
      <g opacity={opacity}>
        {[0, 1, 2, 3, 4].map((i) => (
          <polygon key={i}
            points={`${i * 25 * sx},0 ${i * 25 * sx + 20 * sx},0 ${i * 25 * sx + 10 * sx},${25 * sy}`}
            fill={colors.accentDark} />
        ))}
      </g>
    ),
  },

  circles: {
    label: 'Circles',
    defaultOpacity: 0.12,
    render: ({ sx, sy, colors, opacity }) => (
      <g opacity={opacity}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <circle key={i} cx={(i * 18 + 8) * sx} cy={15 * sy} r={6 * Math.min(sx, sy)} fill={colors.accent} />
        ))}
      </g>
    ),
  },

  chevron: {
    label: 'Chevron',
    defaultOpacity: 0.12,
    render: ({ sx, sy, colors, opacity }) => (
      <g opacity={opacity}>
        {[0, 1, 2, 3].map((i) => (
          <polygon key={i} points={`0,${i * 15 * sy} ${15 * sx},${(i * 15 + 7.5) * sy} 0,${(i * 15 + 15) * sy}`}
            fill={colors.accentDark} />
        ))}
      </g>
    ),
  },

  waves: {
    label: 'Waves',
    defaultOpacity: 0.14,
    render: ({ viewW, sx, sy, colors, opacity }) => {
      const rows = 4
      const amp = 4 * sy
      const rowH = 12 * sy
      return (
        <g opacity={opacity} fill="none" stroke={colors.accent} strokeWidth={1.2}>
          {Array.from({ length: rows }).map((_, r) => {
            const y = r * rowH + 8 * sy
            let d = `M0,${y}`
            for (let x = 0; x <= viewW; x += 10 * sx) {
              d += ` Q${x + 5 * sx},${y - amp} ${x + 10 * sx},${y}`
            }
            return <path key={r} d={d} />
          })}
        </g>
      )
    },
  },

  hexagons: {
    label: 'Hexagons',
    defaultOpacity: 0.1,
    render: ({ sx, sy, colors, opacity }) => {
      const hex = (cx, cy, r) =>
        Array.from({ length: 6 })
          .map((_, i) => {
            const a = (Math.PI / 3) * i
            return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`
          })
          .join(' ')
      const r = 7 * Math.min(sx, sy)
      const cells = []
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 6; col++) {
          const cx = (col * 18 + (row % 2 ? 9 : 0)) * sx
          const cy = row * 14 * sy
          cells.push(<polygon key={`${row}-${col}`} points={hex(cx, cy, r)} fill={colors.accentDark} />)
        }
      }
      return <g opacity={opacity}>{cells}</g>
    },
  },

  dotsGrid: {
    label: 'Dot grid',
    defaultOpacity: 0.16,
    render: ({ sx, sy, colors, opacity }) => {
      const dots = []
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 10; col++) {
          dots.push(
            <circle key={`${row}-${col}`} cx={col * 14 * sx} cy={row * 12 * sy}
              r={1.3 * Math.min(sx, sy)} fill={colors.accent} />
          )
        }
      }
      return <g opacity={opacity}>{dots}</g>
    },
  },

  checkerboard: {
    label: 'Checkerboard',
    defaultOpacity: 0.08,
    render: ({ sx, sy, colors, opacity }) => {
      const size = 10
      const squares = []
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 14; col++) {
          if ((row + col) % 2 === 0) continue
          squares.push(
            <rect key={`${row}-${col}`} x={col * size * sx} y={row * size * sy}
              width={size * sx} height={size * sy} fill={colors.accentDark} />
          )
        }
      }
      return <g opacity={opacity}>{squares}</g>
    },
  },

  crosshatch: {
    label: 'Crosshatch',
    defaultOpacity: 0.1,
    render: ({ viewW, viewH, sx, sy, colors, opacity }) => (
      <g opacity={opacity} stroke={colors.accentDark} strokeWidth={0.8}>
        {Array.from({ length: 14 }).map((_, i) => (
          <line key={`a-${i}`} x1={i * 16 * sx} y1={0} x2={i * 16 * sx - viewH} y2={viewH} />
        ))}
        {Array.from({ length: 14 }).map((_, i) => (
          <line key={`b-${i}`} x1={i * 16 * sx} y1={0} x2={i * 16 * sx + viewH} y2={viewH} />
        ))}
      </g>
    ),
  },

  stars: {
    label: 'Stars',
    defaultOpacity: 0.14,
    render: ({ sx, sy, colors, opacity }) => {
      const star = (cx, cy, s) =>
        `${cx},${cy - s} ${cx + s * 0.25},${cy - s * 0.25} ${cx + s},${cy} ${cx + s * 0.25},${cy + s * 0.25} ${cx},${cy + s} ${cx - s * 0.25},${cy + s * 0.25} ${cx - s},${cy} ${cx - s * 0.25},${cy - s * 0.25}`
      const stars = []
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 6; col++) {
          const cx = (col * 20 + (row % 2 ? 10 : 0)) * sx
          const cy = row * 16 * sy + 8 * sy
          stars.push(<polygon key={`${row}-${col}`} points={star(cx, cy, 4 * Math.min(sx, sy))} fill={colors.accent} />)
        }
      }
      return <g opacity={opacity}>{stars}</g>
    },
  },

  plusGrid: {
    label: 'Plus grid',
    defaultOpacity: 0.12,
    render: ({ sx, sy, colors, opacity }) => {
      const cells = []
      for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 9; col++) {
          const cx = col * 15 * sx
          const cy = row * 14 * sy
          cells.push(
            <g key={`${row}-${col}`} fill={colors.accentDark}>
              <rect x={cx - 3.5 * sx} y={cy - 1 * sy} width={7 * sx} height={2 * sy} />
              <rect x={cx - 1 * sx} y={cy - 3.5 * sy} width={2 * sx} height={7 * sy} />
            </g>
          )
        }
      }
      return <g opacity={opacity}>{cells}</g>
    },
  },

  confetti: {
    label: 'Confetti',
    defaultOpacity: 0.18,
    render: ({ viewW, viewH, sx, sy, colors, opacity }) => {
      // Deterministic pseudo-random scatter (same seed every render).
      const seeded = (i) => ((i * 9301 + 49297) % 233280) / 233280
      const pieces = Array.from({ length: 40 }).map((_, i) => {
        const x = seeded(i) * viewW
        const y = seeded(i + 100) * viewH
        const rot = seeded(i + 200) * 360
        const color = i % 2 === 0 ? colors.accent : colors.accentDark
        return (
          <rect key={i} x={x} y={y} width={3 * sx} height={5 * sy}
            fill={color} transform={`rotate(${rot} ${x} ${y})`} />
        )
      })
      return <g opacity={opacity}>{pieces}</g>
    },
  },

  verticalStripes: {
    label: 'Vertical stripes',
    defaultOpacity: 0.1,
    render: ({ viewH, sx, colors, opacity }) => (
      <g opacity={opacity}>
        {Array.from({ length: 10 }).map((_, i) => (
          <rect key={i} x={i * 20 * sx} y={0} width={8 * sx} height={viewH} fill={colors.accent} />
        ))}
      </g>
    ),
  },

  horizontalStripes: {
    label: 'Horizontal stripes',
    defaultOpacity: 0.1,
    render: ({ viewW, sy, colors, opacity }) => (
      <g opacity={opacity}>
        {Array.from({ length: 8 }).map((_, i) => (
          <rect key={i} x={0} y={i * 13 * sy} width={viewW} height={5 * sy} fill={colors.accentDark} />
        ))}
      </g>
    ),
  },

  zigzag: {
    label: 'Zigzag',
    defaultOpacity: 0.14,
    render: ({ viewW, sx, sy, colors, opacity }) => {
      const rows = 5
      const amp = 5 * sy
      return (
        <g opacity={opacity} fill="none" stroke={colors.accent} strokeWidth={1.2}>
          {Array.from({ length: rows }).map((_, r) => {
            const baseY = r * 14 * sy + 6 * sy
            let d = `M0,${baseY}`
            let up = true
            for (let x = 0; x <= viewW; x += 8 * sx) {
              d += ` L${x},${up ? baseY - amp : baseY + amp}`
              up = !up
            }
            return <path key={r} d={d} />
          })}
        </g>
      )
    },
  },

  arcs: {
    label: 'Arcs',
    defaultOpacity: 0.12,
    render: ({ viewW, sx, sy, colors, opacity }) => (
      <g opacity={opacity} fill="none" stroke={colors.accentDark} strokeWidth={1.5}>
        {Array.from({ length: 6 }).map((_, i) => (
          <path key={i} d={`M${i * 20 * sx},${20 * sy} A10,10 0 0 1 ${i * 20 * sx + 20 * sx},${20 * sy}`} />
        ))}
      </g>
    ),
  },

  diamonds: {
    label: 'Diamonds',
    defaultOpacity: 0.1,
    render: ({ sx, sy, colors, opacity }) => {
      const items = []
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 8; col++) {
          const cx = (col * 16 + (row % 2 ? 8 : 0)) * sx
          const cy = row * 14 * sy
          const s = 5 * Math.min(sx, sy)
          items.push(
            <polygon key={`${row}-${col}`}
              points={`${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}`}
              fill={colors.accent} />
          )
        }
      }
      return <g opacity={opacity}>{items}</g>
    },
  },

  bricks: {
    label: 'Bricks',
    defaultOpacity: 0.12,
    render: ({ sx, sy, colors, opacity }) => {
      const w = 20
      const h = 8
      const lines = []
      for (let row = 0; row < 8; row++) {
        const offset = row % 2 ? w / 2 : 0
        for (let col = -1; col < 11; col++) {
          lines.push(
            <rect key={`${row}-${col}`}
              x={(col * w + offset) * sx} y={row * h * sy}
              width={w * sx - 1.5} height={h * sy - 1.5}
              fill="none" stroke={colors.accentDark} strokeWidth={0.8} />
          )
        }
      }
      return <g opacity={opacity}>{lines}</g>
    },
  },

  sparkle: {
    label: 'Sparkle',
    defaultOpacity: 0.14,
    render: ({ sx, sy, colors, opacity }) => {
      const items = []
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 7; col++) {
          const cx = (col * 18 + (row % 2 ? 9 : 0)) * sx
          const cy = row * 16 * sy + 8 * sy
          const s = 4 * Math.min(sx, sy)
          items.push(
            <path key={`${row}-${col}`}
              d={`M${cx},${cy - s} L${cx + 1},${cy - 1} L${cx + s},${cy} L${cx + 1},${cy + 1} L${cx},${cy + s} L${cx - 1},${cy + 1} L${cx - s},${cy} L${cx - 1},${cy - 1} Z`}
              fill={colors.accent} />
          )
        }
      }
      return <g opacity={opacity}>{items}</g>
    },
  },
}

// Picker list — derived from the registry, so it's always in sync.
export const PATTERN_STYLES = Object.entries(PATTERNS).map(([value, { label }]) => ({ value, label }))

// The subtle opacity a pattern was tuned at, before any custom-color boost
// or manual override. Used by CanvasPanel to show a sensible slider value.
export function getDefaultOpacity(style) {
  return (PATTERNS[style] || PATTERNS.none).defaultOpacity
}

export function BackgroundPattern({ style, viewW, viewH, sx, sy, colors, patternColor, customOpacity }) {
  const entry = PATTERNS[style] || PATTERNS.none

  // Every pattern above reads colors.accent / colors.accentDark internally.
  // Overriding both here — rather than inside each pattern — means a new
  // pattern automatically respects the custom color with zero extra code.
  const resolvedColors = patternColor
    ? { ...colors, accent: patternColor, accentDark: patternColor }
    : colors

  // Patterns are tuned to be subtle against the default accent/accentDark
  // tones. A vibrant custom color at that same low opacity reads as washed
  // out, so auto-boost intensity when a custom color is set. The manual
  // slider (customOpacity) always wins when the person has set one.
  const autoOpacity = patternColor ? Math.max(entry.defaultOpacity, 0.55) : entry.defaultOpacity
  const opacity = customOpacity != null ? customOpacity : autoOpacity

  return entry.render({ viewW, viewH, sx, sy, colors: resolvedColors, opacity })
}