'use client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { useTransition } from 'react'

export function RefreshButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const handleRefresh = () => {
    startTransition(() => {
      router.refresh() // Riesegue il server component, ri-fetch da Supabase
    })
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleRefresh}
      disabled={isPending}
      className="gap-2"
    >
      <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
      {isPending ? 'Aggiornando...' : 'Aggiorna'}
    </Button>
  )
}
