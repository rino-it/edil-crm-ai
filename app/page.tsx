import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export default async function Home() {
  // 1. Inizializza il client Supabase
  const supabase = await createClient()

  // 2. Controlla se c'è un utente attivo
  const { data: { user }, error } = await supabase.auth.getUser()

  // 3. Logica di smistamento (Router Intelligente)
  if (user) {
    // Se è loggato, vai alla dashboard operativa
    redirect('/cantieri')
  } else {
    // Se non è loggato, vai alla schermata di accesso
    redirect('/login')
  }
}