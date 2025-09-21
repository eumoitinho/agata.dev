/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * navbar.tsx
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

import { cn } from '@libra/ui/lib/utils'
import type * as React from 'react'

function Navbar({ className, ...props }: React.ComponentProps<'nav'>) {
  return (
    <nav
      data-slot='navbar'
      className={cn('flex items-center justify-between py-4', className)}
      {...props}
    />
  )
}

function NavbarLeft({ className, ...props }: React.ComponentProps<'nav'>) {
  return (
    <nav
      data-slot='navbar-left'
      className={cn('flex items-center justify-start gap-4', className)}
      {...props}
    />
  )
}

function NavbarRight({ className, ...props }: React.ComponentProps<'nav'>) {
  return (
    <nav
      data-slot='navbar-right'
      className={cn('flex items-center justify-end gap-4', className)}
      {...props}
    />
  )
}

function NavbarCenter({ className, ...props }: React.ComponentProps<'nav'>) {
  return (
    <nav
      data-slot='navbar-center'
      className={cn('flex items-center justify-center gap-4', className)}
      {...props}
    />
  )
}

export { Navbar, NavbarLeft, NavbarRight, NavbarCenter }
