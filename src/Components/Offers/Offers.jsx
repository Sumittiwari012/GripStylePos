import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ticket, Users, Tag, Layers } from 'lucide-react'

// Signature: each card reads as a torn ticket stub — a dashed perforation
// splits the icon plate from the label, with punched notches on both edges.
const OFFERS = [
  {
    key: 'coupon',
    label: 'Coupon Voucher',
    sub: 'Redeem a code',
    icon: Ticket,
    base: '#B9762E',
    deep: '#8F5720',
  },
  {
    key: 'employee',
    label: 'Employee Discount',
    sub: 'Verified staff pricing',
    icon: Users,
    base: '#2F7E72',
    deep: '#215C54',
  },
  {
    key: 'product',
    label: 'Product Discount',
    sub: 'Marked-down items',
    icon: Tag,
    base: '#C0503C',
    deep: '#8F392B',
  },
  {
    key: 'combo',
    label: 'Combo Offer',
    sub: 'Bundle & save',
    icon: Layers,
    base: '#5B4A8A',
    deep: '#413267',
  },
]

const ROUTES = {
  coupon: '/offers/coupon',
  // employee, product, combo can point to their own routes once those pages exist
}

function Offers() {
  const navigate = useNavigate()

  const handleSelect = (key) => {
    const path = ROUTES[key]
    if (path) {
      navigate(path)
      return
    }
    console.log(`${key} tapped`)
  }

  useEffect(() => {
    const id = 'offers-font-link'
    if (!document.getElementById(id)) {
      const link = document.createElement('link')
      link.id = id
      link.rel = 'stylesheet'
      link.href =
        'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&display=swap'
      document.head.appendChild(link)
    }
  }, [])

  return (
    <div
      style={{
        background: '#F1F0F5',
        fontFamily: "'Inter', system-ui, sans-serif",
        minHeight: '100%',
        padding: '20px 16px 32px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <p
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: '#8A85A0',
            margin: '0 0 6px',
          }}
        >
          Offers
        </p>
        <h1
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 700,
            fontSize: 'clamp(22px, 5vw, 30px)',
            color: '#1C1A24',
            margin: '0 0 20px',
          }}
        >
          Pick a way to save
        </h1>

        <div
          className="offer-grid"
          style={{
            display: 'grid',
            gap: 'clamp(10px, 3vw, 16px)',
          }}
        >
          {OFFERS.map(({ key, label, sub, icon: Icon, base, deep }) => (
            <button
              key={key}
              type="button"
              onClick={() => handleSelect(key)}
              className="offer-card"
              style={{
                '--base': base,
                '--deep': deep,
                background: `linear-gradient(155deg, ${base} 0%, ${deep} 100%)`,
              }}
            >
              <span className="offer-card__notch offer-card__notch--left" />
              <span className="offer-card__notch offer-card__notch--right" />

              <span className="offer-card__icon">
                <Icon size={26} strokeWidth={2} color="#FFFFFF" />
              </span>

              <span className="offer-card__perf" />

              <span className="offer-card__text">
                <span className="offer-card__label">{label}</span>
                <span className="offer-card__sub">{sub}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <style>{`
        .offer-card {
          position: relative;
          border: none;
          border-radius: 18px;
          padding: 18px 14px 16px;
          min-height: 132px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: flex-start;
          text-align: left;
          cursor: pointer;
          overflow: hidden;
          box-shadow: 0 8px 20px -10px rgba(28, 26, 36, 0.45);
          transition: transform 0.16s ease, box-shadow 0.16s ease;
          -webkit-tap-highlight-color: transparent;
        }

        .offer-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 26px -10px rgba(28, 26, 36, 0.55);
        }

        .offer-card:active {
          transform: translateY(0) scale(0.98);
        }

        .offer-card:focus-visible {
          outline: 3px solid #1C1A24;
          outline-offset: 3px;
        }

        .offer-card__notch {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #F1F0F5;
          z-index: 2;
        }
        .offer-card__notch--left { left: -9px; }
        .offer-card__notch--right { right: -9px; }

        .offer-card__icon {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.16);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 14px;
        }

        .offer-card__perf {
          width: 100%;
          border-top: 1.5px dashed rgba(255, 255, 255, 0.4);
          margin-bottom: 12px;
        }

        .offer-card__text {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .offer-card__label {
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 700;
          font-size: clamp(14px, 3.6vw, 16px);
          color: #FFFFFF;
          line-height: 1.2;
        }

        .offer-card__sub {
          font-size: 12px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.72);
          line-height: 1.3;
        }

        .offer-grid {
          grid-template-columns: 1fr;
        }

        @media (min-width: 480px) {
          .offer-card { min-height: 150px; padding: 20px 16px 18px; }
          .offer-grid { grid-template-columns: repeat(2, 1fr); }
        }

        @media (prefers-reduced-motion: reduce) {
          .offer-card { transition: none; }
        }
      `}</style>
    </div>
  )
}

export default Offers