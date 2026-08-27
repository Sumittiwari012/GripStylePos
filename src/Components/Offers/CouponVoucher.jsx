import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Download,
  PlusCircle,
  Pencil,
  Trash2,
  UserPlus,
  ListChecks,
} from 'lucide-react'
import AddCoupon from './AddCoupon'
import GetCoupon from './GetCoupon/GetCoupon'
import CheckCoupon from './CheckCoupon/CheckCoupon'

// Wire each handler up to your real coupon actions (modal, API call, route, etc).
const ACTIONS = [
  {
    key: 'get',
    label: 'Get Coupon',
    sub: 'Fetch an available code',
    icon: Download,
    base: '#B9762E',
    deep: '#8F5720',
  },
  {
    key: 'add',
    label: 'Add Coupon',
    sub: 'Create a new coupon',
    icon: PlusCircle,
    base: '#2F7E72',
    deep: '#215C54',
  },
  {
    key: 'check',
    label: 'Check Coupon',
    sub: 'See created coupons',
    icon: ListChecks,
    base: '#7A5FBF',
    deep: '#5A4390',
  },
  {
    key: 'assign',
    label: 'Assign Coupon',
    sub: 'Give a coupon to a user',
    icon: UserPlus,
    base: '#3E6FB0',
    deep: '#2C5185',
  },
]

const VIEW_TITLES = {
  menu: 'Manage coupons',
  add: 'Add a new coupon',
  get: 'Available coupons',
  check: 'Created coupons',
}

const VIEW_BACK_LABELS = {
  menu: 'Offers',
  add: 'Coupon Voucher',
  get: 'Coupon Voucher',
  check: 'Coupon Voucher',
}

function CouponVoucher() {
  const navigate = useNavigate()
  const [view, setView] = useState('menu') // 'menu' | 'add' | 'get' | 'check' — no route change involved

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

  const handleAction = (key) => {
    if (key === 'add' || key === 'get' || key === 'check') {
      setView(key)
      return
    }
    console.log(`${key} tapped`)
  }

  const handleBack = () => {
    if (view !== 'menu') {
      setView('menu')
      return
    }
    navigate('/offers')
  }

  const handleCreateCoupon = (data) => {
    console.log('coupon created', data)
    setView('menu')
  }

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
      <div className={`cv-container${view === 'check' ? ' cv-container--wide' : ''}`}>
        <button type="button" onClick={handleBack} className="cv-back">
          <ArrowLeft size={18} strokeWidth={2.25} />
          {VIEW_BACK_LABELS[view]}
        </button>

        <p
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: '#8A85A0',
            margin: '18px 0 6px',
          }}
        >
          Coupon Voucher
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
          {VIEW_TITLES[view]}
        </h1>

        {view === 'add' && (
          <AddCoupon onCancel={() => setView('menu')} onSubmit={handleCreateCoupon} />
        )}

        {view === 'get' && <GetCoupon onCancel={() => setView('menu')} />}

        {view === 'check' && <CheckCoupon onCancel={() => setView('menu')} />}

        {view === 'menu' && (
          <div className="cv-action-grid">
            {ACTIONS.map(({ key, label, sub, icon: Icon, base, deep }) => (
              <button
                key={key}
                type="button"
                onClick={() => handleAction(key)}
                className="cv-action"
                style={{
                  background: `linear-gradient(155deg, ${base} 0%, ${deep} 100%)`,
                }}
              >
                <span className="cv-action__notch cv-action__notch--left" />
                <span className="cv-action__notch cv-action__notch--right" />

                <span className="cv-action__icon">
                  <Icon size={22} strokeWidth={2} color="#FFFFFF" />
                </span>

                <span className="cv-action__perf" />

                <span className="cv-action__text">
                  <span className="cv-action__label">{label}</span>
                  <span className="cv-action__sub">{sub}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <style>{`
        .cv-container {
          max-width: 640px;
          margin: 0 auto;
          width: 100%;
        }

        .cv-container--wide {
          max-width: 100%;
        }

        .cv-back {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: none;
          background: transparent;
          padding: 6px 2px;
          font-family: 'Inter', sans-serif;
          font-weight: 600;
          font-size: 14px;
          color: #1C1A24;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
        }
        .cv-back:focus-visible {
          outline: 3px solid #1C1A24;
          outline-offset: 3px;
          border-radius: 6px;
        }

        .cv-action-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
        }

        @media (min-width: 480px) {
          .cv-action-grid { grid-template-columns: repeat(2, 1fr); }
        }

        .cv-action {
          position: relative;
          border: none;
          border-radius: 16px;
          padding: 16px 14px 14px;
          min-height: 108px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: flex-start;
          text-align: left;
          cursor: pointer;
          overflow: hidden;
          box-shadow: 0 8px 20px -12px rgba(28, 26, 36, 0.4);
          transition: transform 0.16s ease, box-shadow 0.16s ease;
          -webkit-tap-highlight-color: transparent;
        }

        .cv-action:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 24px -12px rgba(28, 26, 36, 0.5);
        }

        .cv-action:active {
          transform: translateY(0) scale(0.98);
        }

        .cv-action:focus-visible {
          outline: 3px solid #1C1A24;
          outline-offset: 3px;
        }

        .cv-action__notch {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #F1F0F5;
          z-index: 2;
        }
        .cv-action__notch--left { left: -8px; }
        .cv-action__notch--right { right: -8px; }

        .cv-action__icon {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.16);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 12px;
        }

        .cv-action__perf {
          width: 100%;
          border-top: 1.5px dashed rgba(255, 255, 255, 0.4);
          margin-bottom: 10px;
        }

        .cv-action__text {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .cv-action__label {
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 700;
          font-size: 15px;
          color: #FFFFFF;
          line-height: 1.2;
        }

        .cv-action__sub {
          font-size: 12px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.72);
          line-height: 1.3;
        }

        @media (prefers-reduced-motion: reduce) {
          .cv-action { transition: none; }
        }
      `}</style>
    </div>
  )
}

export default CouponVoucher