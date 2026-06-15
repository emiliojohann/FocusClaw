import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE, apiKey } from '@/lib/api'

export default function SetupPage() {
  const navigate = useNavigate()
  const [key, setKey] = useState(apiKey.get())
  const [error, setError] = useState('')
  const [isHovering, setIsHovering] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!key.trim()) {
      setError('Please enter your API key')
      return
    }
    apiKey.set(key.trim())
    navigate('/')
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-violet-900/10 to-indigo-900/20" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-600/20 rounded-full blur-3xl animate-float" style={{ animationDelay: '-3s' }} />
      
      {/* Grid pattern */}
      <div className="absolute inset-0 opacity-20" style={{
        backgroundImage: `linear-gradient(rgba(139, 92, 246, 0.1) 1px, transparent 1px),
                         linear-gradient(90deg, rgba(139, 92, 246, 0.1) 1px, transparent 1px)`,
        backgroundSize: '50px 50px'
      }} />

      <div className="relative z-10 w-full max-w-md px-6">
        {/* Logo & Title */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 mb-6 glow-accent animate-pulse-glow">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold text-white mb-3">
            Focus<span className="gradient-text">Claw</span>
          </h1>
          <p className="text-gray-400 text-lg">Agent-native task collaboration</p>
        </div>

        {/* Card */}
        <div className="glass-card rounded-2xl p-8 gradient-border">
          <h2 className="text-xl font-semibold text-white mb-2">Connect to your workspace</h2>
          <p className="text-gray-400 text-sm mb-6">
            Save the API key only when your FocusClaw API was started with <code className="text-purple-400 bg-purple-900/30 px-2 py-0.5 rounded">API_KEY</code>. Local auth is disabled when that variable is unset.
          </p>
          <p className="text-gray-500 text-xs mb-4">API base: <code className="text-gray-300">{API_BASE}</code></p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <input
                type="text"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="Enter your API key"
                className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3.5 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all font-mono text-sm"
                autoFocus
              />
              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-purple-500/0 via-purple-500/5 to-indigo-500/0 pointer-events-none opacity-0 focus-within:opacity-100 transition-opacity" />
            </div>

            {error && (
              <p className="text-red-400 text-sm flex items-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {error}
              </p>
            )}

            <button
              type="submit"
              onMouseEnter={() => setIsHovering(true)}
              onMouseLeave={() => setIsHovering(false)}
              className="w-full relative overflow-hidden bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold py-3.5 rounded-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98]"
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                Connect
                <svg className={`w-4 h-4 transition-transform ${isHovering ? 'translate-x-1' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-indigo-600 opacity-0 hover:opacity-100 transition-opacity" />
            </button>
            <button
              type="button"
              onClick={() => { apiKey.clear(); navigate('/') }}
              className="w-full text-gray-400 hover:text-white text-sm transition-colors"
            >
              Continue without an API key
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-gray-500 text-xs mt-8">
          Your data stays local. Always.
        </p>
      </div>
    </div>
  )
}
