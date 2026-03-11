import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import {
  getKPIFinanziariGlob,
  getCashflowPrevisionale,
  getAgingAnalysisData,
  getTopEsposizioniPerSoggetto,
  getCronogrammaPagamenti,
} from '@/utils/data-fetcher'
import type { VoceCronogramma } from '@/utils/data-fetcher'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'

const fmtEuro = (v: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(v)
const fmtData = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleDateString('it-IT')
}
const fmtGiorno = (iso: string) => {
  const d = new Date(iso)
  const giorni = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']
  return giorni[d.getDay()]
}

const fonteLabel = (f: string) => {
  switch (f) {
    case 'mutuo': return 'Rata Mutuo'
    case 'titolo': return 'Titolo'
    case 'manuale': return 'Manuale'
    default: return 'Fattura'
  }
}

export async function GET(request: NextRequest) {
  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  }

  const format = request.nextUrl.searchParams.get('format') || 'xlsx'

  // Fetch all data in parallel
  const [kpis, cashflowData, agingCrediti, agingDebiti, topEsposizioni, cronogramma] = await Promise.all([
    getKPIFinanziariGlob(),
    getCashflowPrevisionale(90),
    getAgingAnalysisData('entrata'),
    getAgingAnalysisData('uscita'),
    getTopEsposizioniPerSoggetto(10),
    getCronogrammaPagamenti(30),
  ])

  const proiezioneT30 = cashflowData[30]?.saldo ?? null
  const proiezioneT60 = cashflowData[60]?.saldo ?? null
  const proiezioneT90 = cashflowData[89]?.saldo ?? null
  const oggi = new Date().toLocaleDateString('it-IT')

  if (format === 'html') {
    return generaHTML(kpis, cronogramma, topEsposizioni, agingCrediti, agingDebiti, proiezioneT30, proiezioneT60, proiezioneT90, oggi)
  }

  return generaExcel(kpis, cashflowData, cronogramma, agingCrediti, agingDebiti, topEsposizioni, proiezioneT30, proiezioneT60, proiezioneT90, oggi)
}


