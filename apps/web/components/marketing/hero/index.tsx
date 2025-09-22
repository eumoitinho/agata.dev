/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * index.tsx
 * Copyright (C) 2025 Nextify Limited
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 */

'use client'

import { Section } from '@libra/ui/components/section'
import { cn } from '@libra/ui/lib/utils'
import { AppDescriptionForm } from './app-description-form'
import { HeroHeader } from './hero-header'
import type { HeroProps } from './types'
import { Button } from '@libra/ui/components/button'
import { ArrowDown } from 'lucide-react'

/**
 * Main Hero component that integrates all subcomponents
 */
export default function Hero({ title, description, mockup, badge, buttons, className }: HeroProps) {

  return (
    <Section className={cn('overflow-hidden pb-0', className)}>
      <div className='max-w-container mx-auto flex flex-col gap-4 sm:gap-5 md:gap-6 px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 md:pt-8'>
        <div className='flex flex-col items-center gap-3 text-center sm:gap-4'>
          <HeroHeader title={title} description={description} badge={badge} />

          <AppDescriptionForm
          />

          {/* Único botão: Scroll para templates */}
          <div className="mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const el = document.getElementById('templates') || document.getElementById('templates-anchor')
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
              }}
              className="gap-1 group"
            >
              <ArrowDown className="h-4 w-4 transition-transform group-hover:translate-y-0.5" />
              <span>Explorar templates</span>
            </Button>
          </div>

          {/* Mockup moved to separate HeroMockupSection component for flexible ordering */}
        </div>
      </div>
    </Section>
  )
}
