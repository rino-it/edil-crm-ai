'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function uploadComputo(formData: FormData) {
  const supabase = await createClient()

  const file = formData.get('file') as File
  const cantiereId = formData.get('cantiere_id') as string

  if (!file) {
    throw new Error("Nessun file caricato")
  }

  const text = await file.text()
  const rows = text.split('\n')
  const dataToInsert = []

  // Variabili per la mappatura colonne
  let colDesc = -1
  let colQty = -1
  let colUnit = -1
  let colPrice = -1
  let colTotal = -1
  let detectedUnitName = 'corpo' // Default se non troviamo colonne specifiche
  let headerFound = false

  // Parole chiave per il riconoscimento colonne
  const keywords = {
    desc: ['descrizione', 'lavorazione', 'tipo', 'oggetto', 'ditta'], // 'ditta' spesso contiene info utili se manca la descrizione
    qty: ['q.ta', 'q.tà', 'quantita', 'quantità', 'nr.', 'num'],
    unit: ['u.m.', 'um', 'unita', 'unità'],
    price: ['prezzo', 'unitario', '€/'], // Cerca parziali come €/mc
    total: ['importo', 'totale', 'lavori previsti', 'imponibile']
  }

  // Unità di misura che spesso appaiono COME intestazione colonna (es. "mq", "mc")
  const unitHeaders = ['mq', 'mc', 'kg', 'ml', 'pz', 'cad', 'nr', 'ore']

  // 1. Trova l'intestazione e mappa le colonne
  for (let i = 0; i < rows.length; i++) {
    const rowRaw = rows[i].trim()
    if (!rowRaw) continue

    // Supporto per CSV separati da virgola o punto e virgola, gestendo i testi tra virgolette
    const cols = rowRaw.split(/[,;](?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.replace(/^"|"$/g, '').trim().toLowerCase())

    // Cerchiamo di capire se questa riga è l'header
    if (!headerFound) {
      // Strategia: Se troviamo almeno una colonna "Prezzo" o "Totale" e una "Descrizione", è l'header
      colDesc = cols.findIndex(c => keywords.desc.some(k => c.includes(k)))
      colTotal = cols.findIndex(c => keywords.total.some(k => c.includes(k)))
      
      // Se troviamo l'header, cerchiamo le altre colonne specifiche
      if (colDesc !== -1 && (colTotal !== -1 || cols.length > 2)) {
        headerFound = true
        
        // Mappatura Standard
        colPrice = cols.findIndex(c => keywords.price.some(k => c.includes(k)))
        colQty = cols.findIndex(c => keywords.qty.some(k => c.includes(k)))
        colUnit = cols.findIndex(c => keywords.unit.some(k => c.includes(k)))

        // Mappatura "Speciale": Se una colonna si chiama "mc" o "mq", quella è la Qty e l'unità è il nome stesso
        if (colQty === -1) {
          const unitIdx = cols.findIndex(c => unitHeaders.includes(c))
          if (unitIdx !== -1) {
            colQty = unitIdx
            detectedUnitName = cols[unitIdx] // Es. 'mc'
          }
        }

        console.log(`Header Trovato (Riga ${i}): Desc=${colDesc}, Qty=${colQty} (${detectedUnitName}), Price=${colPrice}, Total=${colTotal}`)
        continue // Passa alla riga dati successiva
      }
    }

    // 2. Importazione Dati
    if (headerFound) {
      const rowCols = rowRaw.split(/[,;](?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.replace(/^"|"$/g, '').trim())
      
      // Salta righe vuote o sballate
      if (rowCols.length <= colDesc) continue 

      const descrizione = rowCols[colDesc]
      if (!descrizione || descrizione.toLowerCase().includes('totale')) continue

      // Funzione helper per pulire i numeri (gestisce 1.000,00 e 1,000.00)
      const parseNum = (str: string) => {
        if (!str) return 0
        let clean = str.replace(/€/g, '').trim()
        // Se contiene , e . assumiamo che l'ultimo sia il decimale. 
        // Se contiene solo , e sembra un decimale (es 10,50), sostituiamo.
        if (clean.indexOf(',') > -1 && clean.indexOf('.') > -1) {
          if (clean.indexOf(',') < clean.indexOf('.')) clean = clean.replace(/,/g, '') // 1,000.00 -> 1000.00
          else clean = clean.replace(/\./g, '').replace(',', '.') // 1.000,00 -> 1000.00
        } else if (clean.indexOf(',') > -1) {
          clean = clean.replace(',', '.')
        }
        return parseFloat(clean) || 0
      }

      let qta = (colQty !== -1) ? parseNum(rowCols[colQty]) : 1
      let price = (colPrice !== -1) ? parseNum(rowCols[colPrice]) : 0
      let total = (colTotal !== -1) ? parseNum(rowCols[colTotal]) : 0

      // Logica di fallback se mancano dati
      if (price === 0 && total !== 0 && qta !== 0) {
        price = total / qta // Ricava il prezzo unitario
      } else if (total === 0 && price !== 0 && qta !== 0) {
        total = price * qta // Ricava il totale
      } else if (price === 0 && total !== 0) {
        price = total // Caso "a corpo"
        qta = 1
      }

      // Determina unità di misura
      let unit = detectedUnitName
      if (colUnit !== -1 && rowCols[colUnit]) {
        unit = rowCols[colUnit]
      }
      // Se abbiamo trovato una colonna prezzo tipo "€/mc", estraiamo "mc"
      if (unit === 'corpo' && colPrice !== -1) {
        const headerPrice = rows[i].trim().split(/[,;]/)[colPrice]?.toLowerCase() || '' // Recupera header originale se possibile, qui approssimiamo
        if (headerPrice.includes('/')) unit = headerPrice.split('/')[1].replace(/[^a-z]/g, '')
      }

      if (total > 0 || price > 0) { // Importa solo righe con valore
        dataToInsert.push({
          cantiere_id: cantiereId,
          codice: rowCols[0] || '', // Spesso la prima colonna è un ID o N.
          descrizione: descrizione,
          unita_misura: unit,
          quantita: qta,
          prezzo_unitario: price
        })
      }
    }
  }

  // 3. Salvataggio
  if (dataToInsert.length === 0) {
    return redirect(`/cantieri/${cantiereId}/computo?error=Nessuna riga importata. Verifica il formato CSV.`)
  }

  // Pulizia vecchi dati (opzionale: rimuovi se vuoi APPENDERE invece di SOVRASCRIVERE)
  // await supabase.from('computo_voci').delete().eq('cantiere_id', cantiereId)

  const { error } = await supabase.from('computo_voci').insert(dataToInsert)

  if (error) {
    console.error(error)
    return redirect(`/cantieri/${cantiereId}/computo?error=${encodeURIComponent(error.message)}`)
  }

  // Aggiorna budget totale cantiere
  const newTotal = dataToInsert.reduce((acc, r) => acc + (r.quantita * r.prezzo_unitario), 0)
  // Nota: questo aggiorna il budget aggiungendo ai valori esistenti se non abbiamo cancellato prima.
  // Per sicurezza, ricalcoliamo il totale DAL DB
  const { data: allVoci } = await supabase.from('computo_voci').select('quantita, prezzo_unitario').eq('cantiere_id', cantiereId)
  const realTotal = allVoci?.reduce((acc, r) => acc + (r.quantita * r.prezzo_unitario), 0) || newTotal

  await supabase.from('cantieri').update({ budget: realTotal }).eq('id', cantiereId)

  revalidatePath(`/cantieri/${cantiereId}`)
  redirect(`/cantieri/${cantiereId}/computo`)
}