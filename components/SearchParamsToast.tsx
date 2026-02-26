'use client'

import { Suspense, useEffect } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { toast } from 'sonner'

function SearchParamsToastInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const success = searchParams.get('success')
    const error = searchParams.get('error')

    if (!success && !error) return

    if (success) {
      toast.success(decodeURIComponent(success))
    }
    if (error) {
      toast.error(decodeURIComponent(error))
    }

    // Pulisce i parametri dall'URL senza causare una navigazione
    const params = new URLSearchParams(searchParams.toString())
    params.delete('success')
    params.delete('error')
    const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname
    router.replace(newUrl, { scroll: false })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  return null
}

export function SearchParamsToast() {
  return (
    <Suspense fallback={null}>
      <SearchParamsToastInner />
    </Suspense>
  )
}
