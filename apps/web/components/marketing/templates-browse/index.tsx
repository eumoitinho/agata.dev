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
import { Section } from '@libra/ui/components/section'
import { Avatar, AvatarFallback, AvatarImage } from '@libra/ui/components/avatar'
import { Badge } from '@libra/ui/components/badge'
import { Button } from '@libra/ui/components/button'
import { Input } from '@libra/ui/components/input'
import { Skeleton } from '@libra/ui/components/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@libra/ui/components/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@libra/ui/components/select'
import { cn } from '@libra/ui/lib/utils'
import { useTRPC } from '@/trpc/client'
import { useQuery } from '@tanstack/react-query'
import { Eye, Heart, Copy, Crown, Globe, Smartphone, Monitor, Server, Layout, Briefcase, ShoppingCart, FileText, BarChart3, Sparkles, Component as ComponentIcon, Rows, Layers, Boxes, ListChecks, FormInput, Lock } from 'lucide-react'
import { RemakeTemplateDialog } from '@/components/common/template-sharing'
import * as m from '@/paraglide/messages'
import { BrowseHeader } from './components/browse-header'
import { BrowseSidebar } from './components/browse-sidebar'

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
        'group relative overflow-hidden rounded-lg border bg-card transition-all duration-300',
        'hover:border-primary/50 hover:shadow-md hover:scale-[1.015]'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      {/* Template Thumbnail */}
  <div className="relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br from-muted/20 to-muted/40">
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
              <div className="mx-auto mb-1 h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
                <Copy className="h-5 w-5 text-primary/60" />
              </div>
              <p className="text-xs">No preview</p>
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
              {m['templateSharing.templateCard.badges.proOnly']?.()}
            </Badge>
          </div>
        )}
        
        {/* Featured badge */}
        {template.isFeatured && (
          <div className="absolute top-3 left-3">
            <Badge variant="secondary" className="bg-gradient-to-r from-blue-500 to-purple-500 text-white border-0 shadow-md">
              <Crown className="mr-1 h-3 w-3" />
              {m['templateSharing.templateCard.badges.featured']?.()}
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
            <div className="flex flex-col sm:flex-row gap-3 px-4">
              <RemakeTemplateDialog
                templateId={template.id}
                trigger={
                  <Button size="lg" className="shadow-xl min-w-32">
                    Remake
                  </Button>
                }
              />
              {template.previewUrl ? (
                <Button
                  size="lg"
                  variant="secondary"
                  className="shadow-xl min-w-32"
                  asChild
                >
                  <a
                    href={template.previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${template.title} live preview`}
                  >
                    Live
                  </a>
                </Button>
              ) : (
                <Button
                  size="lg"
                  variant="secondary"
                  className="shadow-xl min-w-32 opacity-70 cursor-not-allowed"
                  disabled
                  aria-disabled="true"
                >
                  Live
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </div>
      
      {/* Content */}
  <div className="p-3">
        {/* Template title and description */}
        <div className="mb-2">
          <h3 className="font-semibold text-foreground line-clamp-1 mb-0.5 text-sm">
            {template.title}
          </h3>
          <p className="text-xs text-muted-foreground line-clamp-2 min-h-[2rem]">
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
                {m['templateSharing.templateCard.badges.free']?.()}
              </Badge>
            )}
          </div>
        </div>
        
        {/* Stats */}
        <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border/50">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Eye className="h-3 w-3" />
            <span>{template.statsViews}</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Copy className="h-3 w-3" />
            <span>{template.statsRemakes}</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
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
    <div className="rounded-lg border bg-card overflow-hidden">
      <Skeleton className="aspect-[4/3] w-full" />
      <div className="p-3">
        <div className="mb-2">
          <Skeleton className="h-4 w-2/3 mb-1" />
          <Skeleton className="h-3 w-3/4 mb-1" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded-full" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-4 w-10" />
        </div>
        <div className="flex items-center gap-3 mt-2 pt-2">
          <Skeleton className="h-2.5 w-6" />
          <Skeleton className="h-2.5 w-6" />
          <Skeleton className="h-2.5 w-6" />
        </div>
      </div>
    </div>
  )
}

export default function TemplatesBrowse() {
  const trpc = useTRPC()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [planFilter, setPlanFilter] = useState<'all' | 'free' | 'pro'>('all')
  const [sortBy, setSortBy] = useState<'popular' | 'recent' | 'most_remakes' | 'most_views' | 'most_likes'>('popular')
  const [browseType, setBrowseType] = useState<'templates' | 'components'>('templates')
  const [activeComponent, setActiveComponent] = useState<string | null>(null)
  
  const {
    data: templatesData,
    isLoading,
    error
  } = useQuery({
    ...trpc.template.list.queryOptions({
      search: search || undefined,
      category: category === 'all' ? undefined : category,
      planFilter,
      sortBy,
      limit: 24,
      offset: 0,
    }),
    retry: 2,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
  
  const templates = templatesData?.templates || []
  
  const categories = [
    { value: 'all', label: m['templateSharing.browse.categories.all']?.(), icon: Globe },
    { value: 'web', label: m['templateSharing.browse.categories.web']?.(), icon: Globe },
    { value: 'mobile', label: m['templateSharing.browse.categories.mobile']?.(), icon: Smartphone },
    { value: 'desktop', label: m['templateSharing.browse.categories.desktop']?.(), icon: Monitor },
    { value: 'api', label: m['templateSharing.browse.categories.api']?.(), icon: Server },
    { value: 'landing', label: m['templateSharing.browse.categories.landing']?.(), icon: Layout },
    { value: 'portfolio', label: m['templateSharing.browse.categories.portfolio']?.(), icon: Briefcase },
    { value: 'ecommerce', label: m['templateSharing.browse.categories.ecommerce']?.(), icon: ShoppingCart },
    { value: 'blog', label: m['templateSharing.browse.categories.blog']?.(), icon: FileText },
    { value: 'dashboard', label: m['templateSharing.browse.categories.dashboard']?.(), icon: BarChart3 },
  ] as const

  const componentItems = [
    { key: 'hero', name: 'Hero Section', icon: Sparkles },
    { key: 'header', name: 'Header / Navbar', icon: Layers },
    { key: 'footer', name: 'Footer', icon: Rows },
    { key: 'button', name: 'Button Variants', icon: ComponentIcon },
    { key: 'card', name: 'Card Layouts', icon: Boxes },
    { key: 'pricing', name: 'Pricing Table', icon: BarChart3 },
    { key: 'testimonial', name: 'Testimonial Block', icon: ListChecks },
    { key: 'cta', name: 'Call To Action', icon: Sparkles },
    { key: 'features', name: 'Features Grid', icon: Layers },
    { key: 'faq', name: 'FAQ Section', icon: FileText },
    { key: 'auth', name: 'Auth Forms', icon: Lock },
    { key: 'forms', name: 'Form Components', icon: FormInput },
  ] as const

  const filteredComponents = componentItems
    .filter(c => (search ? c.name.toLowerCase().includes(search.toLowerCase()) : true))
    .filter(c => (activeComponent ? c.key === activeComponent : true))

  return (
    <Section id="templates" className="pt-24">
      <div className="max-w-container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header full width row */}
        <div className="mb-10">
          <BrowseHeader />
        </div>
        {/* Two-column layout below */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-12">
          <div className="lg:col-span-1 lg:sticky lg:top-28 self-start h-fit">
            <BrowseSidebar
              browseType={browseType}
              setBrowseType={setBrowseType}
              search={search}
              setSearch={setSearch}
              category={category}
              setCategory={setCategory}
              planFilter={planFilter}
              setPlanFilter={setPlanFilter}
              sortBy={sortBy}
              setSortBy={setSortBy}
              categories={categories}
              componentItems={componentItems}
              activeComponent={activeComponent}
              setActiveComponent={setActiveComponent}
              filteredComponents={filteredComponents}
            />
          </div>
          <div className="lg:col-span-3">
            {error ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">
                  Unable to load templates. Please try again later.
                </p>
              </div>
            ) : browseType === 'templates' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {isLoading || (!isLoading && templates.length === 0)
                  ? Array.from({ length: 9 }).map((_, i) => (
                      <TemplateCardSkeleton key={i} />
                    ))
                  : templates.map((template) => (
                      <TemplateCard key={template.id} template={{ ...template, createdAt: template.createdAt.toString() }} />
                    ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </Section>
  )
}