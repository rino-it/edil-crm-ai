import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

export async function updateSession(request: NextRequest) {
  // 1. Crea una risposta vuota iniziale
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // 2. Inizializza il client Supabase
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Aggiorna i cookie sia nella richiesta che nella risposta
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 3. Controlla l'utente
  // IMPORTANTE: Questo aggiorna il token se è scaduto
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 4. Protezione Rotte
  // FIX: Abbiamo aggiunto il controllo per escludere le rotte "/api" dal redirect forzato.
  // Meta deve poter accedere a /api/webhook/whatsapp senza fare login.
  if (
    !user && 
    !request.nextUrl.pathname.startsWith("/login") && 
    !request.nextUrl.pathname.startsWith("/auth") &&
    !request.nextUrl.pathname.startsWith("/api") // <--- QUESTA È LA RIGA AGGIUNTA CHE RISOLVE L'ERRORE META
  ) {
    // Lo rispediamo al login
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}