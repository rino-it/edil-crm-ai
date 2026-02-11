import { login, signup } from '../actions'

export default function LoginPage({
  searchParams,
}: {
  searchParams: { message: string }
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-6 shadow-md">
        
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">
            Edil CRM
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Gestione cantieri intelligente
          </p>
        </div>

        {searchParams?.message && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 text-center">
            {searchParams.message}
          </div>
        )}

        <div className="space-y-6">
            {/* FORM DI LOGIN */}
            <form className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700" htmlFor="email">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="admin@impresa.it"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700" htmlFor="password">Password</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="••••••••"
                />
              </div>

              <div className="flex flex-col gap-3">
                <button
                  formAction={login}
                  className="flex w-full justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                >
                  Accedi
                </button>
                <button
                  formAction={signup}
                  className="flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                >
                  Registrati
                </button>
              </div>
            </form>
        </div>
      </div>
    </div>
  )
}