'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { login, signup } from '../actions'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Eye, EyeOff } from "lucide-react"

function LoginFormContent() {
  const searchParams = useSearchParams()
  const message = searchParams.get('message')
  
  // Stato per gestire la visibilità della password
  const [showPassword, setShowPassword] = useState(false)

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="text-center space-y-1">
        <CardTitle className="text-2xl font-bold">Edil CRM</CardTitle>
        <CardDescription>
          Inserisci le tue credenziali per accedere ai cantieri
        </CardDescription>
      </CardHeader>
      <CardContent>
        {message && (
          <div className="mb-4 rounded-md bg-destructive/15 p-3 text-sm text-destructive text-center font-medium">
            {message}
          </div>
        )}
        
        <form className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input 
              id="email" 
              name="email" 
              type="email" 
              placeholder="nome@impresa.it" 
              required 
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input 
                id="password" 
                name="password" 
                // Qui cambiamo dinamicamente il tipo dell'input
                type={showPassword ? "text" : "password"} 
                required 
                className="pr-10" // Spazio a destra per non sovrapporre l'icona
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="sr-only">Mostra/Nascondi password</span>
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-2">
            <Button formAction={login} className="w-full">
              Accedi
            </Button>
            
            <div className="flex items-center gap-2">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">OPPURE</span>
              <Separator className="flex-1" />
            </div>

            <Button formAction={signup} variant="outline" className="w-full">
              Registrati come nuovo utente
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      {/* Suspense è necessario perché usiamo useSearchParams in un Client Component */}
      <Suspense fallback={<div className="text-center">Caricamento...</div>}>
        <LoginFormContent />
      </Suspense>
    </div>
  )
}