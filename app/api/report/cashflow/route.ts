import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import {
  getKPIFinanziariGlob,
  getCashflowPrevisionale,
  getAgingAnalysisData,
  getTopEsposizioniPerSoggetto,
} from '@/utils/data-fetcher'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'

const fmtEuro = (v: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(v)
const fmtData = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleDateString('it-IT')
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
  const [kpis, cashflowData, agingCrediti, agingDebiti, topEsposizioni] = await Promise.all([
    getKPIFinanziariGlob(),
    getCashflowPrevisionale(90),
    getAgingAnalysisData('entrata'),
    getAgingAnalysisData('uscita'),
    getTopEsposizioniPerSoggetto(10),
  ])

  const proiezioneT30 = cashflowData[30]?.saldo ?? null
  const proiezioneT60 = cashflowData[60]?.saldo ?? null
  const proiezioneT90 = cashflowData[89]?.saldo ?? null
  const oggi = new Date().toLocaleDateString('it-IT')

  if (format === 'html') {
    return generaHTML(kpis, cashflowData, agingCrediti, agingDebiti, topEsposizioni, proiezioneT30, proiezioneT60, proiezioneT90, oggi)
  }

  return generaExcel(kpis, cashflowData, agingCrediti, agingDebiti, topEsposizioni, proiezioneT30, proiezioneT60, proiezioneT90, oggi)
}


