import { useState } from 'react'

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
    <path d="M3.5 8.5L6.5 11.5L12.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const ArrowIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const ZapIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
)

const BrainIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.54"/>
    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.54"/>
  </svg>
)

const ShieldIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
)

const DatabaseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="5" rx="9" ry="3"/>
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
  </svg>
)

const CodeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 18 22 12 16 6"/>
    <polyline points="8 6 2 12 8 18"/>
  </svg>
)

const agents = [
  { name: 'OpenClaw', logo: 'https://www.openclaw.ai/logo.svg' },
  { name: 'Claude', logo: '' },
  { name: 'Cursor', logo: '' },
  { name: 'Rook', logo: '' },
]

const features = [
  {
    icon: <BrainIcon />,
    title: 'Context-aware tasks',
    desc: 'Keep project history, decisions, and priorities attached to the work so humans and agents see the same context.',
  },
  {
    icon: <DatabaseIcon />,
    title: 'Persistent SQLite storage',
    desc: 'Tasks live in a real database, not a JSON file. Built for developers who want speed and portability.',
  },
  {
    icon: <CodeIcon />,
    title: 'Local task API',
    desc: 'A simple local API keeps the app, chat tools, and database speaking the same task model.',
  },
  {
    icon: <ShieldIcon />,
    title: 'Structured task model',
    desc: 'Projects, tasks, assignees, tags, comments, due dates. A real schema that agents can query and reason over.',
  },
]

const howItWorks = [
  { step: '01', title: 'Create a project', desc: 'Define the project in plain language. FocusClaw structures it — assignees, tags, priority, due dates.' },
  { step: '02', title: 'Assign and prioritize', desc: 'Drop tasks into place with owner filters, tags, priority, due dates, and calendar views.' },
  { step: '03', title: 'Discuss and update', desc: 'Use comments, tags, dates, and owner labels to keep the task record current.' },
]

const faqs = [
  {
    q: 'What makes FocusClaw different from Linear or Asana?',
    a: 'Linear and Asana are broad team tools. FocusClaw is a small local task manager built for humans and agents to share one clear task record.',
  },
  {
    q: 'Do I need to use OpenClaw to use FocusClaw?',
    a: 'No. FocusClaw is useful as a plain task app. OpenClaw can read and update tasks through local tools, but assignment labels do not grant or block execution.',
  },
  {
    q: 'How does the API work?',
    a: 'Standard REST. GET /projects, POST /tasks, PATCH /tasks/:id, DELETE. JSON request/response. Auth via bearer token.',
  },
  {
    q: 'Can I self-host it?',
    a: 'Yes. It\'s SQLite under the hood — one file, no external database dependency. Deploy to any server, any cloud. Your data stays yours.',
  },
  {
    q: 'Can I access FocusClaw from multiple devices?',
    a: 'Yes. FocusClaw is local-first by default, and advanced users can access their own instance privately across devices using Tailscale. Public cloud sync is not required.',
  },
  {
    q: 'Is there a hosted version?',
    a: 'Coming soon. We\'ll offer a managed cloud version for teams who don\'t want to self-host. Self-host remain free.',
  },
]

