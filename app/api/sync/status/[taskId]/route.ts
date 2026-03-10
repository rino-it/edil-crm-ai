import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }

  const { taskId } = await params

  const { data, error } = await supabase
    .from('sync_tasks')
    .select('id, status, created_at, started_at, completed_at, results, error')
    .eq('id', taskId)
    .eq('requested_by', user.id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Task non trovato' }, { status: 404 })
  }

  return NextResponse.json(data)
}
