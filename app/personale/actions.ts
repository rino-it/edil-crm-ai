'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function addPersona(formData: FormData): Promise<void> {
  const supabase = await createClient()

  const data = {
    nome: formData.get('nome') as string,
    ruolo: formData.get('ruolo') as string,
    telefono: formData.get('telefono') as string,
    costo_orario: parseFloat((formData.get('costo_orario') as string) || '0'),
    attivo: formData.get('attivo') === 'on'
  }

  const { error } = await supabase.from('personale').insert([data])

  if (error) {
    console.error("Errore aggiunta persona:", error)
  } else {
    revalidatePath('/personale')
  }
}

export async function editPersona(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const id = formData.get('id') as string

  const data = {
    nome: formData.get('nome') as string,
    ruolo: formData.get('ruolo') as string,
    telefono: formData.get('telefono') as string,
    costo_orario: parseFloat((formData.get('costo_orario') as string) || '0'),
    attivo: formData.get('attivo') === 'on'
  }

  const { error } = await supabase.from('personale').update(data).eq('id', id)

  if (error) {
    console.error("Errore modifica persona:", error)
  } else {
    revalidatePath('/personale')
  }
}

export async function deletePersona(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const id = formData.get('id') as string

  const { error } = await supabase.from('personale').delete().eq('id', id)

  if (error) {
    console.error("Errore eliminazione persona:", error)
  } else {
    revalidatePath('/personale')
  }
}