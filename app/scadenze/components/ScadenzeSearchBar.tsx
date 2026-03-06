'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Search, X } from 'lucide-react'

export function ScadenzeSearchBar() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const currentSearch = searchParams.get('search') || ''
  const [value, setValue] = useState(currentSearch)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync state when URL changes externally (e.g. browser back)
  useEffect(() => {
    setValue(searchParams.get('search') || '')
  }, [searchParams])

  const updateSearch = (term: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (term.trim()) {
      params.set('search', term.trim())
      params.delete('page') // reset to page 1
    } else {
      params.delete('search')
      params.delete('page')
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setValue(newValue)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => updateSearch(newValue), 300)
  }

  const handleClear = () => {
    setValue('')
    updateSearch('')
  }

  return (
    <div className="relative max-w-sm">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        type="text"
        placeholder="Cerca fattura, descrizione..."
        value={value}
        onChange={handleChange}
        className="pl-9 pr-8 h-9 text-sm"
      />
      {value && (
        <button
          onClick={handleClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
