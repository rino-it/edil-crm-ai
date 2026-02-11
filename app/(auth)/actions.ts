'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export async function login(formData: FormData) {
  const supabase = await createClient(); // <--- Aggiungi await qui

  // Prendiamo i dati dal form
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  // Chiediamo a Supabase di loggarci
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return redirect('/login?message=Credenziali errate')
  }

  // Se va tutto bene, aggiorniamo la cache e andiamo ai cantieri
  revalidatePath('/', 'layout')
  redirect('/cantieri')
}

export async function signup(formData: FormData) {
  const supabase = createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const nome = formData.get('nome') as string

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
        data: {
            full_name: nome,
        }
    }
  })

  if (error) {
    return redirect('/login?message=Errore nella registrazione')
  }

  revalidatePath('/', 'layout')
  redirect('/cantieri')
}