import { Tabs, TabsList, TabsTrigger } from '@libra/ui/components/tabs'
import { Input } from '@libra/ui/components/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@libra/ui/components/select'
import { Badge } from '@libra/ui/components/badge'
import { Skeleton } from '@libra/ui/components/skeleton'
import { cn } from '@libra/ui/lib/utils'
import { Search, Filter, Component as ComponentIcon } from 'lucide-react'
import * as m from '@/paraglide/messages'
import { ComponentType } from 'react'

interface CategoryItem {
  value: string
  label: string | undefined
  icon: ComponentType<{ className?: string }>
}

interface ComponentItem {
  key: string
  name: string
  icon: ComponentType<{ className?: string }>
}

export interface BrowseSidebarProps {
  browseType: 'templates' | 'components'
  setBrowseType: (v: 'templates' | 'components') => void
  search: string
  setSearch: (v: string) => void
  category: string
  setCategory: (v: string) => void
  planFilter: 'all' | 'free' | 'pro'
  setPlanFilter: (v: 'all' | 'free' | 'pro') => void
  sortBy: 'popular' | 'recent' | 'most_remakes' | 'most_views' | 'most_likes'
  setSortBy: (v: 'popular' | 'recent' | 'most_remakes' | 'most_views' | 'most_likes') => void
  categories: readonly CategoryItem[]
  componentItems: readonly ComponentItem[]
  activeComponent: string | null
  setActiveComponent: (k: string | null) => void
  filteredComponents: { key: string; name?: string; icon?: ComponentType<{ className?: string }> | null }[]
}

export function BrowseSidebar(props: BrowseSidebarProps) {
  const {
    browseType,
    setBrowseType,
    search,
    setSearch,
    category,
    setCategory,
    planFilter,
    setPlanFilter,
    sortBy,
    setSortBy,
    categories,
    componentItems,
    activeComponent,
    setActiveComponent,
    filteredComponents
  } = props

  return (
    <div className="sticky top-24 space-y-6">
      <div>
        <Tabs value={browseType} onValueChange={(value) => setBrowseType(value as any)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="templates" className="text-xs">
              {m['templateSharing.browse.tabs.templates']?.()}
            </TabsTrigger>
            <TabsTrigger value="components" className="text-xs">
              {m['templateSharing.browse.tabs.components']?.()}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={m['templateSharing.browse.searchPlaceholder']?.()}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {browseType === 'templates' ? (
        <div>
          <h3 className="font-semibold text-sm text-foreground mb-3 flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Categories
          </h3>
          <div className="space-y-2">
            {categories.map((cat) => {
              const Icon = cat.icon
              return (
                <button
                  key={cat.value}
                  onClick={() => setCategory(cat.value)}
                  className={cn(
                    'w-full flex items-center gap-2 text-left px-3 py-2 text-sm rounded-md transition-colors',
                    category === cat.value
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  <Icon className="h-4 w-4 opacity-80" />
                  <span className="truncate">{cat.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div>
          <h3 className="font-semibold text-sm text-foreground mb-3 flex items-center gap-2">
            <ComponentIcon className="h-4 w-4" />
            Components
          </h3>
          <div className="space-y-2 min-h-[200px]">
            {(filteredComponents.length === 0
              ? Array.from({ length: 6 }).map((_, i) => ({ key: `sk-${i}`, name: undefined, icon: null }))
              : componentItems
            ).map(item => {
              if (!item.name) {
                return (
                  <div key={item.key} className="w-full h-8 rounded-md bg-muted/60 animate-pulse" />
                )
              }
              const Icon = item.icon
              const active = activeComponent === item.key
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveComponent(active ? null : item.key)}
                  className={cn(
                    'w-full flex items-center gap-2 text-left px-3 py-2 text-sm rounded-md transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  <Icon className="h-4 w-4 opacity-80" />
                  <span className="truncate">{item.name}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div>
        <h3 className="font-semibold text-sm text-foreground mb-3">
          Plan Type
        </h3>
        <Select value={planFilter} onValueChange={(value: any) => setPlanFilter(value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{m['templateSharing.browse.planFilters.all']?.()}</SelectItem>
            <SelectItem value="free">{m['templateSharing.browse.planFilters.free']?.()}</SelectItem>
            <SelectItem value="pro">{m['templateSharing.browse.planFilters.pro']?.()}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <h3 className="font-semibold text-sm text-foreground mb-3">
          Sort By
        </h3>
        <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="popular">{m['templateSharing.browse.sortBy.popular']?.()}</SelectItem>
            <SelectItem value="recent">{m['templateSharing.browse.sortBy.recent']?.()}</SelectItem>
            <SelectItem value="most_remakes">{m['templateSharing.browse.sortBy.mostRemakes']?.()}</SelectItem>
            <SelectItem value="most_views">{m['templateSharing.browse.sortBy.mostViews']?.()}</SelectItem>
            <SelectItem value="most_likes">{m['templateSharing.browse.sortBy.mostLikes']?.()}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
