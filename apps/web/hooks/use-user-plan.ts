/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * use-user-plan.ts
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

import { useTRPC } from '@/trpc/client'
import { useQuery } from '@tanstack/react-query'
import { mapSystemPlanToTemplatePlan, type TemplatePlan } from '@/lib/template-utils'

export function useUserPlan() {
  const trpc = useTRPC()
  
  const { data: subscription, isLoading } = useQuery({
    ...trpc.subscription.get.queryOptions(),
    retry: 1,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
  
  // Extract plan from subscription or default to free
  const systemPlan = subscription?.plan?.name || 'free'
  const templatePlan: TemplatePlan = mapSystemPlanToTemplatePlan(systemPlan)
  
  return {
    templatePlan,
    systemPlan,
    isLoading,
    subscription,
  }
}