import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const cantiereId = searchParams.get('cantiere_id')

  if (!cantiereId) {
    return new NextResponse('ID Cantiere mancante', { status: 400 })
  }

  const supabase = await createClient()

  // 1. Recupera dati Cantiere
  const { data: cantiere } = await supabase
    .from('cantieri')
    .select('*')
    .eq('id', cantiereId)
    .single()

  // 2. Recupera Voci Computo Validate/Confermate
  const { data: voci } = await supabase
    .from('computo_voci')
    .select('*')
    .eq('cantiere_id', cantiereId)
    .order('codice', { ascending: true })

  if (!cantiere || !voci) {
    return new NextResponse('Dati non trovati', { status: 404 })
  }

  // Calcolo totale
  const totale = voci.reduce((acc, v) => acc + ((v.prezzo_unitario || 0) * (v.quantita || 0)), 0)

  // 3. Generazione HTML ottimizzato per PDF
  const html = `
    <!DOCTYPE html>
    <html lang="it">
    <head>
      <meta charset="UTF-8">
      <title>Preventivo - ${cantiere.nome}</title>
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; line-height: 1.6; margin: 0; padding: 40px; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px; }
        .company-details h1 { margin: 0; color: #1e3a8a; font-size: 24px; }
        .company-details p { margin: 5px 0 0; color: #64748b; font-size: 14px; }
        .client-details h2 { margin: 0; font-size: 20px; color: #0f172a; }
        .client-details p { margin: 5px 0 0; color: #475569; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 14px; }
        th { background-color: #f8fafc; color: #1e293b; text-align: left; padding: 12px; border-bottom: 2px solid #cbd5e1; }
        td { padding: 12px; border-bottom: 1px solid #e2e8f0; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .total-row { font-weight: bold; background-color: #f1f5f9; font-size: 16px; }
        .total-row td { border-top: 2px solid #2563eb; border-bottom: none; }
        .footer { text-align: center; margin-top: 50px; font-size: 12px; color: #94a3b8; }
        @media print {
          body { padding: 0; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="no-print" style="margin-bottom: 20px; text-align: right;">
        <button onclick="window.print()" style="background: #2563eb; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-size: 16px;">Scarica PDF / Stampa</button>
      </div>

      <div class="header">
        <div class="company-details">
          <h1>Edil CRM</h1>
          <p>Preventivazione & Costi</p>
          <p>Data: ${new Date().toLocaleDateString('it-IT')}</p>
        </div>
        <div class="client-details text-right">
          <h2>Preventivo Lavori</h2>
          <p><strong>Cantiere:</strong> ${cantiere.nome}</p>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Cod.</th>
            <th>Descrizione Lavorazione</th>
            <th class="text-center">U.M.</th>
            <th class="text-right">Q.tà</th>
            <th class="text-right">Prezzo Unit.</th>
            <th class="text-right">Importo</th>
          </tr>
        </thead>
        <tbody>
          ${voci.map(v => `
            <tr>
              <td style="color: #64748b; font-size: 12px;">${v.codice || '-'}</td>
              <td>${v.descrizione}</td>
              <td class="text-center">${v.unita_misura}</td>
              <td class="text-right">${v.quantita}</td>
              <td class="text-right">€ ${Number(v.prezzo_unitario).toFixed(2)}</td>
              <td class="text-right">€ ${(Number(v.quantita) * Number(v.prezzo_unitario)).toFixed(2)}</td>
            </tr>
          `).join('')}
          <tr class="total-row">
            <td colspan="5" class="text-right">TOTALE LAVORI PREVENTIVATI</td>
            <td class="text-right" style="color: #2563eb;">€ ${totale.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</td>
          </tr>
        </tbody>
      </table>

      <div class="footer">
        <p>Il presente preventivo ha validità di 30 giorni. Prezzi IVA esclusa ove non diversamente specificato.</p>
        <p>Documento generato automaticamente da Edil CRM Intelligence.</p>
      </div>
    </body>
    </html>
  `

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html',
    },
  })
}