// ─── EXCEL ────────────────────────────────────────────────────────────────
function generaExcel(
  kpis: any, cashflowData: any[],
  cronogramma: { voci: VoceCronogramma[]; cassaAttuale: number; totaleUscite: number; totaleEntrate: number; liquiditaNecessaria: number },
  agingCrediti: any[], agingDebiti: any[],
  topEsposizioni: any[], t30: number | null, t60: number | null, t90: number | null, oggi: string
) {
  // Sheet 1: Sommario
  const summaryRows = [
    ['REPORT CFO — EDIL CRM', ''],
    ['Data generazione', oggi],
    ['', ''],
    ['POSIZIONE ATTUALE', ''],
    ['Cassa Attuale', cronogramma.cassaAttuale],
    ['DSO (giorni)', kpis.dso || 'N/D'],
    ['', ''],
    ['LIQUIDITÀ 30 GIORNI', ''],
    ['Uscite Programmate (30gg)', cronogramma.totaleUscite],
    ['Entrate Previste (30gg)', cronogramma.totaleEntrate],
    ['Liquidità Necessaria Netta', cronogramma.liquiditaNecessaria],
    ['Saldo Previsto dopo Operazioni', cronogramma.cassaAttuale - cronogramma.liquiditaNecessaria],
    ['', ''],
    ['PROIEZIONI CASHFLOW', ''],
    ['Proiezione T+30', t30 ?? 'N/D'],
    ['Proiezione T+60', t60 ?? 'N/D'],
    ['Proiezione T+90', t90 ?? 'N/D'],
  ]
  const ws1 = XLSX.utils.aoa_to_sheet(summaryRows)
  ws1['!cols'] = [{ wch: 40 }, { wch: 20 }]

  // Sheet 2: Cronogramma Pagamenti 30gg
  const cronoRows: any[][] = [['Data', 'Giorno', 'Tipo', 'Fonte', 'Soggetto', 'Descrizione', 'Importo', 'Confermato']]
  for (const v of cronogramma.voci) {
    cronoRows.push([
      fmtData(v.data), fmtGiorno(v.data),
      v.tipo === 'uscita' ? 'USCITA' : 'ENTRATA',
      fonteLabel(v.fonte),
      v.soggetto, v.descrizione || v.fattura_rif || '',
      v.importo, ''
    ])
  }
  cronoRows.push([])
  cronoRows.push(['', '', '', '', '', 'TOTALE USCITE', cronogramma.totaleUscite, ''])
  cronoRows.push(['', '', '', '', '', 'TOTALE ENTRATE', cronogramma.totaleEntrate, ''])
  cronoRows.push(['', '', '', '', '', 'LIQUIDITÀ NECESSARIA', cronogramma.liquiditaNecessaria, ''])
  const ws2 = XLSX.utils.aoa_to_sheet(cronoRows)
  ws2['!cols'] = [{ wch: 12 }, { wch: 6 }, { wch: 8 }, { wch: 12 }, { wch: 30 }, { wch: 30 }, { wch: 14 }, { wch: 12 }]

  // Sheet 3: Cashflow 90gg
  const cfRows: any[][] = [['Data', 'Saldo', 'Entrate Giorno', 'Uscite Giorno']]
  for (const p of cashflowData) {
    cfRows.push([fmtData(p.data), p.saldo, p.entrate_giorno || 0, p.uscite_giorno || 0])
  }
  const ws3 = XLSX.utils.aoa_to_sheet(cfRows)
  ws3['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 16 }]

  // Sheet 4: Top Esposizioni
  const espoRows: any[][] = [['Soggetto', 'Tipo', 'Crediti Residui', 'Debiti Residui', 'Netto', 'N. Fatture']]
  for (const e of topEsposizioni) {
    espoRows.push([e.ragione_sociale, e.tipo_soggetto || '', e.entrate_residuo, e.uscite_residuo, e.netto, e.n_fatture])
  }
  const ws4 = XLSX.utils.aoa_to_sheet(espoRows)
  ws4['!cols'] = [{ wch: 35 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }]

  // Sheet 5: Aging Analysis
  const agingRows: any[][] = [['Fascia', 'Crediti (EUR)', 'N. Fatture Crediti', 'Debiti (EUR)', 'N. Fatture Debiti']]
  for (let i = 0; i < agingCrediti.length; i++) {
    agingRows.push([
      agingCrediti[i]?.label || '',
      agingCrediti[i]?.importo || 0,
      agingCrediti[i]?.count || 0,
      agingDebiti[i]?.importo || 0,
      agingDebiti[i]?.count || 0,
    ])
  }
  const ws5 = XLSX.utils.aoa_to_sheet(agingRows)
  ws5['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 18 }]

  // Build workbook
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws1, 'Sommario')
  XLSX.utils.book_append_sheet(wb, ws2, 'Cronogramma 30gg')
  XLSX.utils.book_append_sheet(wb, ws3, 'Cashflow 90gg')
  XLSX.utils.book_append_sheet(wb, ws4, 'Top Esposizioni')
  XLSX.utils.book_append_sheet(wb, ws5, 'Aging Analysis')

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const dataStr = new Date().toISOString().slice(0, 10)

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="report-cfo-${dataStr}.xlsx"`,
    },
  })
}


// ─── HTML STAMPABILE ──────────────────────────────────────────────────────
function generaHTML(
  kpis: any,
  cronogramma: { voci: VoceCronogramma[]; cassaAttuale: number; totaleUscite: number; totaleEntrate: number; liquiditaNecessaria: number },
  topEsposizioni: any[], agingCrediti: any[], agingDebiti: any[],
  t30: number | null, t60: number | null, t90: number | null, oggi: string
) {
  const saldoDopoOperazioni = cronogramma.cassaAttuale - cronogramma.liquiditaNecessaria
  const uscite = cronogramma.voci.filter(v => v.tipo === 'uscita')
  const entrate = cronogramma.voci.filter(v => v.tipo === 'entrata')

  // Raggruppa per settimana
  const settimane: { label: string; voci: VoceCronogramma[] }[] = []
  let currentWeekStart: Date | null = null
  let currentGroup: VoceCronogramma[] = []

  for (const v of cronogramma.voci) {
    const d = new Date(v.data)
    const weekDay = d.getDay()
    const monday = new Date(d)
    monday.setDate(d.getDate() - ((weekDay + 6) % 7))
    monday.setHours(0, 0, 0, 0)

    if (!currentWeekStart || monday.getTime() !== currentWeekStart.getTime()) {
      if (currentGroup.length > 0 && currentWeekStart) {
        const friday = new Date(currentWeekStart)
        friday.setDate(currentWeekStart.getDate() + 4)
        settimane.push({ label: `${fmtData(currentWeekStart.toISOString())} — ${fmtData(friday.toISOString())}`, voci: currentGroup })
      }
      currentWeekStart = monday
      currentGroup = []
    }
    currentGroup.push(v)
  }
  if (currentGroup.length > 0 && currentWeekStart) {
    const friday = new Date(currentWeekStart)
    friday.setDate(currentWeekStart.getDate() + 4)
    settimane.push({ label: `${fmtData(currentWeekStart.toISOString())} — ${fmtData(friday.toISOString())}`, voci: currentGroup })
  }

  const html = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <title>Cronogramma Pagamenti — EDIL CRM — ${oggi}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; padding: 24px 32px; max-width: 1100px; margin: 0 auto; font-size: 12px; }
    h1 { font-size: 20px; margin-bottom: 2px; }
    h2 { font-size: 15px; margin: 20px 0 8px; border-bottom: 2px solid #1a1a1a; padding-bottom: 3px; }
    h3 { font-size: 12px; margin: 14px 0 4px; color: #374151; background: #f3f4f6; padding: 4px 8px; border-left: 3px solid #6b7280; }
    .subtitle { color: #6b7280; font-size: 11px; margin-bottom: 16px; }

    /* KPI Strip */
    .kpi-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
    .kpi-box { border: 2px solid #e5e7eb; border-radius: 6px; padding: 10px; text-align: center; }
    .kpi-label { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #6b7280; letter-spacing: 0.5px; }
    .kpi-value { font-size: 20px; font-weight: 900; margin-top: 2px; font-family: 'Courier New', monospace; }
    .kpi-ok { border-color: #a7f3d0; background: #ecfdf5; }
    .kpi-ok .kpi-value { color: #047857; }
    .kpi-warn { border-color: #fca5a5; background: #fef2f2; }
    .kpi-warn .kpi-value { color: #b91c1c; }
    .kpi-neutral { border-color: #bfdbfe; background: #eff6ff; }
    .kpi-neutral .kpi-value { color: #1e40af; }

    /* Tables */
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    th { background: #f9fafb; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #6b7280; padding: 6px 8px; text-align: left; border-bottom: 2px solid #d1d5db; }
    td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px; }
    tr:nth-child(even) { background: #fafafa; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .mono { font-family: 'Courier New', monospace; }
    .text-green { color: #047857; }
    .text-red { color: #b91c1c; }
    .text-muted { color: #9ca3af; }
    .bold { font-weight: 700; }

    /* Checkbox column for print */
    .check-col { width: 28px; text-align: center; }
    .checkbox { width: 14px; height: 14px; border: 2px solid #9ca3af; border-radius: 2px; display: inline-block; vertical-align: middle; }

    /* Note line for handwriting */
    .note-col { width: 80px; border-bottom: 1px dotted #d1d5db !important; }

    /* Tipo badge */
    .badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 9px; font-weight: 700; text-transform: uppercase; }
    .badge-uscita { background: #fef2f2; color: #b91c1c; border: 1px solid #fca5a5; }
    .badge-entrata { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
    .badge-fonte { background: #f5f3ff; color: #6d28d9; border: 1px solid #c4b5fd; font-size: 8px; }

    /* Totals row */
    .totals-row td { border-top: 2px solid #1a1a1a; font-weight: 900; font-size: 12px; background: #f9fafb; }

    /* Summary box */
    .summary-box { margin: 16px 0; padding: 12px 16px; border: 2px solid #1a1a1a; border-radius: 6px; background: #fafafa; }
    .summary-row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 12px; }
    .summary-row.total { border-top: 2px solid #1a1a1a; margin-top: 6px; padding-top: 8px; font-weight: 900; font-size: 14px; }

    /* Proiezioni */
    .proiezioni { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 8px 0 16px; }
    .proiezione-card { border: 1px solid #e5e7eb; border-radius: 4px; padding: 8px; text-align: center; }

    /* Print */
    .print-btn { position: fixed; top: 12px; right: 12px; background: #2563eb; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; z-index: 100; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
    .print-btn:hover { background: #1d4ed8; }
    @media print {
      .print-btn { display: none !important; }
      body { padding: 12px; font-size: 11px; }
      .kpi-strip { gap: 6px; }
      .kpi-value { font-size: 16px; }
      h2 { margin: 14px 0 6px; }
      .page-break { page-break-before: always; }
    }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Stampa / Salva PDF</button>

  <h1>Cronogramma Pagamenti — Prossimi 30 Giorni</h1>
  <div class="subtitle">EDIL CRM — Generato il ${oggi} — Documento per revisione pagamenti con i soci</div>

  <!-- KPI Strip -->
  <div class="kpi-strip">
    <div class="kpi-box ${cronogramma.cassaAttuale >= 0 ? 'kpi-neutral' : 'kpi-warn'}">
      <div class="kpi-label">Cassa Attuale</div>
      <div class="kpi-value">${fmtEuro(cronogramma.cassaAttuale)}</div>
    </div>
    <div class="kpi-box kpi-warn">
      <div class="kpi-label">Uscite Programmate</div>
      <div class="kpi-value">${fmtEuro(cronogramma.totaleUscite)}</div>
    </div>
    <div class="kpi-box kpi-ok">
      <div class="kpi-label">Entrate Previste</div>
      <div class="kpi-value">${fmtEuro(cronogramma.totaleEntrate)}</div>
    </div>
    <div class="kpi-box ${saldoDopoOperazioni >= 0 ? 'kpi-ok' : 'kpi-warn'}">
      <div class="kpi-label">Saldo Previsto</div>
      <div class="kpi-value">${fmtEuro(saldoDopoOperazioni)}</div>
    </div>
  </div>

  <!-- CRONOGRAMMA USCITE -->
  <h2>Pagamenti da Effettuare (${uscite.length} voci — ${fmtEuro(cronogramma.totaleUscite)})</h2>

  ${settimane.map(sett => {
    const vociUscita = sett.voci.filter(v => v.tipo === 'uscita')
    if (vociUscita.length === 0) return ''
    const totSett = vociUscita.reduce((a, v) => a + v.importo, 0)
    return `
    <h3>Settimana ${sett.label} — Tot. ${fmtEuro(totSett)}</h3>
    <table>
      <thead>
        <tr>
          <th class="check-col">OK</th>
          <th style="width:70px">Data</th>
          <th style="width:30px">Gg</th>
          <th>Soggetto</th>
          <th>Descrizione / Fattura</th>
          <th style="width:60px">Fonte</th>
          <th class="text-right" style="width:90px">Importo</th>
          <th class="note-col">Note</th>
        </tr>
      </thead>
      <tbody>
        ${vociUscita.map(v => `
        <tr>
          <td class="check-col"><span class="checkbox"></span></td>
          <td>${fmtData(v.data)}</td>
          <td class="text-muted">${fmtGiorno(v.data)}</td>
          <td class="bold">${v.soggetto}</td>
          <td class="text-muted">${v.descrizione || v.fattura_rif || '—'}</td>
          <td><span class="badge badge-fonte">${fonteLabel(v.fonte)}</span></td>
          <td class="text-right mono text-red bold">${fmtEuro(v.importo)}</td>
          <td class="note-col"></td>
        </tr>`).join('')}
      </tbody>
    </table>`
  }).join('')}

  <!-- RIEPILOGO USCITE -->
  <div class="summary-box">
    <div class="summary-row"><span>Totale Uscite Programmate</span><span class="mono text-red bold">${fmtEuro(cronogramma.totaleUscite)}</span></div>
    <div class="summary-row"><span>Totale Entrate Previste</span><span class="mono text-green bold">${fmtEuro(cronogramma.totaleEntrate)}</span></div>
    <div class="summary-row total"><span>Liquidit&agrave; Necessaria Netta</span><span class="mono ${cronogramma.liquiditaNecessaria > 0 ? 'text-red' : 'text-green'}">${fmtEuro(cronogramma.liquiditaNecessaria)}</span></div>
    <div class="summary-row total"><span>Saldo Previsto dopo Operazioni</span><span class="mono ${saldoDopoOperazioni >= 0 ? 'text-green' : 'text-red'}">${fmtEuro(saldoDopoOperazioni)}</span></div>
  </div>

  ${entrate.length > 0 ? `
  <!-- ENTRATE PREVISTE -->
  <h2>Incassi Previsti (${entrate.length} voci — ${fmtEuro(cronogramma.totaleEntrate)})</h2>
  <table>
    <thead>
      <tr>
        <th class="check-col">OK</th>
        <th style="width:70px">Data</th>
        <th style="width:30px">Gg</th>
        <th>Soggetto</th>
        <th>Descrizione / Fattura</th>
        <th style="width:60px">Fonte</th>
        <th class="text-right" style="width:90px">Importo</th>
        <th class="note-col">Note</th>
      </tr>
    </thead>
    <tbody>
      ${entrate.map(v => `
      <tr>
        <td class="check-col"><span class="checkbox"></span></td>
        <td>${fmtData(v.data)}</td>
        <td class="text-muted">${fmtGiorno(v.data)}</td>
        <td class="bold">${v.soggetto}</td>
        <td class="text-muted">${v.descrizione || v.fattura_rif || '—'}</td>
        <td><span class="badge badge-fonte">${fonteLabel(v.fonte)}</span></td>
        <td class="text-right mono text-green bold">${fmtEuro(v.importo)}</td>
        <td class="note-col"></td>
      </tr>`).join('')}
    </tbody>
  </table>` : ''}

  <!-- PAGE BREAK per stampa -->
  <div class="page-break"></div>

  <!-- PROIEZIONI -->
  <h2>Proiezioni Cashflow</h2>
  <div class="proiezioni">
    <div class="proiezione-card ${t30 !== null && t30 >= 0 ? 'kpi-ok' : 'kpi-warn'}">
      <div class="kpi-label">T+30 giorni</div>
      <div class="kpi-value" style="font-size:16px">${t30 !== null ? fmtEuro(t30) : '—'}</div>
    </div>
    <div class="proiezione-card ${t60 !== null && t60 >= 0 ? 'kpi-ok' : 'kpi-warn'}">
      <div class="kpi-label">T+60 giorni</div>
      <div class="kpi-value" style="font-size:16px">${t60 !== null ? fmtEuro(t60) : '—'}</div>
    </div>
    <div class="proiezione-card ${t90 !== null && t90 >= 0 ? 'kpi-ok' : 'kpi-warn'}">
      <div class="kpi-label">T+90 giorni</div>
      <div class="kpi-value" style="font-size:16px">${t90 !== null ? fmtEuro(t90) : '—'}</div>
    </div>
  </div>

  <!-- TOP ESPOSIZIONI -->
  <h2>Top 10 Esposizioni per Soggetto</h2>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Soggetto</th>
        <th>Tipo</th>
        <th class="text-right">Crediti</th>
        <th class="text-right">Debiti</th>
        <th class="text-right">Netto</th>
        <th class="text-right">Fatt.</th>
      </tr>
    </thead>
    <tbody>
      ${topEsposizioni.map((e: any, i: number) => `
      <tr>
        <td>${i + 1}</td>
        <td class="bold">${e.ragione_sociale}</td>
        <td>${e.tipo_soggetto || 'N/D'}</td>
        <td class="text-right mono text-green">${e.entrate_residuo > 0 ? fmtEuro(e.entrate_residuo) : '—'}</td>
        <td class="text-right mono text-red">${e.uscite_residuo > 0 ? fmtEuro(e.uscite_residuo) : '—'}</td>
        <td class="text-right mono bold" style="color: ${e.netto >= 0 ? '#047857' : '#b91c1c'}">${fmtEuro(e.netto)}</td>
        <td class="text-right text-muted">${e.n_fatture}</td>
      </tr>`).join('')}
    </tbody>
  </table>

  <!-- AGING -->
  <h2>Aging Analysis — Ritardi</h2>
  <table>
    <thead>
      <tr>
        <th>Fascia</th>
        <th class="text-right">Crediti</th>
        <th class="text-right">N. Fatt.</th>
        <th class="text-right">Debiti</th>
        <th class="text-right">N. Fatt.</th>
      </tr>
    </thead>
    <tbody>
      ${agingCrediti.map((c: any, i: number) => `
      <tr>
        <td class="bold">${c.label}</td>
        <td class="text-right mono text-green">${fmtEuro(c.importo)}</td>
        <td class="text-right text-muted">${c.count}</td>
        <td class="text-right mono text-red">${fmtEuro(agingDebiti[i]?.importo || 0)}</td>
        <td class="text-right text-muted">${agingDebiti[i]?.count || 0}</td>
      </tr>`).join('')}
    </tbody>
  </table>

  <div style="margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 10px; text-align: center;">
    Documento riservato — EDIL CRM — Generato automaticamente il ${oggi}
  </div>

</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
