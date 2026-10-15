'use client'

import { useCallback, useEffect, useState } from 'react'

export function useExecutiveCarousel(itemCount: number) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [pageVisible, setPageVisible] = useState(true)

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateMotion = () => setReducedMotion(motion.matches)
    const updateVisibility = () => setPageVisible(!document.hidden)

    updateMotion()
    updateVisibility()
    motion.addEventListener('change', updateMotion)
    document.addEventListener('visibilitychange', updateVisibility)

    return () => {
      motion.removeEventListener('change', updateMotion)
      document.removeEventListener('visibilitychange', updateVisibility)
    }
  }, [])

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(0, itemCount - 1)))
  }, [itemCount])

  useEffect(() => {
    if (itemCount < 2 || paused || reducedMotion || !pageVisible) return

    const timer = window.setTimeout(() => {
      setActiveIndex((current) => (current + 1) % itemCount)
    }, 8000)

    return () => window.clearTimeout(timer)
  }, [activeIndex, itemCount, pageVisible, paused, reducedMotion])

  const move = useCallback((direction: number) => {
    if (itemCount < 2) return
    setActiveIndex((current) => (current + direction + itemCount) % itemCount)
  }, [itemCount])

  return {
    activeIndex,
    move,
    progressPaused: paused || reducedMotion || !pageVisible,
    setPaused,
  }
}
