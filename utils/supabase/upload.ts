import { createClient } from '@supabase/supabase-js'

export async function uploadFileToSupabase(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<string | null> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Usa timestamp per rendere il nome univoco
    const path = `${Date.now()}_${fileName}`

    const { error } = await supabase.storage
      .from('cantiere-docs') // Assicurati che questo bucket esista su Supabase e sia "Public"
      .upload(path, fileBuffer, {
        contentType: mimeType,
        upsert: false
      })

    if (error) {
      console.error('❌ Errore upload Supabase:', error)
      return null
    }

    // Ottieni URL pubblico
    const { data: publicUrlData } = supabase.storage
      .from('cantiere-docs')
      .getPublicUrl(path)

    return publicUrlData.publicUrl

  } catch (error) {
    console.error('🔥 Eccezione upload:', error)
    return null
  }
}