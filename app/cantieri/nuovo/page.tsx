import { creaCantiere } from '../actions'

export default function NuovoCantierePage() {
  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">Nuovo Cantiere</h1>
      
      <form action={creaCantiere} className="space-y-4 bg-white p-6 rounded-lg shadow border">
        
        <div>
          <label className="block text-sm font-medium mb-1">Codice Cantiere</label>
          <input name="codice" type="text" required placeholder="Es. CANT-2024-01" 
            className="w-full border rounded p-2" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Descrizione / Nome</label>
          <input name="descrizione" type="text" required placeholder="Ristrutturazione Villa Rossi" 
            className="w-full border rounded p-2" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Indirizzo</label>
          <input name="indirizzo" type="text" placeholder="Via Roma 10, Milano" 
            className="w-full border rounded p-2" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Budget (€)</label>
          <input name="budget" type="number" step="0.01" placeholder="50000" 
            className="w-full border rounded p-2" />
        </div>

        <button type="submit" 
          className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 font-medium">
          Salva Cantiere
        </button>
      </form>
    </div>
  )
}