// ─── EXCEL ────────────────────────────────────────────────────────────────
function generaExcel(
  kpis: any, cashflowData: any[], agingCrediti: any[], agingDebiti: any[],
  topEsposizioni: any[], t30: number | null, t60: number | null, t90: number | null, oggi: string
) {
  // Sheet 1: Sommario
  const summaryRows = [
    ['REPORT CFO — EDIL CRM', ''],
    ['Data generazione', oggi],
    ['', ''],
    ['POSIZIONE ATTUALE', ''],
    ['Cassa Attuale', kpis.cassa_attuale],
    ['Da Incassare (Crediti)', kpis.da_incassare],
    ['Esposizione Fornitori (Debiti)', kpis.esposizione_fornitori],
    ['Bilancio Globale (Posizione Netta)', kpis.bilancio_globale],
    ['DSO (giorni)', kpis.dso || 'N/D'],
    ['', ''],
    ['PROIEZIONI CASHFLOW', ''],
    ['Proiezione T+30', t30 ?? 'N/D'],
    ['Proiezione T+60', t60 ?? 'N/D'],
    ['Proiezione T+90', t90 ?? 'N/D'],
  ]
  const ws1 = XLSX.utils.aoa_to_sheet(summaryRows)
  ws1['!cols'] = [{ wch: 40 }, { wch: 20 }]

  // Sheet 2: Cashflow 90gg
  const cfRows: any[][] = [['Data', 'Saldo', 'Entrate Giorno', 'Uscite Giorno']]
  for (const p of cashflowData) {
    cfRows.push([fmtData(p.data), p.saldo, p.entrate_giorno || 0, p.uscite_giorno || 0])
  }
  const ws2 = XLSX.utils.aoa_to_sheet(cfRows)
  ws2['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 16 }]

  // Sheet 3: Aging Analysis
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
  const ws3 = XLSX.utils.aoa_to_sheet(agingRows)
  ws3['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 18 }]

  // Sheet 4: Top Esposizioni
  const espoRows: any[][] = [['Soggetto', 'Tipo', 'Crediti Residui', 'Debiti Residui', 'Netto', 'N. Fatture']]
  for (const e of topEsposizioni) {
    espoRows.push([e.ragione_sociale, e.tipo_soggetto || '', e.entrate_residuo, e.uscite_residuo, e.netto, e.n_fatture])
  }
  const ws4 = XLSX.utils.aoa_to_sheet(espoRows)
  ws4['!cols'] = [{ wch: 35 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }]

  // Build workbook
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws1, 'Sommario')
  XLSX.utils.book_append_sheet(wb, ws2, 'Cashflow 90gg')
  XLSX.utils.book_append_sheet(wb, ws3, 'Aging Analysis')
  XLSX.utils.book_append_sheet(wb, ws4, 'Top Esposizioni')

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
  kpis: any, cashflowData: any[], agingCrediti: any[], agingDebiti: any[],
  topEsposizioni: any[], t30: number | null, t60: number | null, t90: number | null, oggi: string
) {
  const html = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <title>Report CFO — EDIL CRM — ${oggi}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; padding: 32px; max-width: 1000px; margin: 0 auto; font-size: 13px; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    h2 { font-size: 16px; margin: 24px 0 10px; border-bottom: 2px solid #e5e7eb; padding-bottom: 4px; }
    .subtitle { color: #6b7280; font-size: 12px; margin-bottom: 20px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
    .kpi-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; text-align: center; }
    .kpi-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #6b7280; letter-spacing: 0.5px; }
    .kpi-value { font-size: 22px; font-weight: 900; margin-top: 4px; font-family: monospace; }
    .positive { color: #047857; background: #ecfdf5; border-color: #a7f3d0; }
    .negative { color: #b91c1c; background: #fef2f2; border-color: #fca5a5; }
    .neutral { color: #1e40af; background: #eff6ff; border-color: #bfdbfe; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { background: #f9fafb; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #6b7280; padding: 8px 10px; text-align: left; border-bottom: 2px solid #e5e7eb; }
    td { padding: 7px 10px; border-bottom: 1px solid #f3f4f6; font-size: 12px; }
    .text-right { text-align: right; }
    .mono { font-family: monospace; }
    .text-green { color: #047857; }
    .text-red { color: #b91c1c; }
    .text-muted { color: #9ca3af; }
    .print-btn { position: fixed; top: 16px; right: 16px; background: #2563eb; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; z-index: 100; }
    .print-btn:hover { background: #1d4ed8; }
    @media print {
      .print-btn { display: none !important; }
      body { padding: 16px; }
    }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Stampa / Salva PDF</button>

  <h1>Report CFO — EDIL CRM</h1>
  <div class="subtitle">Generato il ${oggi}</div>

  <h2>Posizione Attuale</h2>
  <div class="kpi-grid">
    <div class="kpi-card ${kpis.cassa_attuale >= 0 ? 'neutral' : 'negative'}">
      <div class="kpi-label">Cassa Attuale</div>
      <div class="kpi-value">${fmtEuro(kpis.cassa_attuale)}</div>
    </div>
    <div class="kpi-card positive">
      <div class="kpi-label">Da Incassare</div>
      <div class="kpi-value">${fmtEuro(kpis.da_incassare)}</div>
    </div>
    <div class="kpi-card negative">
      <div class="kpi-label">Esposizione Fornitori</div>
      <div class="kpi-value">${fmtEuro(kpis.esposizione_fornitori)}</div>
    </div>
    <div class="kpi-card ${kpis.bilancio_globale >= 0 ? 'positive' : 'negative'}">
      <div class="kpi-label">Posizione Netta</div>
      <div class="kpi-value">${fmtEuro(kpis.bilancio_globale)}</div>
    </div>
  </div>

  <h2>Proiezioni Cashflow</h2>
  <div class="kpi-grid" style="grid-template-columns: repeat(3, 1fr);">
    <div class="kpi-card ${t30 !== null && t30 >= 0 ? 'positive' : 'negative'}">
      <div class="kpi-label">T+30 giorni</div>
      <div class="kpi-value">${t30 !== null ? fmtEuro(t30) : '—'}</div>
    </div>
    <div class="kpi-card ${t60 !== null && t60 >= 0 ? 'positive' : 'negative'}">
      <div class="kpi-label">T+60 giorni</div>
      <div class="kpi-value">${t60 !== null ? fmtEuro(t60) : '—'}</div>
    </div>
    <div class="kpi-card ${t90 !== null && t90 >= 0 ? 'positive' : 'negative'}">
      <div class="kpi-label">T+90 giorni</div>
      <div class="kpi-value">${t90 !== null ? fmtEuro(t90) : '—'}</div>
    </div>
  </div>

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
        <td><strong>${e.ragione_sociale}</strong></td>
        <td>${e.tipo_soggetto || 'N/D'}</td>
        <td class="text-right mono text-green">${e.entrate_residuo > 0 ? fmtEuro(e.entrate_residuo) : '—'}</td>
        <td class="text-right mono text-red">${e.uscite_residuo > 0 ? fmtEuro(e.uscite_residuo) : '—'}</td>
        <td class="text-right mono" style="font-weight:900; color: ${e.netto >= 0 ? '#047857' : '#b91c1c'}">${fmtEuro(e.netto)}</td>
        <td class="text-right text-muted">${e.n_fatture}</td>
      </tr>`).join('')}
    </tbody>
  </table>

  <h2>Aging Analysis — Ritardi</h2>
  <table>
    <thead>
      <tr>
        <th>Fascia</th>
        <th class="text-right">Crediti</th>
        <th class="text-right">N. Fatt. Crediti</th>
        <th class="text-right">Debiti</th>
        <th class="text-right">N. Fatt. Debiti</th>
      </tr>
    </thead>
    <tbody>
      ${agingCrediti.map((c: any, i: number) => `
      <tr>
        <td><strong>${c.label}</strong></td>
        <td class="text-right mono text-green">${fmtEuro(c.importo)}</td>
        <td class="text-right text-muted">${c.count}</td>
        <td class="text-right mono text-red">${fmtEuro(agingDebiti[i]?.importo || 0)}</td>
        <td class="text-right text-muted">${agingDebiti[i]?.count || 0}</td>
      </tr>`).join('')}
    </tbody>
  </table>

</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
