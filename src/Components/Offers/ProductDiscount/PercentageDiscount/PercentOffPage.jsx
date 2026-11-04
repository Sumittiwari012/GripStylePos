import React from 'react'
import { OfferTypePage, OFFER_TYPES } from '../OfferTypePage'

export default function PercentOffPage({ onBack }) {
  return <OfferTypePage config={OFFER_TYPES.percent} onBack={onBack} />
}