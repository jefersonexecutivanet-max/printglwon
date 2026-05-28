import React, { useState } from "react";
import { Printer, ShieldAlert, Sparkles, Loader2 } from "lucide-react";
import { loginWithGoogle } from "../services/firebase";

interface LoginScreenProps {
  onLoginSuccess: (user: any) => void;
  onEnterAsDemo: () => void;
}

export default function LoginScreen({ onLoginSuccess, onEnterAsDemo }: LoginScreenProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const user = await loginWithGoogle();
      onLoginSuccess(user);
    } catch (err: any) {
      console.error(err);
      setError("Não foi possível autenticar com o Google. Certifique-se de que os cookies de terceiros estão habilitados no navegador.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#060812] flex items-center justify-center p-6" id="login-screen-v2">
      {/* Visual background decoratives */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full filter blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-600/10 rounded-full filter blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md bg-slate-950 border border-slate-900 rounded-2xl p-8 relative overflow-hidden shadow-2xl">
        {/* Glowy bar top */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-amber-500" />

        <div className="flex flex-col items-center text-center mt-4">
          <div className="p-4 bg-blue-600/10 border border-blue-500/20 rounded-2xl text-blue-400 mb-5 relative">
            <Printer className="w-10 h-10 animate-pulse" />
            <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-slate-950 glow-green" />
          </div>
          
          <h1 className="font-display font-medium text-2xl text-white tracking-tight">PrintGlow Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1.5 max-w-sm">
            Sistema profissional de telemetria e monitoramento de ativos e impressoras de rede em tempo real.
          </p>
        </div>

        {error && (
          <div className="mt-6 p-3 bg-red-950/40 border border-red-500/20 rounded-xl flex items-start gap-2.5 text-xs text-red-400">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        <div className="mt-8 space-y-4">
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl font-medium text-sm text-white bg-blue-600 hover:bg-blue-500 transition shadow-lg shadow-blue-600/10 flex items-center justify-center gap-3 cursor-pointer select-none border-t border-blue-400/20 disabled:opacity-50"
            id="btn-login-google"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <svg className="w-5 h-5 fill-current shrink-0" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
            )}
            {loading ? "Autenticando..." : "Entrar com Conta Google"}
          </button>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-slate-900" />
            <span className="flex-shrink mx-4 text-slate-600 text-[10px] uppercase font-mono tracking-widest">Ou</span>
            <div className="flex-grow border-t border-slate-900" />
          </div>

          <button
            onClick={onEnterAsDemo}
            className="w-full py-3 px-4 rounded-xl font-medium text-sm text-slate-300 bg-slate-900 border border-slate-800 hover:bg-slate-800 transition flex items-center justify-center gap-2.5 cursor-pointer select-none"
            id="btn-login-demo"
          >
            <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
            Entrar em Modo Demonstração
          </button>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-900 text-center">
          <p className="text-[10px] text-slate-500">
            Acesso administrativo criptografado em nível comercial.
          </p>
          <p className="text-[9px] text-slate-600 mt-1">
            Revisão de conformidade © 2026 PrintGlow Telemetry.
          </p>
        </div>
      </div>
    </div>
  );
}
