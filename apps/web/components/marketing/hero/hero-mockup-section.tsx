/*
 * Split mockup section out of main Hero for flexible ordering
 */
'use client'

import { Section } from '@libra/ui/components/section'
import { HeroMockup } from './hero-mockup'
import type { HeroProps } from './types'
import { cn } from '@libra/ui/lib/utils'
import { useEffect, useRef, useState } from 'react'

interface HeroMockupSectionProps {
  mockup?: HeroProps['mockup']
  className?: string
}

export function HeroMockupSection({ mockup, className }: HeroMockupSectionProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setVisible(true)
            observer.disconnect()
          }
        })
      },
      { root: null, rootMargin: '0px 0px -15% 0px', threshold: 0.15 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <Section className={cn('overflow-hidden pt-0', className)}>
      <div ref={ref} className='max-w-container mx-auto px-4 sm:px-6 lg:px-8 relative'>
        <div className='flex justify-center min-h-[200px] relative'>
          {visible ? (
            <div className='w-full relative'>
              <HeroMockup mockup={mockup} />
              {/* Translucent gradient overlay now lives over the mockup */}
              <div className='pointer-events-none absolute inset-0 bg-gradient-to-b from-background/0 via-background/0 to-background/80' />
            </div>
          ) : (
            <div className='h-[300px] w-full rounded-xl border bg-muted/20 animate-pulse relative'>
              <div className='pointer-events-none absolute inset-0 bg-gradient-to-b from-background/0 via-background/0 to-background/80' />
            </div>
          )}
        </div>
      </div>
    </Section>
  )
}
