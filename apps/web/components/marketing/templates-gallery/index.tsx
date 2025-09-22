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

import { useState } from 'react'
import { motion } from 'motion/react'
import Image from 'next/image'
import Link from 'next/link'
import { Section } from '@libra/ui/components/section'
import { Avatar, AvatarFallback, AvatarImage } from '@libra/ui/components/avatar'
import { Badge } from '@libra/ui/components/badge'
import { Button } from '@libra/ui/components/button'
import { Skeleton } from '@libra/ui/components/skeleton'
import { cn } from '@libra/ui/lib/utils'
import { useTRPC } from '@/trpc/client'
import { useQuery } from '@tanstack/react-query'
import { Eye, Heart, Copy, Crown, Zap } from 'lucide-react'
import { RemakeTemplateDialog } from '@/components/common/template-sharing'
import * as m from '@/paraglide/messages'

interface TemplateCardProps {
  template: {
    id: string
    title: string
    description: string | null
    thumbnailUrl: string | null
    previewUrl: string | null
    category: string
    creatorPlanAtShare: 'free' | 'ultra' | 'business'
    statsViews: number
    statsRemakes: number
    statsLikes: number
    isFeatured: boolean
    createdAt: string
    creatorUserId: string
    creatorOrganizationId: string
  }
}

function TemplateCard({ template }: TemplateCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  
  // For now, we'll use placeholder creator info until we have user data
  const creatorName = `User ${template.creatorUserId.slice(0, 8)}`
  const creatorInitials = creatorName.split(' ').map(n => n[0]).join('')
  
  const isPlanRestricted = template.creatorPlanAtShare !== 'free'
  
  return (
    <motion.div
      className={cn(
        'group relative overflow-hidden rounded-xl border bg-card transition-all duration-300',
        'hover:border-primary/50 hover:shadow-lg hover:scale-[1.02]'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      {/* Template Thumbnail */}
      <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-muted/20 to-muted/40">
        {template.thumbnailUrl ? (
          <Image
            src={template.thumbnailUrl}
            alt={`${template.title} preview`}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-muted-foreground">
              <div className="mx-auto mb-2 h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Copy className="h-6 w-6 text-primary/60" />
              </div>
              <p className="text-sm">No preview</p>
            </div>
          </div>
        )}
        
        {/* Hover overlay */}
        {isHovered && (
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          />
        )}
        
        {/* Plan restriction badge */}
        {isPlanRestricted && (
          <div className="absolute top-3 right-3">
            <Badge variant="secondary" className="bg-gradient-to-r from-orange-500 to-amber-500 text-white border-0 shadow-md">
              <Crown className="mr-1 h-3 w-3" />
              {m.templatesharing_templatecard_badges_proonly3()}
            </Badge>
          </div>
        )}
        
        {/* Featured badge */}
        {template.isFeatured && (
          <div className="absolute top-3 left-3">
            <Badge variant="secondary" className="bg-gradient-to-r from-blue-500 to-purple-500 text-white border-0 shadow-md">
              <Zap className="mr-1 h-3 w-3" />
              {m.templatesharing_templatecard_badges_featured2()}
            </Badge>
          </div>
        )}
        
        {/* Action button on hover */}
        {isHovered && (
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, delay: 0.1 }}
          >
            <RemakeTemplateDialog
              templateId={template.id}
              trigger={
                <Button size="lg" className="shadow-xl">
                  {m.templatesharing_templatecard_actions_usetemplate3()}
                </Button>
              }
            />
          </motion.div>
        )}
      </div>
      
      {/* Content */}
      <div className="p-4">
        {/* Template title and description */}
        <div className="mb-3">
          <h3 className="font-semibold text-foreground line-clamp-1 mb-1">
            {template.title}
          </h3>
          <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
            {template.description || 'No description available'}
          </p>
        </div>
        
        {/* Creator info */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6">
              <AvatarImage src="" alt={creatorName} />
              <AvatarFallback className="text-xs bg-primary/10">
                {creatorInitials}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm text-muted-foreground truncate">
              {creatorName}
            </span>
          </div>
          
          {/* Plan badge */}
          <div className="flex items-center gap-1">
            {isPlanRestricted ? (
              <Badge variant="outline" className="text-xs border-orange-200 text-orange-700 bg-orange-50">
                Pro
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs border-green-200 text-green-700 bg-green-50">
                {m.templatesharing_templatecard_badges_free2()}
              </Badge>
            )}
          </div>
        </div>
        
        {/* Stats */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/50">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Eye className="h-3 w-3" />
            <span>{template.statsViews}</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Copy className="h-3 w-3" />
            <span>{template.statsRemakes}</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Heart className="h-3 w-3" />
            <span>{template.statsLikes}</span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function TemplateCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <Skeleton className="aspect-video w-full" />
      <div className="p-4">
        <div className="mb-3">
          <Skeleton className="h-5 w-3/4 mb-2" />
          <Skeleton className="h-4 w-full mb-1" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-6 rounded-full" />
            <Skeleton className="h-4 w-20" />
          </div>
          <Skeleton className="h-5 w-12" />
        </div>
        <div className="flex items-center gap-4 mt-3 pt-3">
          <Skeleton className="h-3 w-8" />
          <Skeleton className="h-3 w-8" />
          <Skeleton className="h-3 w-8" />
        </div>
      </div>
    </div>
  )
}

interface TemplatesGalleryProps {
  title?: string
  description?: string
  showHeader?: boolean
  limit?: number
  className?: string
}

export default function TemplatesGallery({
  title = m.templatesharing_gallery_title1(),
  description = m.templatesharing_gallery_description1(),
  showHeader = true,
  limit = 6,
  className,
}: TemplatesGalleryProps) {
  const trpc = useTRPC()
  
  const {
    data: templatesData,
    isLoading,
    error
  } = useQuery({
    ...trpc.template.featured.queryOptions({ limit }),
    retry: 2,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
  
  if (error) {
    return (
      <Section className={className}>
        <div className="max-w-container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              Unable to load templates. Please try again later.
            </p>
          </div>
        </div>
      </Section>
    )
  }
  
  const templates = templatesData || []
  
  return (
    <Section className={className}>
      <div className="max-w-container mx-auto px-4 sm:px-6 lg:px-8">
        {showHeader && (
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl mb-4">
              {title}
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {description}
            </p>
          </div>
        )}
        
        {/* Templates grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {isLoading
            ? Array.from({ length: limit }).map((_, i) => (
                <TemplateCardSkeleton key={i} />
              ))
            : templates.map((template) => (
                <TemplateCard key={template.id} template={template} />
              ))
          }
        </div>
        
        {/* View all button */}
        {templates.length > 0 && (
          <div className="text-center">
            <Button asChild variant="outline" size="lg">
              <Link href="/browse">
                {m.templatesharing_gallery_browseall2()}
              </Link>
            </Button>
          </div>
        )}
        
        {/* Empty state */}
        {!isLoading && templates.length === 0 && (
          <div className="text-center py-12">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Copy className="h-8 w-8 text-primary/60" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {m.templatesharing_gallery_notemplates2()}
            </h3>
            <p className="text-muted-foreground">
              Be the first to share a template with the community!
            </p>
          </div>
        )}
      </div>
    </Section>
  )
}