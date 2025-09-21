/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * LogoImage.tsx
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

import Image from 'next/image'
import * as m from '@/paraglide/messages'

export const Logo = () => {
    return (
        <div className='h-[56px] aspect-square flex items-center justify-center'>
            <Image
                src='/logo.svg'
                alt={m['logo.alt']()}
                width={56}
                height={42}
                className='block dark:hidden object-contain transition-opacity duration-300'
                priority
            />
            <Image
                src='/logo-dark.svg'
                alt={m['logo.alt']()}
                width={56}
                height={42}
                className='hidden dark:block object-contain transition-opacity duration-300'
                priority
            />
        </div>
    )
}

export const LogoLarge = () => {
    return (
        <div className='h-[112px] aspect-square flex items-center justify-center'>
            <Image
                src='/logo.svg'
                alt={m['logo.alt']()}
                width={112}
                height={84}
                className='block dark:hidden object-contain transition-opacity duration-300'
                priority
            />
            <Image
                src='/logo-dark.svg'
                alt={m['logo.alt']()}
                width={112}
                height={84}
                className='hidden dark:block object-contain transition-opacity duration-300'
                priority
            />
        </div>
    )
}
export const LogoHero = () => {
    return (
        <div className='h-[84px] aspect-square flex items-center justify-center'>
            <Image
                src='/logo.svg'
                alt={m['logo.alt']()}
                width={72}
                height={54}
                className='block dark:hidden object-contain transition-opacity duration-300'
                priority
            />
            <Image
                src='/logo-dark.svg'
                alt={m['logo.alt']()}
                width={72}
                height={54}
                className='hidden dark:block object-contain transition-opacity duration-300'
                priority
            />
        </div>
    )
}
