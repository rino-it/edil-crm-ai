import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export default async function CantieriPage() {
  const supabase = await createClient()

  // 1. Verifica Auth
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  // 2. Preleva i cantieri dal DB
  const { data: cantieri, error } = await supabase
    .from('cantieri')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">I tuoi Cantieri</h1>
        <Link href="/cantieri/nuovo" 
          className="bg-black text-white px-4 py-2 rounded hover:bg-gray-800 transition">
          + Nuovo Cantiere
        </Link>
      </div>

      {(!cantieri || cantieri.length === 0) ? (
        <div className="text-center py-20 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <p className="text-gray-500">Non ci sono ancora cantieri attivi.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {cantieri.map((cantiere) => (
            <div key={cantiere.id} className="bg-white border rounded-lg p-6 hover:shadow-md transition">
              <div className="flex justify-between items-start mb-4">
                <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded">
                  {cantiere.codice}
                </span>
                <span className={`text-xs px-2 py-1 rounded capitalize ${
                  cantiere.stato === 'aperto' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {cantiere.stato}
                </span>
              </div>
              <h3 className="text-xl font-bold mb-2">{cantiere.descrizione}</h3>
              <p className="text-gray-600 text-sm mb-4">{cantiere.indirizzo}</p>
              <div className="border-t pt-4 text-sm text-gray-500">
                Budget: <span className="font-semibold text-gray-900">€ {cantiere.budget}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}