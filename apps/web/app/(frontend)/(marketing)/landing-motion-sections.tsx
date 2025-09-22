"use client";

import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import Hero from '@/components/marketing/hero'
import { HeroMockupSection } from '@/components/marketing/hero/hero-mockup-section'
import TemplatesBrowse from '@/components/marketing/templates-browse'

export function LandingMotionSections() {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduce(mq.matches)
    const handler = (e: MediaQueryListEvent) => setReduce(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const motionProps = (delay: number) => {
    if (reduce) return {}
    return {
      initial: { opacity: 0, y: 24 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as [number, number, number, number], delay },
    }
  }

  return (
    <>
      <motion.div {...(reduce ? {} : { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } })}>
        <Hero />
      </motion.div>
      <motion.div className="block md:hidden" {...motionProps(0.15)}>
        <HeroMockupSection />
      </motion.div>
      <motion.div id='templates-anchor' {...motionProps(0.25)}>
        <TemplatesBrowse />
      </motion.div>
      <motion.div className="hidden md:block" {...motionProps(0.35)}>
        <HeroMockupSection />
      </motion.div>
    </>
  )
}
