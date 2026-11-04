import React from 'react'
import { OfferTypePage, OFFER_TYPES } from '../OfferTypePage'

export default function BxgyPage({ onBack }) {
  return <OfferTypePage config={OFFER_TYPES.bxgy} onBack={onBack} />
}