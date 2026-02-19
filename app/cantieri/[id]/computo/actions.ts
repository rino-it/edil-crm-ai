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
  const dataToInsert: any[] = []

  // Variabili per la mappatura colonne
  let colDesc = -1
  let colQty = -1
  let colUnit = -1
  let colPrice = -1
  let colTotal = -1
  let detectedUnitName = 'corpo'
  let headerFound = false

  const keywords = {
    desc: ['descrizione', 'lavorazione', 'tipo', 'oggetto', 'ditta'],
    qty: ['q.ta', 'q.tà', 'quantita', 'quantità', 'nr.', 'num'],
    unit: ['u.m.', 'um', 'unita', 'unità'],
    price: ['prezzo', 'unitario', '€/'],
    total: ['importo', 'totale', 'lavori previsti', 'imponibile']
  }

  const unitHeaders = ['mq', 'mc', 'kg', 'ml', 'pz', 'cad', 'nr', 'ore']

  // 1. Lettura e Mappatura CSV
  for (let i = 0; i < rows.length; i++) {
    const rowRaw = rows[i].trim()
    if (!rowRaw) continue

    const cols = rowRaw.split(/[,;](?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.replace(/^"|"$/g, '').trim().toLowerCase())

    if (!headerFound) {
      colDesc = cols.findIndex(c => keywords.desc.some(k => c.includes(k)))
      colTotal = cols.findIndex(c => keywords.total.some(k => c.includes(k)))
      
      if (colDesc !== -1 && (colTotal !== -1 || cols.length > 2)) {
        headerFound = true
        colPrice = cols.findIndex(c => keywords.price.some(k => c.includes(k)))
        colQty = cols.findIndex(c => keywords.qty.some(k => c.includes(k)))
        colUnit = cols.findIndex(c => keywords.unit.some(k => c.includes(k)))

        if (colQty === -1) {
          const unitIdx = cols.findIndex(c => unitHeaders.includes(c))
          if (unitIdx !== -1) {
            colQty = unitIdx
            detectedUnitName = cols[unitIdx]
          }
        }
        continue
      }
    }

    if (headerFound) {
      const rowCols = rowRaw.split(/[,;](?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.replace(/^"|"$/g, '').trim())
      
      if (rowCols.length <= colDesc) continue 

      const descrizione = rowCols[colDesc]
      if (!descrizione || descrizione.toLowerCase().includes('totale')) continue

      const parseNum = (str: string) => {
        if (!str) return 0
        let clean = str.replace(/€/g, '').trim()
        if (clean.indexOf(',') > -1 && clean.indexOf('.') > -1) {
          if (clean.indexOf(',') < clean.indexOf('.')) clean = clean.replace(/,/g, '') 
          else clean = clean.replace(/\./g, '').replace(',', '.') 
        } else if (clean.indexOf(',') > -1) {
          clean = clean.replace(',', '.')
        }
        return parseFloat(clean) || 0
      }

      let qta = (colQty !== -1) ? parseNum(rowCols[colQty]) : 1
      let price = (colPrice !== -1) ? parseNum(rowCols[colPrice]) : 0
      let total = (colTotal !== -1) ? parseNum(rowCols[colTotal]) : 0

      if (price === 0 && total !== 0 && qta !== 0) {
        price = total / qta 
      } else if (total === 0 && price !== 0 && qta !== 0) {
        total = price * qta 
      } else if (price === 0 && total !== 0) {
        price = total 
        qta = 1
      }

      let unit = detectedUnitName
      if (colUnit !== -1 && rowCols[colUnit]) {
        unit = rowCols[colUnit]
      }

      // IMPORTANTE: Ora importiamo anche le righe con prezzo 0 (per farle stimare all'AI)
      if (descrizione.length > 3) { 
        dataToInsert.push({
          cantiere_id: cantiereId,
          codice: rowCols[0] || '', 
          descrizione: descrizione,
          unita_misura: unit,
          quantita: qta,
          prezzo_unitario: price,
          
          // Campi AI di default
          ai_prezzo_stimato: null,
          ai_prezzo_min: null,
          ai_prezzo_max: null,
          ai_confidence_score: null,
          ai_match_id: null,
          stato_validazione: price > 0 ? 'confermato' : 'da_validare' 
        })
      }
    }
  }

  if (dataToInsert.length === 0) {
    return redirect(`/cantieri/${cantiereId}/computo?error=Nessuna riga importata. Verifica il formato CSV.`)
  }

  // ============================================================
  // 2. INTEGRAZIONE AI: Stima dei prezzi mancanti (RAG)
  // ============================================================
  const appUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  
  const vociDaStimare = dataToInsert.filter(v => v.prezzo_unitario === 0);
  console.log(`🧠 Trovate ${vociDaStimare.length} voci senza prezzo da sottoporre all'AI.`);

  // Eseguiamo le chiamate API in parallelo (max 5 alla volta per non saturare)
  const chunkSize = 5;
  for (let i = 0; i < vociDaStimare.length; i += chunkSize) {
    const chunk = vociDaStimare.slice(i, i + chunkSize);
    
    await Promise.all(chunk.map(async (voce) => {
      try {
        const response = await fetch(`${appUrl}/api/preventivo/match`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            descrizione: voce.descrizione,
            unita_misura: voce.unita_misura
          })
        });

        if (response.ok) {
          const resJson = await response.json();
          if (resJson.success && resJson.data) {
            const aiData = resJson.data;
            // Aggiorna la voce nell'array originale dataToInsert
            voce.ai_prezzo_stimato = aiData.ai_prezzo_stimato;
            voce.ai_prezzo_min = aiData.ai_prezzo_min;
            voce.ai_prezzo_max = aiData.ai_prezzo_max;
            voce.ai_confidence_score = aiData.ai_confidence_score;
            voce.ai_match_id = aiData.ai_match_id;
            
            // Se l'AI ha trovato un prezzo con buona confidenza, prepariamo il dato, ma resta 'da_validare'
            if (aiData.ai_prezzo_stimato) {
               // Non forziamo il prezzo unitario qui per lasciare il controllo all'utente nella UI
               console.log(`✅ Stima AI per "${voce.descrizione.substring(0,20)}...": €${aiData.ai_prezzo_stimato}`);
            }
          }
        }
      } catch (err) {
        console.error(`🔥 Errore chiamata AI per riga: ${voce.descrizione}`, err);
      }
    }));
  }

  // ============================================================
  // 3. Salvataggio su DB
  // ============================================================
  const { error } = await supabase.from('computo_voci').insert(dataToInsert)

  if (error) {
    console.error(error)
    return redirect(`/cantieri/${cantiereId}/computo?error=${encodeURIComponent(error.message)}`)
  }

  // Ricalcola il totale dal DB
  const { data: allVoci } = await supabase.from('computo_voci').select('quantita, prezzo_unitario').eq('cantiere_id', cantiereId)
  const realTotal = allVoci?.reduce((acc, r) => acc + (r.quantita * r.prezzo_unitario), 0) || 0

  await supabase.from('cantieri').update({ budget: realTotal }).eq('id', cantiereId)

  revalidatePath(`/cantieri/${cantiereId}`)
  redirect(`/cantieri/${cantiereId}/computo`)
}