export default function App() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setSubmitted(true)
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa]">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 backdrop-blur-md bg-[#09090b]/80 border-b border-[#27272a]">
        <div className="flex items-center gap-2 text-lg font-extrabold">
          <img src="/fc-logo.png" alt="" aria-hidden="true" className="w-7 h-7 rounded-lg" />
          <span>FocusClaw</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm text-[#a1a1aa]">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#how" className="hover:text-white transition-colors">How it works</a>
          <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
          <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
        </div>
        <div className="flex items-center gap-3">
          <a href="http://localhost:3001" className="btn-secondary text-sm py-2 px-4" style={{textDecoration:'none'}}>Sign in</a>
          <a href="http://localhost:5173" className="btn-primary text-sm py-2 px-4" style={{textDecoration:'none'}}>
            Open app →
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-[#f53d2d]/5 rounded-full blur-[120px]" />
        </div>
        <div className="relative max-w-4xl mx-auto text-center">
          <div className="badge bg-[#f53d2d]/10 text-[#f53d2d] border border-[#f53d2d]/20 mb-6 animate-fade-in-up">
            <span className="w-1.5 h-1.5 rounded-full bg-[#f53d2d] animate-pulse" />
            Agent-native task management
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 animate-fade-in-up" style={{animationDelay:'0.1s'}}>
            Your agent's<br />
            <span className="gradient-text">second brain</span> for tasks
          </h1>
          <p className="text-xl md:text-2xl text-[#a1a1aa] max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-in-up" style={{animationDelay:'0.2s'}}>
            FocusClaw gives humans and AI agents persistent, structured task context for every project. Owners, due dates, comments, and status stay organized in one place.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in-up" style={{animationDelay:'0.3s'}}>
            <a href="http://localhost:5173" className="btn-primary text-base px-8 py-3 pulse-glow" style={{textDecoration:'none'}}>
              <ZapIcon />
              Start building free
            </a>
            <a href="#features" className="btn-secondary text-base px-8 py-3" style={{textDecoration:'none'}}>
              See how it works
              <ArrowIcon />
            </a>
          </div>
          <p className="text-sm text-[#71717a] mt-4 animate-fade-in-up" style={{animationDelay:'0.4s'}}>
            Self-hosted · SQLite · REST API · Open source
          </p>
        </div>
      </section>

      {/* Social proof bar */}
      <section className="border-y border-[#27272a] py-10 px-6">
        <div className="flex flex-wrap justify-center gap-8 md:gap-16 text-center">
          <div>
            <div className="text-2xl font-extrabold text-[#fafafa]">Open source</div>
            <div className="text-sm text-[#71717a]">MIT license · GitHub free</div>
          </div>
          <div className="w-px bg-[#27272a] hidden md:block" />
          <div>
            <div className="text-2xl font-extrabold text-[#fafafa]">SQLite</div>
            <div className="text-sm text-[#71717a]">Zero external dependency</div>
          </div>
          <div className="w-px bg-[#27272a] hidden md:block" />
          <div>
            <div className="text-2xl font-extrabold text-[#fafafa]">REST API</div>
            <div className="text-sm text-[#71717a]">Plain CRUD · Local-first</div>
          </div>
          <div className="w-px bg-[#27272a] hidden md:block" />
          <div>
            <div className="text-2xl font-extrabold text-[#fafafa]">Free</div>
            <div className="text-sm text-[#71717a]">Self-host forever</div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Built for agents first</h2>
            <p className="text-[#a1a1aa] text-lg max-w-xl mx-auto">Human-friendly task management with the structured fields an AI agent can read, update, and coordinate through.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {features.map((f) => (
              <div key={f.title} className="card card-hover p-6">
                <div className="w-10 h-10 bg-[#f53d2d]/10 rounded-lg flex items-center justify-center text-[#f53d2d] mb-4">
                  {f.icon}
                </div>
                <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
                <p className="text-[#a1a1aa] leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="py-20 px-6 bg-[#0f0f11]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">How it works</h2>
            <p className="text-[#a1a1aa] text-lg">Three steps from "what's next?" to a useful task record.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {howItWorks.map((h, i) => (
              <div key={h.step} className="relative card p-8">
                <div className="text-6xl font-extrabold text-[#27272a] absolute top-4 right-6">{h.step}</div>
                <h3 className="font-bold text-xl mb-3 mt-4">{h.title}</h3>
                <p className="text-[#a1a1aa] leading-relaxed">{h.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For agents */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="badge bg-[#f53d2d]/10 text-[#f53d2d] border border-[#f53d2d]/20 mb-4">For AI agents</div>
              <h2 className="text-4xl md:text-5xl font-bold mb-6">A task record your agent can read</h2>
              <p className="text-[#a1a1aa] text-lg leading-relaxed mb-6">
                FocusClaw keeps work in a structured local database so humans and agents can create tasks, comment, update fields, and see the same context.
              </p>
              <ul className="space-y-3">
                {[
                  'Task creation and updates via REST API',
                  'Structured project/task hierarchy',
                  'Owner labels for User, Agent, or Unassigned',
                  'Priority, tags, due dates, comments',
                  'No scheduled automation queue',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-[#a1a1aa]">
                    <span className="text-[#22c55e]"><CheckIcon /></span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="card p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-[#f53d2d]" />
                <div className="w-3 h-3 rounded-full bg-[#71717a]" />
                <div className="w-3 h-3 rounded-full bg-[#71717a]" />
                <span className="ml-2 text-sm text-[#71717a]">agent-task.ts</span>
              </div>
              <pre className="text-sm text-[#a1a1aa] overflow-x-auto leading-relaxed">
                <code>{`// Label a task for the agent
const task = await fetch('/api/tasks', {
  method: 'POST',
  headers: { Authorization: 'Bearer <token>' },
  body: JSON.stringify({
    projectId: 'proj_alpha',
    title: 'Ship landing page by Friday',
    assignee: 'agent',
    priority: 'high',
    tags: ['marketing', 'launch'],
    dueDate: '2026-05-08',
  }),
})

// Later, anyone can update the task record
await fetch('/api/tasks/' + task.id, {
  method: 'PATCH',
  body: JSON.stringify({ archived: true }),
})`}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-6 bg-[#0f0f11]">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Simple, honest pricing</h2>
            <p className="text-[#a1a1aa] text-lg">Free forever for self-host. Pay for convenience.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {/* Free */}
            <div className="card p-8">
              <h3 className="text-xl font-bold mb-2">Self-host</h3>
              <p className="text-4xl font-extrabold mb-1">Free</p>
              <p className="text-[#71717a] text-sm mb-6">Forever. No catches.</p>
              <ul className="space-y-3 mb-8">
                {['Unlimited projects & tasks', 'SQLite storage', 'Local task API', 'Owner filters and calendar views', 'Comments and activity'].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm text-[#a1a1aa]">
                    <span className="text-[#22c55e]"><CheckIcon /></span>
                    {item}
                  </li>
                ))}
              </ul>
              <a href="http://localhost:5173" className="btn-secondary w-full justify-center text-sm py-3" style={{textDecoration:'none'}}>
                Get started
              </a>
            </div>
            {/* Cloud */}
            <div className="card p-8 border-[#f53d2d]/30 glow relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 badge bg-[#f53d2d] text-white text-xs">Coming soon</div>
              <h3 className="text-xl font-bold mb-2">Cloud</h3>
              <p className="text-4xl font-extrabold mb-1">$0<span className="text-lg font-normal text-[#71717a]">/mo</span></p>
              <p className="text-[#71717a] text-sm mb-6">Managed for you. Always on.</p>
              <ul className="space-y-3 mb-8">
                {['Everything in Self-host', 'Always-on hosted infra', 'Auto-scaling for teams', 'Team-ready API access', 'Email support'].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm text-[#a1a1aa]">
                    <span className="text-[#22c55e]"><CheckIcon /></span>
                    {item}
                  </li>
                ))}
              </ul>
              <button className="btn-primary w-full justify-center text-sm py-3 opacity-50 cursor-not-allowed" disabled>
                Coming soon
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Questions?</h2>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="card overflow-hidden">
                <button
                  className="w-full text-left px-6 py-5 flex items-center justify-between gap-4"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className="font-medium text-[#fafafa]">{faq.q}</span>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={`flex-shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`}>
                    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-5 text-[#a1a1aa] leading-relaxed border-t border-[#27272a] pt-4">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">Ready to give your agent a memory?</h2>
          <p className="text-[#a1a1aa] text-lg mb-8">Join the developers building a calmer shared task source of truth with FocusClaw.</p>
          {!submitted ? (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input flex-1"
                required
              />
              <button type="submit" className="btn-primary whitespace-nowrap">
                Get early access
              </button>
            </form>
          ) : (
            <div className="card p-6 max-w-md mx-auto">
              <span className="text-[#22c55e]"><CheckIcon /></span>
              <p className="text-[#fafafa] font-medium mt-2">You're on the list. We'll be in touch.</p>
            </div>
          )}
          <a href="http://localhost:5173" className="btn-secondary mt-4" style={{textDecoration:'none'}}>
            Try the live demo →
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#27272a] py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm font-bold">
            <img src="/fc-logo.png" alt="" aria-hidden="true" className="w-6 h-6 rounded-md" />
            <span>FocusClaw</span>
          </div>
          <p className="text-sm text-[#71717a]">© 2026 FocusClaw. Open source under MIT.</p>
          <div className="flex gap-6 text-sm text-[#71717a]">
            <a href="https://github.com/emiliojohann/focusclaw" className="hover:text-white transition-colors">GitHub</a>
            <a href="https://github.com/emiliojohann/focusclaw" className="hover:text-white transition-colors">Docs</a>
            <a href="https://github.com/emiliojohann/focusclaw" className="hover:text-white transition-colors">Changelog</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
