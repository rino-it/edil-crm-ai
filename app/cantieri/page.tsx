import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export default async function CantieriPage() {
  const supabase = await createClient()

  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Gestione Cantieri</h1>
      <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
        <p><strong>Successo!</strong> Sei loggato come: {user.email}</p>
        <p>Questa è la pagina che mancava.</p>
      </div>
    </div>
  )
}