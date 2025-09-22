import * as m from '@/paraglide/messages'

interface BrowseHeaderProps {
  className?: string
}

export function BrowseHeader({ className }: BrowseHeaderProps) {
  return (
    <div className={className + ' text-center mb-8'}>
      <h1 className="text-4xl font-bold tracking-tight text-foreground mb-4">
        {m['templateSharing.browse.title']?.()}
      </h1>
      <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
        {m['templateSharing.browse.description']?.()}
      </p>
    </div>
  )
}
