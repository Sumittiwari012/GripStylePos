import React from 'react'
import { OfferTypePage, OFFER_TYPES } from '../OfferTypePage'

export default function FlatOffPage({ onBack }) {
  return <OfferTypePage config={OFFER_TYPES.flat} onBack={onBack} />
}