import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'
import { revalidatePath } from 'next/cache'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minuti per pipeline completa

const execFileAsync = promisify(execFile)

// Mutex semplice per impedire esecuzioni concorrenti
let isRunning = false

interface StepResult {
  name: string
  label: string
  status: 'success' | 'error' | 'skipped'
  duration_ms: number
  data?: Record<string, unknown>
  error?: string
}

const STEP_CONFIG: Record<string, { script: string; args: string[]; label: string }> = {
  riconciliazione_xml: {
    script: 'riconciliazione_xml.py',
    args: ['--json'],
    label: 'Importazione XML Fornitori',
  },
  import_fatture_pdf: {
    script: 'import_fatture_pdf.py',
    args: ['--json'],
    label: 'Associazione PDF Fatture',
  },
  crea_scadenze_orfane: {
    script: 'crea_scadenze_orfane.py',
    args: ['--execute', '--json'],
    label: 'Creazione Scadenze Orfane',
  },
}

function findPythonPath(projectRoot: string): string {
  // 1. Env var esplicita
  if (process.env.PYTHON_PATH && fs.existsSync(process.env.PYTHON_PATH)) {
    return process.env.PYTHON_PATH
  }
  // 2. .venv locale al progetto
  const venvPython = path.join(projectRoot, '.venv', 'Scripts', 'python.exe')
  if (fs.existsSync(venvPython)) {
    return venvPython
  }
  // 3. .venv nel repo principale (se siamo in un worktree)
  const mainRepoPython = path.resolve(projectRoot, '..', '..', '.venv', 'Scripts', 'python.exe')
  if (fs.existsSync(mainRepoPython)) {
    return mainRepoPython
  }
  // 4. Fallback: python di sistema
  return 'python'
}

function findScriptsDir(projectRoot: string): string {
  // 1. Env var esplicita (percorso assoluto configurato in .env.local)
  if (process.env.SCRIPTS_DIR && fs.existsSync(process.env.SCRIPTS_DIR)) {
    return process.env.SCRIPTS_DIR
  }
  // 2. scripts/ nella directory corrente
  const localScripts = path.join(projectRoot, 'scripts')
  if (fs.existsSync(localScripts)) {
    return localScripts
  }
  // 3. scripts/ nel repo principale (se siamo in un worktree)
  const mainRepoScripts = path.resolve(projectRoot, '..', '..', 'scripts')
  if (fs.existsSync(mainRepoScripts)) {
    return mainRepoScripts
  }
  return localScripts // fallback, l'errore verrà mostrato sullo script specifico
}

export async function POST(request: Request) {
  // 1. Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }

  // 2. Mutex
  if (isRunning) {
    return NextResponse.json(
      { error: 'Sincronizzazione già in corso. Attendere il completamento.' },
      { status: 429 }
    )
  }

  isRunning = true

  try {
    // 3. Parse body
    const body = await request.json().catch(() => ({}))
    const requestedSteps: string[] = body.steps || ['riconciliazione_xml', 'import_fatture_pdf', 'crea_scadenze_orfane']

    const projectRoot = process.cwd()
    const pythonPath = findPythonPath(projectRoot)
    const scriptsDir = findScriptsDir(projectRoot)

    const results: StepResult[] = []

    // 4. Esecuzione sequenziale
    for (const stepName of requestedSteps) {
      const config = STEP_CONFIG[stepName]
      if (!config) {
        results.push({
          name: stepName,
          label: stepName,
          status: 'skipped',
          duration_ms: 0,
          error: 'Step sconosciuto',
        })
        continue
      }

      const scriptPath = path.join(scriptsDir, config.script)
      if (!fs.existsSync(scriptPath)) {
        results.push({
          name: stepName,
          label: config.label,
          status: 'error',
          duration_ms: 0,
          error: `Script non trovato: ${config.script} (cercato in: ${scriptPath})`,
        })
        continue
      }

      const start = Date.now()
      try {
        const { stdout, stderr } = await execFileAsync(
          pythonPath,
          [scriptPath, ...config.args],
          {
            cwd: scriptsDir,
            timeout: 120000, // 2 minuti per script
            env: { ...process.env },
            maxBuffer: 10 * 1024 * 1024, // 10MB buffer
          }
        )

        // Parse JSON result
        const jsonMatch = stdout.match(/###JSON_RESULT###(.+)/)
        let data: Record<string, unknown> | undefined
        if (jsonMatch) {
          try {
            data = JSON.parse(jsonMatch[1])
          } catch {
            // JSON non valido, ignora
          }
        }

        results.push({
          name: stepName,
          label: config.label,
          status: 'success',
          duration_ms: Date.now() - start,
          data,
        })
      } catch (err: unknown) {
        const error = err as { message?: string; stdout?: string; stderr?: string }
        results.push({
          name: stepName,
          label: config.label,
          status: 'error',
          duration_ms: Date.now() - start,
          error: error.message || 'Errore sconosciuto',
        })
        // Fail-forward: continua con il prossimo step
      }
    }

    // 5. Invalida cache per aggiornare i dati in UI
    revalidatePath('/finanza')
    revalidatePath('/scadenze')

    const allSuccess = results.every(r => r.status === 'success')

    return NextResponse.json({
      success: allSuccess,
      results,
      timestamp: new Date().toISOString(),
    })
  } finally {
    isRunning = false
  }
}
