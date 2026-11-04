import React from 'react'
import { OfferTypePage, OFFER_TYPES } from '../OfferTypePage'

export default function BundlePricePage({ onBack }) {
  return <OfferTypePage config={OFFER_TYPES.bundle} onBack={onBack} />
}