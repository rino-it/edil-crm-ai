import { redirect } from 'next/navigation';

export default function ScadenzeRootPage() {
  // Reindirizza l'utente alla tab principale
  redirect('/scadenze/da-pagare');
}