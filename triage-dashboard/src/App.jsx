import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { MsalProvider, useMsal } from '@azure/msal-react'
import { PublicClientApplication, InteractionStatus } from '@azure/msal-browser'
import { msalConfig, loginRequest, apiRequest } from './authConfig'
import './App.css'
import logo from './assets/logo.PNG'

const msalInstance = new PublicClientApplication(msalConfig)
const API_URL = import.meta.env.VITE_API_URL || ''
const sev = (s) => (s ?? '').toLowerCase()

const ROLES = { DISPATCHER:'dispatcher', ENGINEER:'engineer', MANAGER:'manager', AUDITOR:'auditor', ADMIN:'admin' }
const can = (role, ...allowed) => allowed.includes(role)
const jobKey = (id) => String(id)

let _tid = 0
function useToasts() {
  const [toasts, setToasts] = useState([])
  const add = useCallback((msg, type='info') => {
    const id = ++_tid
    setToasts(p => [...p, { id, msg, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500)
  }, [])
  return { toasts, add }
}

function AnimatedNumber({ value }) {
  const [display, setDisplay] = useState(value)
  const prev = useRef(value)
  useEffect(() => {
    if (prev.current === value) return
    const start = prev.current, diff = value - start, steps = 20
    let i = 0
    const iv = setInterval(() => {
      i++; setDisplay(Math.round(start + diff * i / steps))
      if (i >= steps) { clearInterval(iv); prev.current = value }
    }, 18)
    return () => clearInterval(iv)
  }, [value])
  return <>{display}</>
}

function LoginPage() {
  const { instance, inProgress } = useMsal()
  const [loading, setLoading] = useState(false)
  const [email,   setEmail]   = useState('')
  const [error,   setError]   = useState('')
  const { toasts, add: toast } = useToasts()

  const handleLogin = async (e) => {
    e.preventDefault()
    if (inProgress !== InteractionStatus.None) return
    if (!email.trim())        { setError('Please enter your email address'); return }
    if (!email.includes('@')) { setError('Please enter a valid email address'); return }
    setError(''); setLoading(true)
    try {
      await instance.loginRedirect({ ...loginRequest, loginHint: email.trim() })
    } catch (err) {
      toast(`Login error: ${err?.message || 'Unknown error'}`, 'error')
      setLoading(false)
    }
  }

  return (
    <div className="login-shell">
      <div className="toast-stack">{toasts.map(t=><div key={t.id} className={`toast toast-${t.type}`}>{t.msg}</div>)}</div>
      <div className="login-left">
        <div className="login-left-inner">
          <div className="login-logo-hero"><img src={logo} alt="L'Avenir" className="login-logo-large"/></div>
          <div className="login-hero">
            <h1 className="login-hero-title">Predict. Protect.<br/>Prevent.</h1>
            <p className="login-hero-desc">AI-powered predictive maintenance with full human oversight, SOP-grounded guidance, and enterprise audit traceability.</p>
          </div>
          <div className="login-stats">
            {[{val:'16K+',label:'Sensor readings'},{val:'24',label:'Equipment manuals'},{val:'5',label:'AI agents'}].map(s=>(
              <div key={s.label} className="login-stat">
                <div className="login-stat-val">{s.val}</div>
                <div className="login-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="login-powered">
            <span className="login-powered-label">Powered by</span>
            <div className="login-powered-badges">
              <span className="login-badge">Microsoft Fabric</span>
              <span className="login-badge">Azure AI Foundry</span>
              <span className="login-badge">GPT-4.1-mini</span>
            </div>
          </div>
        </div>
      </div>
      <div className="login-right">
        <div className="login-card">
          {loading ? (
            <div className="login-authenticating">
              <div className="login-auth-spinner"/>
              <div className="login-auth-title">Redirecting to Microsoft</div>
              <div className="login-auth-sub">Verifying your identity and role assignment…</div>
              <div className="login-auth-email">{email}</div>
            </div>
          ) : (
            <>
              <div className="login-card-header">
                <div className="login-card-title">Sign in</div>
                <div className="login-card-sub">Use your Microsoft work account</div>
              </div>
              <form onSubmit={handleLogin} style={{display:'flex',flexDirection:'column',gap:'14px'}}>
                <div className="login-field">
                  <label className="login-field-label">Work email address</label>
                  <input className={`login-email-input${error?' login-email-input--error':''}`}
                    type="email" placeholder="you@yourorganisation.com"
                    value={email} onChange={e=>{setEmail(e.target.value);setError('')}}
                    disabled={loading||inProgress!==InteractionStatus.None} autoFocus/>
                  {error&&<div className="login-field-error">{error}</div>}
                </div>
                <button type="submit" className="login-ms-btn"
                  disabled={loading||!email.trim()||inProgress!==InteractionStatus.None}>
                  <svg width="18" height="18" viewBox="0 0 21 21" fill="none">
                    <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                    <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                    <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                    <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
                  </svg>
                  Continue with Microsoft
                </button>
              </form>
            </>
          )}
          <div className="login-card-footer">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="7" width="12" height="8" rx="2" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            Secured by Azure Entra ID · Role-based access control
          </div>
        </div>
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="k-card skeleton">
      <div className="sk-line sk-title"/><div className="sk-block"/>
      <div className="sk-line sk-short"/><div className="sk-line sk-btn"/>
    </div>
  )
}

function DonutChart({ pct, color='#3b82f6', size=160, label='' }) {
  const r=52, cx=80, cy=80, circ=2*Math.PI*r
  const filled=Math.min((pct/100)*circ, circ-0.01)
  return (
    <svg width={size} height={size} viewBox="0 0 160 160">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth="16"/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="16"
        strokeDasharray={`${filled} ${circ-filled}`} strokeLinecap="round"
        transform="rotate(-90 80 80)" style={{transition:'stroke-dasharray 1s cubic-bezier(0.4,0,0.2,1)'}}/>
      <text x={cx} y={cy-10} textAnchor="middle" fontSize="26" fontWeight="700" fill="#0f172a" fontFamily="monospace">{pct}%</text>
      <text x={cx} y={cy+12} textAnchor="middle" fontSize="11" fill="#64748b">{label}</text>
    </svg>
  )
}

function Sparkline({ values, color='#3b82f6' }) {
  if (!values||values.length<2) return null
  const W=60,H=24,pad=2,min=Math.min(...values),range=Math.max(...values)-min||1
  const pts=values.map((v,i)=>`${pad+(i/(values.length-1))*(W-pad*2)},${H-pad-((v-min)/range)*(H-pad*2)}`).join(' ')
  return <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
}

function RoleTopbar({ user, onLogout }) {
  return (
    <nav className="topbar" style={{justifyContent:'flex-end'}}>
      <div className="brand-area" style={{flex:1}}>
        <img src={logo} alt="L'Avenir" className="brand-logo"/>
        <span className="brand-title">L'Avenir Smart Operating Framework</span>
      </div>
      <div className="topbar-right">
        <div className="user-pill">
          <div className="user-pill-avatar">{user.name.charAt(0).toUpperCase()}</div>
          <span className="user-pill-name">{user.name}</span>
          <span className={`user-pill-role user-pill-role--${user.role}`}>{user.role}</span>
          <button className="user-pill-logout" onClick={onLogout} title="Sign out">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M10 11l3-3-3-3M13 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </nav>
  )
}

function ManagerDashboard({ escalated, onClose, onAccept, onDecline }) {
  const [declineOpen,   setDeclineOpen]   = useState({})
  const [declineReason, setDeclineReason] = useState({})
  const pending  = escalated.filter(e=>!e.manager_outcome)
  const actioned = escalated.filter(e=> e.manager_outcome)

  const renderCard = (item, idx) => {
    const isOpen = declineOpen[item.equipment_id]
    return (
      <div key={idx} className={`mgr-card mgr-card--${sev(item.severity)}`}>
        <div className="mgr-card-head">
          <div><div className="mgr-card-id">{item.equipment_id}</div><div className="mgr-card-sub">{item.building_id||'—'} · {item.time}</div></div>
          <span className={`sev-badge sev-${sev(item.severity)}`}>{item.severity}</span>
        </div>
        <div className="mgr-card-detail">
          <div className="mgr-detail-row"><span className="mgr-detail-lbl">Fault</span><span className="mgr-detail-val">{item.fault_type} · {item.fault_value}</span></div>
          <div className="mgr-detail-row"><span className="mgr-detail-lbl">Department</span><span className="mgr-detail-val">{item.assigned_department||'Unassigned'}</span></div>
          <div className="mgr-detail-row"><span className="mgr-detail-lbl">Escalated by</span><span className="mgr-detail-val">{item.escalated_by||'Dispatcher'}</span></div>
        </div>
        <div className="mgr-reason-box"><div className="mgr-reason-label">Escalation reason</div><div className="mgr-reason-text">{item.reason}</div></div>
        <p className="k-summary">{item.issue_summary}</p>
        {isOpen ? (
          <div className="decline-row">
            <input className="decline-input" placeholder="Decline reason..." value={declineReason[item.equipment_id]||''}
              onChange={e=>setDeclineReason(p=>({...p,[item.equipment_id]:e.target.value}))}
              onKeyDown={e=>e.key==='Enter'&&onDecline(item,declineReason[item.equipment_id])}/>
            <button className="k-btn k-confirm" onClick={()=>onDecline(item,declineReason[item.equipment_id])}>Submit</button>
            <button className="k-btn k-cancel" onClick={()=>setDeclineOpen(p=>({...p,[item.equipment_id]:false}))}>✕</button>
          </div>
        ) : (
          <div className="btn-row">
            <button className="k-btn k-accept" onClick={()=>onAccept(item)}>Create Work Ticket</button>
            <button className="k-btn k-decline" onClick={()=>setDeclineOpen(p=>({...p,[item.equipment_id]:true}))}>Decline</button>
          </div>
        )}
      </div>
    )
  }

  const renderActioned = (item, idx) => (
    <div key={idx} className={`mgr-card mgr-card--actioned ${item.manager_outcome==='accepted'?'mgr-card--done':'mgr-card--declined'}`}>
      <div className="mgr-card-head">
        <div><div className="mgr-card-id">{item.equipment_id}</div><div className="mgr-card-sub">{item.time}</div></div>
        <span className={`mgr-outcome-badge ${item.manager_outcome==='accepted'?'outcome-accepted':'outcome-declined'}`}>
          {item.manager_outcome==='accepted'?'✓ Accepted':'✗ Declined'}
        </span>
      </div>
      {item.manager_ticket&&<div className="mgr-detail-row"><span className="mgr-detail-lbl">Ticket</span><span className="mgr-detail-val mono">{item.manager_ticket}</span></div>}
      <div className="mgr-detail-row"><span className="mgr-detail-lbl">Decided by</span><span className="mgr-detail-val">{item.decided_by}</span></div>
    </div>
  )

  return (
    <div className="mgr-shell">
      <header className="ent-header">
        <button className="ent-back-btn" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Operations
        </button>
        <div className="ent-header-center">
          <div className="ent-header-title">Manager Review Queue</div>
          <div className="ent-header-meta"><span className="ent-meta-pill">Second Reviewer</span><span className="ent-meta-sep">·</span><span>{pending.length} pending · {actioned.length} actioned</span></div>
        </div>
        {pending.length>0&&<span className="mgr-pending-badge">{pending.length} awaiting review</span>}
      </header>
      <div className="mgr-body">
        <div className="mgr-section">
          <div className="mgr-section-title"><span className="mgr-section-dot mgr-dot--amber"/>Pending Review<span className="col-count">{pending.length}</span></div>
          {pending.length===0?<div className="k-empty-state"><span>No items pending review</span></div>:<div className="mgr-grid">{pending.map(renderCard)}</div>}
        </div>
        {actioned.length>0&&(
          <div className="mgr-section">
            <div className="mgr-section-title"><span className="mgr-section-dot mgr-dot--green"/>Actioned<span className="col-count">{actioned.length}</span></div>
            <div className="mgr-grid">{actioned.map(renderActioned)}</div>
          </div>
        )}
      </div>
    </div>
  )
}

function AuditDashboard({ data, onClose, isAuditor=false, currentUser, onLogout }) {
  const [tab,     setTab]     = useState('overview')
  const [search,  setSearch]  = useState('')
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const records = useMemo(()=>data?.records||[],[data])
  const stats   = useMemo(()=>data?.stats||{},[data])
  const pct     = parseFloat(stats?.completion_rate)||0
  const checks  = [
    {label:'All work orders carry a ticket ID',             ok:records.filter(r=>r.record_type==='WORK_ORDER').every(r=>r.ticket_id)},
    {label:`Completion rate meets 70% threshold (${pct}%)`, ok:pct>=70},
    {label:'No records missing department',                 ok:records.every(r=>r.department&&r.department!=='Unknown')},
    {label:'All escalations have documented reasons',       ok:records.filter(r=>r.record_type==='ESCALATION').every(r=>r.escalation_reason)},
    {label:'No critical faults left unresolved',            ok:!records.some(r=>(r.severity||'').toLowerCase()==='critical'&&r.status==='IN_PROGRESS')},
  ]
  const passCount     = checks.filter(c=>c.ok).length
  const compliancePct = Math.round((passCount/checks.length)*100)
  const filtered = useMemo(()=>{
    let r=[...records]
    if(search) r=r.filter(x=>['equipment_id','ticket_id','severity','department','status','accepted_by','completed_by'].some(k=>(x[k]||'').toLowerCase().includes(search.toLowerCase())))
    if(sortCol) r.sort((a,b)=>{const av=(a[sortCol]||'').toLowerCase(),bv=(b[sortCol]||'').toLowerCase();return sortDir==='asc'?av.localeCompare(bv):bv.localeCompare(av)})
    return r
  },[records,search,sortCol,sortDir])
  const exportCSV=()=>{
    const h=['Equipment','Ticket','Severity','Type','Department','Time','Status','Ticket Created By','Completed By','Completed At']
    const rows=records.map(r=>[r.equipment_id,r.ticket_id||'',r.severity,r.record_type,r.department,r.dispatched_at,r.status,r.accepted_by||'',r.completed_by||'',r.completed_at||''])
    const csv=[h,...rows].map(r=>r.map(c=>`"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n')
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}))
    Object.assign(document.createElement('a'),{href:url,download:`audit-${new Date().toISOString().slice(0,10)}.csv`}).click()
    URL.revokeObjectURL(url)
  }
  const tabs=[{id:'overview',label:'Overview'},{id:'records',label:`Records (${records.length})`},{id:'compliance',label:'Compliance'},{id:'export',label:'Export'}]
  return (
    <div className="ent-shell">
      {isAuditor&&currentUser&&onLogout&&<RoleTopbar user={currentUser} onLogout={onLogout}/>}
      <header className="ent-header">
        {!isAuditor&&(
          <button className="ent-back-btn" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Operations
          </button>
        )}
        <div className="ent-header-center">
          <div className="ent-header-title">Audit &amp; Compliance Register</div>
          <div className="ent-header-meta"><span className="ent-meta-pill">{data?.period||'Session'}</span><span className="ent-meta-sep">·</span><span>{stats?.total_records||0} records</span></div>
        </div>
        <div className="ent-header-actions">
          <button className="ent-action-btn ent-action-btn--primary" onClick={exportCSV}>Export CSV</button>
        </div>
      </header>
      <div className="ent-tab-strip">
        {tabs.map(t=><button key={t.id} className={`ent-tab${tab===t.id?' ent-tab--active':''}`} onClick={()=>setTab(t.id)}>{t.label}</button>)}
        <div className="ent-tab-fill"/>
        <span className={`ent-compliance-chip${compliancePct===100?' pass':compliancePct>=60?' warn':' fail'}`}>{passCount}/{checks.length} checks</span>
      </div>
      <div className="ent-body">
        {tab==='overview'&&(
          <div className="ent-overview">
            <div className="ent-kpi-row">
              {[
                {label:'Total',      val:stats?.total_records||0, color:'#0f172a',spark:[2,3,4,3,5,stats?.total_records||0]},
                {label:'Completed',  val:stats?.completed||0,     color:'#10b981',spark:[0,1,1,2,2,stats?.completed||0]},
                {label:'In Progress',val:stats?.in_progress||0,   color:'#3b82f6',spark:[1,2,3,2,1,stats?.in_progress||0]},
                {label:'Escalated',  val:stats?.escalated||0,     color:'#f59e0b',spark:[0,0,1,1,0,stats?.escalated||0]},
                {label:'Rate',       val:`${pct}%`,               color:pct>=70?'#10b981':'#ef4444',spark:[40,50,55,60,65,pct]},
              ].map(k=>(
                <div key={k.label} className="ent-kpi-card">
                  <div className="ent-kpi-top"><div><div className="ent-kpi-val" style={{color:k.color}}>{k.val}</div><div className="ent-kpi-label">{k.label}</div></div><Sparkline values={k.spark} color={k.color}/></div>
                </div>
              ))}
            </div>
            <div className="ent-chart-card ent-chart-card--full">
              <div className="ent-chart-header"><div className="ent-chart-title"><span className="ent-ai-badge">AI</span>Compliance Summary</div></div>
              <div className="ent-ai-text">{data?.ai_summary||'No summary available.'}</div>
            </div>
          </div>
        )}
        {tab==='records'&&(
          <div className="ent-records">
            <div className="ent-records-toolbar">
              <div className="ent-search-box"><input className="ent-search" placeholder="Filter records…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
              <div className="ent-records-count">{filtered.length} of {records.length}</div>
            </div>
            <div className="ent-table-wrap">
              <table className="ent-table">
                <thead><tr>{[['equipment_id','Equipment'],['ticket_id','Ticket'],['severity','Severity'],['department','Department'],['accepted_by','Ticket Created By'],['completed_by','Completed By'],['status','Status']].map(([k,l])=>(
                  <th key={k} className="ent-th-sortable" onClick={()=>{if(sortCol===k)setSortDir(d=>d==='asc'?'desc':'asc');else{setSortCol(k);setSortDir('asc')}}}>{l}</th>
                ))}</tr></thead>
                <tbody>
                  {filtered.map((r,i)=>(
                    <tr key={i}>
                      <td className="mono">{r.equipment_id}</td>
                      <td className="mono">{r.ticket_id||'—'}</td>
                      <td><span className={`sev-badge sev-${(r.severity||'').toLowerCase()}`}>{r.severity}</span></td>
                      <td>{r.department}</td>
                      <td style={{fontSize:'12px',fontWeight:'500'}}>{r.accepted_by?String(r.accepted_by).split(':').pop().trim():'—'}</td>
                      <td style={{fontSize:'12px',fontWeight:'500'}}>{r.completed_by?String(r.completed_by).split(':').pop().trim():'—'}</td>
                      <td><span className={`ent-status-badge ent-status--${r.status==='COMPLETE'?'complete':r.record_type==='ESCALATION'?'escalated':'progress'}`}>{r.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {tab==='compliance'&&(
          <div className="ent-compliance">
            <div className="ent-compliance-hero">
              <DonutChart pct={compliancePct} color={compliancePct===100?'#10b981':compliancePct>=60?'#f59e0b':'#ef4444'} size={160} label="score"/>
              <div className="ent-compliance-hero-text">
                <div className="ent-compliance-headline">{compliancePct===100?'Fully Compliant':compliancePct>=60?'Partially Compliant':'Issues Detected'}</div>
                <div className="ent-compliance-chips"><span className="ent-compliance-chip pass">{checks.filter(c=>c.ok).length} Passed</span><span className="ent-compliance-chip fail">{checks.filter(c=>!c.ok).length} Failed</span></div>
              </div>
            </div>
            <div className="ent-checklist-card">
              {checks.map((item,i)=>(
                <div key={i} className={`ent-check-row${item.ok?' ent-check-row--pass':' ent-check-row--fail'}`}>
                  <div className={`ent-check-icon${item.ok?' pass':' fail'}`}>{item.ok?'✓':'✗'}</div>
                  <span className="ent-check-label">{item.label}</span>
                  <span className={`ent-check-tag${item.ok?' pass':' fail'}`}>{item.ok?'PASS':'FAIL'}</span>
                </div>
              ))}
            </div>
            <div className="ent-chart-card ent-chart-card--full">
              <div className="ent-chart-header"><div className="ent-chart-title"><span className="ent-ai-badge">AI</span>Audit Narrative</div></div>
              <div className="ent-ai-text" style={{whiteSpace:'pre-wrap'}}>{data?.ai_summary}</div>
            </div>
          </div>
        )}
        {tab==='export'&&(
          <div className="ent-export">
            <div className="ent-export-grid">
              <div className="ent-export-card">
                <div className="ent-export-card-title">CSV Export</div>
                <p className="ent-export-card-desc">Import into Power BI, Excel, Tableau, or Google Looker Studio.</p>
                <button className="ent-export-btn" onClick={exportCSV}>Download .csv</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function AuditorLanding({ onGenerate, loading, currentUser, onLogout }) {
  return (
    <div className="dash" style={{display:'flex',flexDirection:'column',minHeight:'100vh'}}>
      <RoleTopbar user={currentUser} onLogout={onLogout}/>
      <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'24px'}}>
        <img src={logo} alt="L'Avenir" style={{height:'48px',opacity:0.9}}/>
        <div style={{textAlign:'center'}}>
          <div style={{fontSize:'22px',fontWeight:'700',color:'#0f172a',marginBottom:'8px'}}>Audit &amp; Compliance Dashboard</div>
          <div style={{fontSize:'14px',color:'#64748b',maxWidth:'400px'}}>Generate the session audit register to review compliance, work orders, and escalation records.</div>
        </div>
        <button className={`btn-audit${loading?' scanning':''}`} style={{padding:'12px 32px',fontSize:'14px'}} onClick={onGenerate} disabled={loading}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/><rect x="9" y="1.5" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/><rect x="1.5" y="9" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/><rect x="9" y="9" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/></svg>
          {loading?'Generating Report…':'Generate Audit Report'}
        </button>
      </div>
    </div>
  )
}

function SOPChatPanel({ open, onClose, initialContext, getToken }) {
  const [messages, setMessages] = useState([])
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const bottomRef = useRef(null)

  useEffect(()=>{
    if(!open) return
    setMessages([initialContext?.equipment_id
      ?{role:'assistant',content:`Hello! I'm your SOP Guidance Agent. Working on **${initialContext.equipment_id}** — **${initialContext.fault_context}**.\n\nWhat would you like to know?`}
      :{role:'assistant',content:"Hello! I'm your SOP Guidance Agent. Ask me about HVAC, pumps, chillers, or cooling towers."}
    ])
  },[open,initialContext?.equipment_id])
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:'smooth'})},[messages,loading])

  const send=async()=>{
    if(!input.trim()||loading) return
    const userMsg={role:'user',content:input.trim()}
    const next=[...messages,userMsg]
    setMessages(next);setInput('');setLoading(true)
    try {
      const token=await getToken()
      const res=await fetch(`${API_URL}/agent4-chat`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({messages:next,equipment_id:initialContext?.equipment_id||'',fault_context:initialContext?.fault_context||''})})
      if(!res.ok) throw new Error()
      const data=await res.json()
      setMessages(p=>[...p,{role:'assistant',content:data.reply}])
    } catch { setMessages(p=>[...p,{role:'assistant',content:'⚠ Unable to reach the SOP agent.'}]) }
    finally { setLoading(false) }
  }

  const renderContent=(text)=>text.split('\n').map((line,i)=>{
    const bold=line.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
    if(/^\d+\./.test(line)) return <div key={i} className="chat-step" dangerouslySetInnerHTML={{__html:bold}}/>
    if(/^[-•⚠]/.test(line)) return <div key={i} className="chat-bullet" dangerouslySetInnerHTML={{__html:bold}}/>
    if(line.trim()==='') return <div key={i} className="chat-spacer"/>
    return <div key={i} dangerouslySetInnerHTML={{__html:bold}}/>
  })

  if(!open) return null
  return (
    <>
      <div className="sop-backdrop" onClick={onClose}/>
      <div className="sop-panel sop-panel--open">
        <div className="sop-header">
          <div className="sop-header-left">
            <div className="sop-header-icon">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 2h10a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="#6366f1" strokeWidth="1.4"/><path d="M5 5h6M5 8h6M5 11h4" stroke="#6366f1" strokeWidth="1.4" strokeLinecap="round"/></svg>
            </div>
            <div>
              <div className="sop-header-title">SOP Guidance Agent</div>
              {initialContext?.equipment_id&&<div className="sop-header-sub">{initialContext.equipment_id} · {initialContext.fault_context}</div>}
            </div>
          </div>
          <button className="sop-close" onClick={onClose}>✕</button>
        </div>
        <div className="sop-messages">
          {messages.map((m,i)=>(
            <div key={i} className={`sop-msg sop-msg--${m.role}`}>
              {m.role==='assistant'&&<div className="sop-avatar">✓</div>}
              <div className="sop-bubble">{m.role==='assistant'?renderContent(m.content):m.content}</div>
            </div>
          ))}
          {loading&&<div className="sop-msg sop-msg--assistant"><div className="sop-avatar">…</div><div className="sop-bubble sop-typing"><span/><span/><span/></div></div>}
          <div ref={bottomRef}/>
        </div>
        {messages.filter(m=>m.role==='user').length===0&&(
          <div className="sop-suggestions">
            {(initialContext?.equipment_id
              ?['What are the step-by-step intervention steps?','What PPE is required?','What are the exit criteria?']
              :['HVAC temperature spike — what should I do?','What tools do I need for pump maintenance?','When should I escalate?']
            ).map((s,i)=><button key={i} className="sop-chip" onClick={()=>setInput(s)}>{s}</button>)}
          </div>
        )}
        <div className="sop-input-row">
          <input className="sop-input" placeholder="Ask about this SOP..." value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} disabled={loading}/>
          <button className="sop-send" onClick={send} disabled={loading||!input.trim()}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M14 8L2 2l3 6-3 6 12-6z" fill="currentColor"/></svg>
          </button>
        </div>
      </div>
    </>
  )
}

// ── Engineer Workbench — fully self-contained ─────────────────────────────────
function EngineersWorkbench({ onClose, currentUser, openSOP, toast, history=[], completedJobs={}, markComplete, onLogout, hideBack=false, authFetch, initialAccepted={} }) {
  const [filter,       setFilter]       = useState('pending')
  const [acceptedJobs, setAcceptedJobs] = useState(initialAccepted)
  const [evidence,     setEvidence]     = useState({})
  const [showEvidence, setShowEvidence] = useState({})

  const handleAccept = (jobId) => {
    const t   = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'})
    const key = jobKey(jobId)
    setAcceptedJobs(prev => ({ ...prev, [key]: { time: t, by: currentUser.name, role: currentUser.role } }))
    toast('✓ Work ticket accepted — you are now responsible for this job', 'success')
    if(authFetch) authFetch('/session-state/engineer-accept', {
      method: 'POST',
      body: JSON.stringify({ log_id: jobId, accepted_at: t, accepted_by: currentUser.name, role: currentUser.role })
    }).catch(() => {})
  }

  const handleFileChange = (jobId, e) => {
    const file = e.target.files[0]
    if(!file) return
    setEvidence(p => ({...p, [jobKey(jobId)]: file.name}))
    toast(`📎 Evidence attached: ${file.name}`, 'info')
  }

  const handleComplete = (jobId) => {
    markComplete(jobId, evidence[jobKey(jobId)] || null)
  }

  const jobs = useMemo(() => {
    const seen = new Set()
    return history
      .filter(h => {
        if(h.type === 'healthy') return false
        if(seen.has(jobKey(h.id))) return false
        seen.add(jobKey(h.id))
        return true
      })
      .map(h => ({
        id:            h.id,
        equipment_id:  h.equipment,
        severity:      h.type === 'critical' ? 'Critical' : 'Warning',
        severityKey:   h.type,
        ticket_id:     h.ticket?.ticket_id || null,
        issue_summary: h.message,
        dispatched_by: h.accepted_by,
        time:          h.time,
        isComplete:    !!completedJobs[jobKey(h.id)],
        completed_by:  completedJobs[jobKey(h.id)]?.by || null,
        completed_role:completedJobs[jobKey(h.id)]?.byRole || null,
        completed_ev:  completedJobs[jobKey(h.id)]?.evidence || null,
        isAccepted:    !!acceptedJobs[jobKey(h.id)],
        acceptedBy:    acceptedJobs[jobKey(h.id)]?.by || null,
      }))
      .sort((a, b) => {
        const ord = { critical: 0, warning: 1 }
        const d = (ord[a.severityKey] ?? 2) - (ord[b.severityKey] ?? 2)
        return d !== 0 ? d : (a.isComplete ? 1 : 0) - (b.isComplete ? 1 : 0)
      })
  }, [history, completedJobs, acceptedJobs])

  const filtered = useMemo(() => {
    if(filter === 'pending')  return jobs.filter(j => !j.isComplete)
    if(filter === 'complete') return jobs.filter(j =>  j.isComplete)
    if(filter === 'critical') return jobs.filter(j => j.severityKey === 'critical' && !j.isComplete)
    if(filter === 'warning')  return jobs.filter(j => j.severityKey === 'warning'  && !j.isComplete)
    return jobs.filter(j => !j.isComplete)
  }, [jobs, filter])

  const pendingCount  = jobs.filter(j => !j.isComplete).length
  const completeCount = jobs.filter(j =>  j.isComplete).length

  const renderJob = (job) => {
    const evidenceFile = evidence[jobKey(job.id)]
    const showEv       = showEvidence[jobKey(job.id)]
    const statusColor  = job.isComplete ? '#10b981' : job.isAccepted ? '#2563eb' : '#f59e0b'
    const statusLabel  = job.isComplete ? '✓ Complete' : job.isAccepted ? 'In Progress' : 'New'
    return (
      <div key={jobKey(job.id)} className={`k-card k-card--${job.severityKey}${job.isComplete?' log-complete':''}`}
        style={{marginBottom:'12px'}}>
        {/* Header */}
        <div className="k-card-head">
          <div>
            <div className="k-card-id">{job.equipment_id}</div>
            {job.ticket_id && <div className="k-card-bld mono" style={{fontSize:'11px',color:'#64748b'}}>{job.ticket_id}</div>}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
            <span style={{fontSize:'11px',fontWeight:'600',padding:'2px 8px',borderRadius:'999px',background:job.isComplete?'#d1fae5':job.isAccepted?'#dbeafe':'#fef3c7',color:statusColor,border:`1px solid ${statusColor}22`}}>
              {statusLabel}
            </span>
            <span className={`sev-badge sev-${job.severityKey}`}>{job.severity}</span>
          </div>
        </div>

        {/* Summary */}
        <p className="k-summary" style={{margin:'8px 0'}}>{job.issue_summary}</p>

        {/* Meta */}
        <div className="k-metrics" style={{marginBottom:'10px'}}>
          {job.dispatched_by && (
            <div className="k-metric"><span className="k-lbl">Ticket created by</span><span className="k-val" style={{fontWeight:'600'}}>{job.dispatched_by}</span></div>
          )}
          {job.isAccepted && !job.isComplete && (
            <div className="k-metric"><span className="k-lbl">Accepted by</span><span className="k-val" style={{fontWeight:'600',color:'#2563eb'}}>{job.acceptedBy} · {currentUser.role}</span></div>
          )}
          {job.isComplete && job.completed_by && (
            <div className="k-metric"><span className="k-lbl">Completed by</span><span className="k-val" style={{fontWeight:'600',color:'#10b981'}}>{job.completed_by}{job.completed_role?` · ${job.completed_role}`:''}</span></div>
          )}
          {job.isComplete && job.completed_ev && (
            <div className="k-metric"><span className="k-lbl">Evidence</span><span className="k-val">📎 {job.completed_ev}</span></div>
          )}
        </div>

        {/* Stage 1: Accept */}
        {!job.isAccepted && !job.isComplete && (
          <div className="k-actions">
            <button className="k-btn k-accept" onClick={() => handleAccept(job.id)}>
              Accept Work Ticket
            </button>
          </div>
        )}

        {/* Stage 2: In progress */}
        {job.isAccepted && !job.isComplete && (
          <div className="k-actions" style={{flexDirection:'column',alignItems:'stretch',gap:'8px'}}>
            <div style={{display:'flex',gap:'8px'}}>
              <button className="btn-open-guidance" style={{flex:1}}
                onClick={() => openSOP({equipment_id: job.equipment_id, fault_context: `${job.severity} · ${job.ticket_id || 'No ticket'}`})}>
                Open SOP Guidance
              </button>
              <button className="btn-open-guidance" style={{flex:1,background:'#f0fdf4',color:'#15803d',borderColor:'#86efac'}}
                onClick={() => setShowEvidence(p => ({...p, [jobKey(job.id)]: !showEv}))}>
                📎 {evidenceFile ? `✓ Attached` : 'Upload Evidence'}
              </button>
            </div>
            {showEv && (
              <label style={{display:'flex',alignItems:'center',gap:'8px',padding:'10px',background:'#f8fafc',borderRadius:'8px',border:'1px dashed #cbd5e1',cursor:'pointer',fontSize:'13px',color:'#64748b'}}>
                {evidenceFile
                  ? <span style={{color:'#15803d',fontWeight:600}}>✓ {evidenceFile} — click to change</span>
                  : <><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 12V4a1 1 0 011-1h5l3 3v6a1 1 0 01-1 1H4a1 1 0 01-1-1z" stroke="#94a3b8" strokeWidth="1.3"/><path d="M9 3v3h3" stroke="#94a3b8" strokeWidth="1.3"/></svg>Choose photo or PDF as evidence</>}
                <input type="file" accept="image/*,.pdf" style={{display:'none'}} onChange={e => handleFileChange(job.id, e)}/>
              </label>
            )}
            <button className="k-btn k-accept" style={{background:'#10b981',borderColor:'#059669'}}
              onClick={() => handleComplete(job.id)}>
              ✓ Mark Complete{evidenceFile ? ' & Submit Evidence' : ''}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="mgr-shell">
      <RoleTopbar user={currentUser} onLogout={onLogout}/>
      <header className="ent-header">
        {!hideBack && onClose && (
          <button className="ent-back-btn" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Operations
          </button>
        )}
        <div className="ent-header-center">
          <div className="ent-header-title">Engineer Workbench</div>
          <div className="ent-header-meta">
            <span className="ent-meta-pill">{currentUser.name}</span>
            <span className="ent-meta-sep">·</span>
            <span>{pendingCount} pending · {completeCount} complete</span>
          </div>
        </div>
        {pendingCount > 0
          ? <span className="mgr-pending-badge">{pendingCount} job{pendingCount !== 1 ? 's' : ''} to action</span>
          : jobs.length > 0
            ? <span className="mgr-pending-badge" style={{background:'#10b981', borderColor:'#d1fae5'}}>All jobs complete ✓</span>
            : null}
      </header>
      <div className="mgr-body">
        <div className="ent-tab-strip" style={{marginBottom:'16px'}}>
          {[
            {id:'pending',  label:`Pending (${pendingCount})`},
            {id:'critical', label:'Critical'},
            {id:'warning',  label:'Warning'},
            {id:'complete', label:`Complete (${completeCount})`},
          ].map(f => (
            <button key={f.id} className={`ent-tab${filter === f.id ? ' ent-tab--active' : ''}`} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
          <div className="ent-tab-fill"/>
        </div>
        {jobs.length === 0
          ? <div className="k-empty-state"><span>No work tickets yet. Tickets appear once a dispatcher creates one.</span></div>
          : filtered.length === 0
            ? <div className="k-empty-state"><span>{filter === 'complete' ? 'No completed jobs yet.' : 'No pending jobs — all work is complete ✓'}</span></div>
            : <div className="mgr-section"><div className="panel-body" style={{display:'flex', flexDirection:'column', gap:'8px'}}>{filtered.map(renderJob)}</div></div>
        }
      </div>
    </div>
  )
}

// ── Shift Handover Report ─────────────────────────────────────────────────────
function HandoverDashboard({ data, stats, onClose, currentUser }) {
  const [copied, setCopied] = useState(false)
  const lines = (data||'').split('\n').filter(Boolean)

  const copyReport = () => {
    navigator.clipboard.writeText(data||'').then(()=>{ setCopied(true); setTimeout(()=>setCopied(false),2000) })
  }

  const sectionIcon = (line) => {
    if(line.includes('SUMMARY'))      return '📊'
    if(line.includes('RESOLVED'))     return '✅'
    if(line.includes('ACTIVE'))       return '🔧'
    if(line.includes('ESCALATION'))   return '⚠️'
    if(line.includes('WATCH'))        return '👁️'
    return null
  }

  const isHeader = (line) => /^(SHIFT|RESOLVED|ACTIVE|ESCALATION|WATCH)/i.test(line.trim())

  return (
    <div className="ent-shell">
      <header className="ent-header">
        <button className="ent-back-btn" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Operations
        </button>
        <div className="ent-header-center">
          <div className="ent-header-title">Shift Handover Report</div>
          <div className="ent-header-meta">
            <span className="ent-meta-pill">{currentUser.name}</span>
            <span className="ent-meta-sep">·</span>
            <span>{new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}</span>
          </div>
        </div>
        <div className="ent-header-actions">
          <button className="ent-action-btn ent-action-btn--primary" onClick={copyReport}>
            {copied ? '✓ Copied' : 'Copy Report'}
          </button>
        </div>
      </header>

      {/* KPI strip */}
      <div style={{display:'flex',gap:'0',borderBottom:'1px solid #e2e8f0',background:'#fff'}}>
        {[
          {label:'Work Orders',    val:stats.total,     color:'#0f172a'},
          {label:'Resolved',       val:stats.resolved,  color:'#10b981'},
          {label:'In Progress',    val:stats.inProgress,color:'#3b82f6'},
          {label:'Escalated',      val:stats.escalated, color:'#f59e0b'},
          {label:'Still in Kanban',val:stats.remaining, color:'#64748b'},
        ].map((k,i)=>(
          <div key={i} style={{flex:1,padding:'16px 20px',borderRight:'1px solid #e2e8f0',textAlign:'center'}}>
            <div style={{fontSize:'24px',fontWeight:'800',color:k.color,fontFamily:'monospace'}}>{k.val}</div>
            <div style={{fontSize:'11px',color:'#94a3b8',fontWeight:'500',marginTop:'2px'}}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* AI narrative */}
      <div className="ent-body" style={{padding:'24px'}}>
        <div className="ent-chart-card ent-chart-card--full" style={{maxWidth:'860px',margin:'0 auto'}}>
          <div className="ent-chart-header">
            <div className="ent-chart-title">
              <span className="ent-ai-badge">AI</span>
              Handover Narrative
            </div>
          </div>
          <div style={{padding:'4px 0'}}>
            {lines.map((line, i) => {
              const icon = sectionIcon(line)
              const header = isHeader(line)
              if(header) return (
                <div key={i} style={{display:'flex',alignItems:'center',gap:'8px',margin:'20px 0 8px',paddingBottom:'6px',borderBottom:'1px solid #e2e8f0'}}>
                  {icon && <span style={{fontSize:'16px'}}>{icon}</span>}
                  <span style={{fontSize:'13px',fontWeight:'700',color:'#0f172a',textTransform:'uppercase',letterSpacing:'0.05em'}}>{line.replace(/[*#]/g,'').trim()}</span>
                </div>
              )
              if(line.startsWith('-')||line.startsWith('•')) return (
                <div key={i} style={{display:'flex',gap:'8px',padding:'4px 0 4px 8px',fontSize:'13px',color:'#334155',lineHeight:'1.6'}}>
                  <span style={{color:'#94a3b8',flexShrink:0}}>·</span>
                  <span>{line.replace(/^[-•]\s*/,'')}</span>
                </div>
              )
              if(line.trim()) return (
                <p key={i} style={{fontSize:'13px',color:'#475569',lineHeight:'1.7',margin:'4px 0',paddingLeft:'8px'}}>{line}</p>
              )
              return <div key={i} style={{height:'6px'}}/>
            })}
          </div>
        </div>

        <div style={{textAlign:'center',marginTop:'24px',color:'#94a3b8',fontSize:'12px'}}>
          Generated by L'Avenir AI · {new Date().toLocaleTimeString()} · Shift handover for {currentUser.name}
        </div>
      </div>
    </div>
  )
}
function Dashboard() {
  const { instance, accounts } = useMsal()
  const msalUser = accounts[0]

  const [tokenClaims, setTokenClaims] = useState(null)
  useEffect(()=>{
    if(!msalUser) return
    instance.acquireTokenSilent({...apiRequest, account:msalUser})
      .then(res=>setTokenClaims(res.idTokenClaims||res.account?.idTokenClaims||{}))
      .catch(()=>setTokenClaims(msalUser?.idTokenClaims||{}))
  },[]) // eslint-disable-line react-hooks/exhaustive-deps

  const currentUser = useMemo(()=>({
    id:    msalUser?.localAccountId||'unknown',
    name:  msalUser?.name||msalUser?.username?.split('@')[0]||'User',
    email: msalUser?.username||'',
    role:  (tokenClaims?.roles?.[0]||msalUser?.idTokenClaims?.roles?.[0]||ROLES.DISPATCHER).toLowerCase(),
  }),[msalUser, tokenClaims])

  const getToken = useCallback(async()=>{
    try {
      const result=await instance.acquireTokenSilent({...apiRequest,account:msalUser})
      return result.accessToken
    } catch { return null }
  },[instance,msalUser])

  const authFetch = useCallback(async(url,options={})=>{
    const token=await getToken()
    return fetch(`${API_URL}${url}`,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{}),...(options.headers||{})}})
  },[getToken])

  const role = currentUser.role
  const handleLogout = useCallback(()=>instance.logoutRedirect({postLogoutRedirectUri:window.location.origin}),[instance])

  const [anomalies,        setAnomalies]        = useState([])
  const [history,          setHistory]          = useState([])
  const [escalated,        setEscalated]        = useState([])
  const [isScanning,       setIsScanning]       = useState(false)
  const [scanProgress,     setScanProgress]     = useState(0)
  const [online,           setOnline]           = useState(false)
  const [hasScanned,       setHasScanned]       = useState(false)
  const [lastScan,         setLastScan]         = useState(null)
  const [escalateOpen,     setEscalateOpen]     = useState({})
  const [escalateReason,   setEscalateReason]   = useState({})
  const [completedJobs,    setCompletedJobs]    = useState({})
  const [auditOpen,        setAuditOpen]        = useState(false)
  const [auditData,        setAuditData]        = useState(null)
  const [auditLoading,     setAuditLoading]     = useState(false)
  const [managerOpen,      setManagerOpen]      = useState(false)
  const [engineersOpen,    setEngineersOpen]    = useState(false)
  const [handoverOpen,    setHandoverOpen]    = useState(false)
  const [handoverData,    setHandoverData]    = useState(null)
  const [handoverLoading, setHandoverLoading] = useState(false)
  const [sopOpen,          setSopOpen]          = useState(false)
  const [sopContext,       setSopContext]        = useState(null)
  const [engineerAccepted, setEngineerAccepted] = useState({})
  const { toasts, add: toast } = useToasts()

  const openSOP = (ctx=null) => { setSopContext(ctx); setSopOpen(true) }

  const isComplete    = useCallback((id)=>!!completedJobs[jobKey(id)],[completedJobs])
  const getCompletion = useCallback((id)=>completedJobs[jobKey(id)]||null,[completedJobs])

  const pendingManagerCount = escalated.filter(e=>!e.manager_outcome).length
  const pendingWorkCount    = history.filter(h=>h.type!=='healthy'&&!isComplete(h.id)&&!engineerAccepted[jobKey(h.id)]).length
  const criticals = anomalies.filter(a=>sev(a.severity)==='critical')
  const warnings  = anomalies.filter(a=>sev(a.severity)==='warning')
  const healthy   = anomalies.filter(a=>sev(a.severity)==='healthy')
  const stats = useMemo(()=>({total:anomalies.length,critical:criticals.length,warning:warnings.length,healthy:healthy.length}),[anomalies])
  const pendingEscalations = escalated.filter(e=>!e.manager_outcome)

  useEffect(()=>{
    const load=async()=>{
      try {
        let res=await authFetch('/session-state')
        if(res.status===401) res=await fetch(`${API_URL}/session-state`)
        if(!res.ok) return
        const data=await res.json()
        if(!data) return
        if(data.anomalies?.length){
          setAnomalies(data.anomalies.map((a,i)=>({...a,ui_id:a.ui_id||`${a.equipment_id}-${i}`})))
          setHasScanned(true); setOnline(true)
        }
        if(data.history?.length)   setHistory(data.history)
        if(data.escalated?.length) setEscalated(data.escalated)
        if(data.completed){
          const norm={}
          Object.entries(data.completed).forEach(([k,v])=>{
            norm[jobKey(k)] = {
              time:     v.time     || v.completed_at || '',
              by:       v.by       || v.completed_by || '',
              byRole:   v.byRole   || v.completed_by_role || '',
              evidence: v.evidence || null,
            }
          })
          setCompletedJobs(norm)
        }
        if(data.engineer_accepted){
          const norm={}
          Object.entries(data.engineer_accepted).forEach(([k,v])=>{norm[jobKey(k)]=v})
          setEngineerAccepted(norm)
        }
        if(data.last_scan) setLastScan(new Date(data.last_scan))
        if(data.anomalies?.length||data.history?.length)
          toast(`Session restored — ${data.anomalies?.length||0} alerts, ${data.history?.length||0} work orders`,'info')
        if(data.history?.length||data.escalated?.length){
          const norm={}
          Object.entries(data.completed||{}).forEach(([k,v])=>{norm[jobKey(k)]=v})
          if(role===ROLES.AUDITOR) generateAuditFromData(data.history||[],data.escalated||[],norm)
        }
      } catch(e){ console.warn('[Session]',e) }
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])

  const generateAuditFromData=async(hist,esc,comp)=>{
    if(!hist.length&&!esc.length){ toast('No session activity to audit yet.','warn'); return }
    setAuditLoading(true)
    try {
      const acceptedEquipment=new Set(hist.map(h=>h.equipment))
      const dedupedEsc=esc.filter(e=>!acceptedEquipment.has(e.equipment_id))
      const res=await authFetch('/generate-audit',{method:'POST',body:JSON.stringify({
        accepted:hist.map(h=>({
          id:h.id, equipment:h.equipment, type:h.type, time:h.time, message:h.message,
          ticket:h.ticket||null, completedAt:comp[jobKey(h.id)]?.time||null,
          accepted_by:h.accepted_by||null, completed_by:comp[jobKey(h.id)]?.by||null,
        })),
        escalated:dedupedEsc.map(e=>({
          equipment_id:e.equipment_id, severity:e.severity||'Unknown',
          reason:e.reason, time:e.time,
          assigned_department:e.assigned_department||'Unknown', escalated_by:e.escalated_by||null,
        })),
        completed:Object.keys(comp),
      })})
      const result=await res.json()
      const enriched=result.register.records.map(r=>{
        const m=hist.find(h=>jobKey(h.id)===jobKey(r.id)||h.equipment===r.equipment_id)
        const compEntry=m?comp[jobKey(m.id)]:null
        return { ...r, accepted_by:m?.accepted_by||r.accepted_by||null, completed_by:compEntry?.by||null, completed_at:compEntry?.time||null, status:compEntry?'COMPLETE':r.status }
      })
      setAuditData({...result.register,records:enriched})
      setAuditOpen(true)
      toast('Audit dashboard ready','success')
    } catch(e){ console.error(e); toast('Failed to generate audit','error') }
    finally { setAuditLoading(false) }
  }

  const generateAudit=()=>generateAuditFromData(history,escalated,completedJobs)

  const generateHandover=async()=>{
    if(!history.length){ toast('No shift activity to hand over yet.','warn'); return }
    setHandoverLoading(true)
    try {
      const completedSet=new Set(Object.keys(completedJobs))
      const res=await authFetch('/generate-handover',{method:'POST',body:JSON.stringify({
        accepted: history.map(h=>({id:h.id,equipment:h.equipment,type:h.type,time:h.time,message:h.message,ticket:h.ticket||null,completedAt:completedJobs[jobKey(h.id)]?.time||null,accepted_by:h.accepted_by||null,completed_by:completedJobs[jobKey(h.id)]?.by||null})),
        escalated:escalated.map(e=>({equipment_id:e.equipment_id,severity:e.severity||'Unknown',reason:e.reason,time:e.time,assigned_department:e.assigned_department||'Unknown',escalated_by:e.escalated_by||null})),
        completed:Object.keys(completedJobs).map(Number).filter(Boolean),
        remaining:anomalies.map(a=>({equipment_id:a.equipment_id,severity:a.severity})),
      })})
      const result=await res.json()
      const resolved   = history.filter(h=>completedJobs[jobKey(h.id)])
      const inProgress = history.filter(h=>!completedJobs[jobKey(h.id)]&&h.type!=='healthy')
      setHandoverData({
        text: result.handover,
        stats:{
          total:      history.filter(h=>h.type!=='healthy').length,
          resolved:   resolved.length,
          inProgress: inProgress.length,
          escalated:  escalated.length,
          remaining:  anomalies.length,
        }
      })
      setHandoverOpen(true)
      toast('Handover report ready','success')
    } catch(e){ toast('Failed to generate handover','error') }
    finally { setHandoverLoading(false) }
  }

  // Auto-refresh session every 30s so engineer sees new tickets without reloading
  useEffect(()=>{
    const iv=setInterval(async()=>{
      try {
        let res=await authFetch('/session-state')
        if(res.status===401) res=await fetch(`${API_URL}/session-state`)
        if(!res.ok) return
        const data=await res.json()
        if(data.history?.length) setHistory(data.history)
        if(data.escalated?.length) setEscalated(data.escalated)
        if(data.anomalies?.length){
          setAnomalies(data.anomalies.map((a,i)=>({...a,ui_id:a.ui_id||`${a.equipment_id}-${i}`})))
          setOnline(true)
        }
        if(data.completed){
          const norm={}
          Object.entries(data.completed).forEach(([k,v])=>{norm[jobKey(k)]={time:v.time||v.completed_at||'',by:v.by||v.completed_by||'',byRole:v.byRole||v.completed_by_role||'',evidence:v.evidence||null}})
          setCompletedJobs(norm)
        }
        if(data.engineer_accepted){
          const norm={}
          Object.entries(data.engineer_accepted).forEach(([k,v])=>{norm[jobKey(k)]=v})
          setEngineerAccepted(norm)
        }
      } catch {}
    }, 30000)
    return ()=>clearInterval(iv)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])

  const runScan=async()=>{
    setIsScanning(true);setHasScanned(true);setScanProgress(0)
    const prog=setInterval(()=>setScanProgress(p=>Math.min(p+Math.random()*15,85)),400)
    try {
      const res=await authFetch('/run-predictive-scan',{method:'POST'})
      if(!res.ok) throw new Error()
      const result=await res.json()
      clearInterval(prog);setScanProgress(100)
      await new Promise(r=>setTimeout(r,300))
      const data=(result.data?.anomalies_detected||[]).map((a,i)=>({...a,ui_id:`${a.equipment_id}-${i}`})).sort((a,b)=>({critical:0,warning:1,healthy:2}[sev(a.severity)]??3)-({critical:0,warning:1,healthy:2}[sev(b.severity)]??3))
      setAnomalies(data);setOnline(true);setLastScan(new Date())
      const crits=data.filter(a=>sev(a.severity)==='critical').length
      toast(`Scan complete — ${crits} critical fault${crits!==1?'s':''} detected`,crits>0?'error':'success')
    } catch { setOnline(false);toast('AI Engine unreachable','error') }
    finally { setIsScanning(false);setTimeout(()=>setScanProgress(0),600) }
  }

  const processDecision=async(anomaly,decision)=>{
    let reason=null
    if(decision==='Escalate'){
      reason=escalateReason[anomaly.ui_id]
      if(!reason?.trim()){toast('Please provide an escalation reason.','warn');return}
    }
    try {
      const res=await authFetch('/triage-decision',{method:'POST',body:JSON.stringify({
        equipment_id:anomaly.equipment_id, decision, escalate_reason:reason,
        severity:anomaly.severity, department:anomaly.assigned_department,
        accepted_by:currentUser.name, fault_type:anomaly.fault_type||'',
        fault_value:anomaly.fault_value||null, issue_summary:anomaly.issue_summary||'', building_id:anomaly.building_id||'',
      })})
      if(!res.ok){const e=await res.json();toast(e.detail||'Server error','error');return}
      const result=await res.json()
      setAnomalies(prev=>prev.filter(a=>a.ui_id!==anomaly.ui_id))
      const t=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})
      if(decision==='Accept'){
        const s=sev(anomaly.severity)
        const logId=result.log_id||Date.now()
        const msgs={critical:`Emergency response dispatched to ${anomaly.assigned_department}.`,warning:`Inspection scheduled with ${anomaly.assigned_department}.`,healthy:`Baseline verified. Cleared.`}
        setHistory(prev=>{
          if(prev.some(h=>jobKey(h.id)===jobKey(logId))) return prev
          return [{id:logId,time:t,equipment:anomaly.equipment_id,type:s,message:msgs[s]??'Action taken.',ticket:result.ticket??null,accepted_by:currentUser.name},...prev]
        })
        toast(`✓ Work ticket created for ${anomaly.equipment_id}`,'success')
      } else {
        setEscalated(prev=>[{...anomaly,time:t,reason,escalated_by:currentUser.name,manager_outcome:null},...prev])
        toast(`↑ ${anomaly.equipment_id} escalated to manager`,'warn')
      }
    } catch { toast('Error processing decision.','error') }
  }

  const processManagerDecision=async(item,decision,declineReason)=>{
    if(decision==='Decline'&&!declineReason?.trim()){toast('Please provide a decline reason.','warn');return}
    try {
      const res=await authFetch('/manager-decision',{method:'POST',body:JSON.stringify({
        equipment_id:item.equipment_id, decision, decline_reason:declineReason,
        severity:item.severity, department:item.assigned_department,
        decided_by:currentUser.name, fault_type:item.fault_type||'',
        fault_value:item.fault_value||null, issue_summary:item.issue_summary||'', building_id:item.building_id||'',
      })})
      if(!res.ok){const e=await res.json();toast(e.detail||'Server error','error');return}
      const result=await res.json()
      const t=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})
      const outcome=decision==='Accept'?'accepted':'declined'
      setEscalated(prev=>prev.map(e=>e.equipment_id===item.equipment_id&&!e.manager_outcome?{...e,manager_outcome:outcome,manager_ticket:result.ticket?.ticket_id||null,decided_by:currentUser.name,decided_at:t}:e))
      if(decision==='Accept'){
        const newLogId=result.log_id||Date.now()
        setHistory(prev=>{
          if(prev.some(h=>jobKey(h.id)===jobKey(newLogId))) return prev
          return [{id:newLogId,time:t,equipment:item.equipment_id,type:sev(item.severity),message:`Manager-approved response dispatched to ${item.assigned_department}.`,ticket:result.ticket??null,accepted_by:`Manager: ${currentUser.name}`},...prev]
        })
        toast(`✓ ${item.equipment_id} accepted by manager`,'success')
      } else {
        setAnomalies(prev=>[{...item,ui_id:`${item.equipment_id}-returned-${Date.now()}`,issue_summary:`↩ Returned by manager: "${declineReason}" — ${item.issue_summary}`},...prev])
        toast(`↩ ${item.equipment_id} declined — returned to Kanban`,'warn')
      }
    } catch { toast('Error processing manager decision.','error') }
  }

  const markComplete=async(logId, evidence=null)=>{
    const t=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})
    const key=jobKey(logId)
    setCompletedJobs(p=>({...p,[key]:{time:t,by:currentUser.name,byRole:currentUser.role,evidence}}))
    toast('✓ Work marked as complete','success')
    await authFetch('/session-state/complete',{method:'POST',body:JSON.stringify({
      log_id:logId, completed_at:t, completed_by:currentUser.name, completed_by_role:currentUser.role, evidence,
    })}).catch(()=>{})
  }

  const copyTicket=(id)=>navigator.clipboard.writeText(id).then(()=>toast(`Copied ${id}`,'info'))

  const renderCard=(anomaly)=>{
    const s=sev(anomaly.severity),isOpen=escalateOpen[anomaly.ui_id]
    const trendIcon=anomaly.trend==='up'?'↑':anomaly.trend==='down'?'↓':'→'
    const trendColor=anomaly.trend==='up'?'#ef4444':anomaly.trend==='down'?'#10b981':'#94a3b8'
    const actions=s==='healthy'?(
      <button className="k-btn k-clear" onClick={()=>processDecision(anomaly,'Accept')}>Clear as Verified</button>
    ):isOpen?(
      <div className="decline-row">
        <input className="decline-input" placeholder="Escalation reason…" value={escalateReason[anomaly.ui_id]||''} onChange={e=>setEscalateReason(p=>({...p,[anomaly.ui_id]:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&processDecision(anomaly,'Escalate')}/>
        <button className="k-btn k-confirm" onClick={()=>processDecision(anomaly,'Escalate')}>Submit</button>
        <button className="k-btn k-cancel" onClick={()=>setEscalateOpen(p=>({...p,[anomaly.ui_id]:false}))}>✕</button>
      </div>
    ):(
      <div className="btn-row">
        <button className="k-btn k-accept" onClick={()=>processDecision(anomaly,'Accept')}>Create Work Ticket</button>
        <button className="k-btn k-escalate" onClick={()=>setEscalateOpen(p=>({...p,[anomaly.ui_id]:true}))}>Escalate</button>
      </div>
    )
    return (
      <div key={anomaly.ui_id} className={`k-card k-card--${s}`}>
        <div className="k-card-head">
          <div><div className="k-card-id">{anomaly.equipment_id}</div><div className="k-card-bld">{anomaly.building_id||'—'}</div></div>
          <div style={{display:'flex',alignItems:'center',gap:'5px'}}><span style={{fontSize:'13px',color:trendColor,fontWeight:'700'}}>{trendIcon}</span><span className={`sev-badge sev-${s}`}>{anomaly.severity}</span></div>
        </div>
        <div className="k-metrics">
          <div className="k-metric"><span className="k-lbl">Fault</span><span className="k-val">{anomaly.fault_type} · {anomaly.fault_value}</span></div>
          <div className="k-metric"><span className="k-lbl">Dept</span><span className="k-val">{anomaly.assigned_department||'Unassigned'}</span></div>
          <div className="k-metric"><span className="k-lbl">Engineer</span><span className="k-val">{anomaly.contact_person||'N/A'}</span></div>
          <div className="k-metric"><span className="k-lbl">Confidence</span>
            <span className="k-val" style={{display:'flex',alignItems:'center',gap:'5px'}}>
              <span style={{display:'inline-block',width:'44px',height:'4px',background:'#e2e8f0',borderRadius:'2px'}}>
                <span style={{display:'block',width:`${anomaly.confidence}%`,height:'100%',background:anomaly.confidence>=80?'#10b981':anomaly.confidence>=60?'#f59e0b':'#ef4444',borderRadius:'2px',transition:'width 0.6s ease'}}/>
              </span>{anomaly.confidence}%
            </span>
          </div>
        </div>
        <p className="k-summary">{anomaly.issue_summary}</p>
        <div className="k-actions">{actions}</div>
      </div>
    )
  }

  const renderCol=(title,color,items)=>(
    <div className="k-col">
      <div className={`col-stripe col-stripe--${color}`}/>
      <div className="k-col-head"><div className="k-col-head-left"><div className={`col-dot col-dot--${color}`}/><span className="col-title">{title}</span></div><span className="col-count">{items.length}</span></div>
      <div className="k-col-body">
        {isScanning?[1,2,3].map(n=><SkeletonCard key={n}/>)
          :!hasScanned?<div className="k-hero-state"><div className="k-hero-label">Run scan to detect {title.toLowerCase()} signals</div></div>
          :items.length===0?<p className="k-empty">No {title.toLowerCase()} signals</p>
          :items.map(renderCard)}
      </div>
    </div>
  )

  const renderEscalatedLog=(item,idx)=>(
    <div key={idx} className="log-item log-escalated">
      <div className="log-top"><span className="log-equip">{item.equipment_id}</span><span className="log-time">{item.time}</span></div>
      <p className="log-msg">{item.reason}</p>
      <div className="log-tags">
        <span className="log-tag tag-escalated">↑ {item.escalated_by||'Dispatcher'}</span>
        <span className={`sev-badge sev-${sev(item.severity)}`}>{item.severity}</span>
      </div>
    </div>
  )

  const renderHistory=(log)=>{
    const done=getCompletion(log.id)
    return (
      <div key={jobKey(log.id)} className={`log-item log-${log.type}${done?' log-complete':''}`}>
        <div className="log-top"><span className="log-equip">{log.equipment}</span><span className="log-time">{log.time}</span></div>
        <p className="log-msg">{log.message}</p>
        <div className="log-tags">
          {done?<span className="log-tag tag-complete">✓ Complete</span>:<span className={`log-tag ${log.type==='healthy'?'tag-cleared':'tag-dispatched'}`}>{log.type==='healthy'?'Cleared':'Dispatched'}</span>}
          {log.accepted_by&&<span className="log-tag tag-accepted-by">ticket created by {log.accepted_by}</span>}
          {done&&<span className="log-tag tag-accepted-by">completed by {done.by}{done.byRole?` · ${done.byRole}`:''}</span>}
          {done?.evidence&&<span className="log-tag tag-ticket">📎 {done.evidence}</span>}
          {log.ticket&&<span className="log-tag tag-ticket copyable" onClick={()=>copyTicket(log.ticket.ticket_id)}>{log.ticket.ticket_id} ⧉</span>}
        </div>
        {log.ticket&&log.type!=='healthy'&&!done&&can(role,ROLES.ENGINEER,ROLES.MANAGER,ROLES.ADMIN)&&(
          <div className="log-actions">
            <button className="btn-open-guidance" onClick={()=>openSOP({equipment_id:log.equipment,fault_context:`${log.type==='critical'?'Critical':'Warning'} · ${log.ticket.ticket_id}`})}>Open SOP Guidance</button>
            <button className="btn-mark-complete" onClick={()=>markComplete(log.id)}>Mark Complete</button>
          </div>
        )}
      </div>
    )
  }

  // ── View routing ───────────────────────────────────────────────────────────
  const toastBar=<div className="toast-stack">{toasts.map(t=><div key={t.id} className={`toast toast-${t.type}`}>{t.msg}</div>)}</div>

  if(!tokenClaims) return (
    <div style={{display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',height:'100vh',gap:'12px'}}>
      <div className="login-auth-spinner"/>
      <div style={{fontSize:'13px',color:'#64748b'}}>Loading your workspace…</div>
    </div>
  )

  if(role===ROLES.ENGINEER) return (
    <>{toastBar}
      <SOPChatPanel open={sopOpen} onClose={()=>setSopOpen(false)} initialContext={sopContext} getToken={getToken}/>
      <EngineersWorkbench onClose={null} currentUser={currentUser} openSOP={openSOP}
        toast={toast} history={history} completedJobs={completedJobs}
        markComplete={markComplete} onLogout={handleLogout} hideBack={true}
        authFetch={authFetch} initialAccepted={engineerAccepted}/>
    </>
  )

  if(role===ROLES.AUDITOR){
    if(!auditData) return <>{toastBar}<AuditorLanding onGenerate={generateAudit} loading={auditLoading} currentUser={currentUser} onLogout={handleLogout}/></>
    return <>{toastBar}<AuditDashboard data={auditData} onClose={()=>setAuditData(null)} isAuditor={true} currentUser={currentUser} onLogout={handleLogout}/></>
  }

  if(handoverOpen&&handoverData)
    return <>{toastBar}<HandoverDashboard data={handoverData.text} stats={handoverData.stats} onClose={()=>setHandoverOpen(false)} currentUser={currentUser}/></>

  if(auditOpen&&auditData)
    return <>{toastBar}<AuditDashboard data={auditData} onClose={()=>setAuditOpen(false)}/></>

  if(managerOpen)
    return <>{toastBar}<ManagerDashboard escalated={escalated} onClose={()=>setManagerOpen(false)} onAccept={(item)=>processManagerDecision(item,'Accept',null)} onDecline={(item,reason)=>processManagerDecision(item,'Decline',reason)}/></>

  if(engineersOpen)
    return (
      <>{toastBar}
        <SOPChatPanel open={sopOpen} onClose={()=>setSopOpen(false)} initialContext={sopContext} getToken={getToken}/>
        <EngineersWorkbench onClose={()=>setEngineersOpen(false)} currentUser={currentUser} openSOP={openSOP}
          toast={toast} history={history} completedJobs={completedJobs}
          markComplete={markComplete} onLogout={handleLogout}
          authFetch={authFetch} initialAccepted={engineerAccepted}/>
      </>
    )

  const incompleteWork=history.filter(log=>!isComplete(log.id))

  return (
    <div className="dash">
      {toastBar}
      <SOPChatPanel open={sopOpen} onClose={()=>setSopOpen(false)} initialContext={sopContext} getToken={getToken}/>
      <nav className="topbar">
        <div className="brand-area">
          <img src={logo} alt="L'Avenir" className="brand-logo"/>
          <div className="brand-text">
            <span className="brand-title">L'Avenir Smart Operating Framework</span>
            {lastScan&&<span className="last-scan">Last scan: {lastScan.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span>}
          </div>
        </div>
        <div className="topbar-right">
          {isScanning&&(
            <div className="scan-progress-wrap">
              <div className="scan-progress-track"><div className="scan-progress-fill" style={{width:`${scanProgress}%`}}/></div>
              <span className="scan-progress-label">Analysing telemetry…</span>
            </div>
          )}
          <div className="user-pill">
            <div className="user-pill-avatar">{currentUser.name.charAt(0).toUpperCase()}</div>
            <span className="user-pill-name">{currentUser.name}</span>
            <span className={`user-pill-role user-pill-role--${role}`}>{role}</span>
            <button className="user-pill-logout" onClick={handleLogout} title="Sign out">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M10 11l3-3-3-3M13 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
          {can(role,ROLES.DISPATCHER,ROLES.MANAGER,ROLES.ADMIN)&&(
            <button className="btn-sop-nav" onClick={()=>openSOP(null)}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 2h10a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.4"/><path d="M5 5h6M5 8h6M5 11h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
              SOP Assistant
            </button>
          )}
          <div className={`status-pill${online?' live':''}`}>{online?'● LIVE':'○ STANDBY'}</div>
          {can(role,ROLES.ENGINEER,ROLES.ADMIN)&&(
            <button className="btn-sop-nav" onClick={()=>setEngineersOpen(true)}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M2 13l2-5h8l2 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.3"/>
              </svg>
              My Workbench
              {pendingWorkCount>0&&<span className="mgr-nav-badge">{pendingWorkCount}</span>}
            </button>
          )}
          {can(role,ROLES.MANAGER,ROLES.ADMIN)&&(
            <button className="btn-manager" onClick={()=>setManagerOpen(true)}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.3"/><path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
              Manager Review
              {pendingManagerCount>0&&<span className="mgr-nav-badge">{pendingManagerCount}</span>}
            </button>
          )}
          {can(role,ROLES.MANAGER,ROLES.ADMIN)&&(
            <button className="btn-sop-nav" style={{color:'#dc2626',borderColor:'#fca5a5',background:'#fee2e2'}}
              onClick={async()=>{
                if(!window.confirm('Clear all session data? This resets the Kanban for all users.')) return
                await authFetch('/session-state/clear',{method:'POST'}).catch(()=>{})
                setAnomalies([]);setHistory([]);setEscalated([]);setCompletedJobs({});setHasScanned(false);setOnline(false)
                toast('Session cleared — ready for new shift','info')
              }}>
              ↺ New Shift
            </button>
          )}
          {can(role,ROLES.MANAGER,ROLES.ADMIN)&&(
            <button className={`btn-audit${handoverLoading?' scanning':''}`}
              style={{background:'#f0fdf4',borderColor:'#86efac',color:'#15803d'}}
              onClick={generateHandover} disabled={handoverLoading}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 2h10a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3"/><path d="M5 5h6M5 8h6M5 11h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
              {handoverLoading?'Generating…':'Shift Handover'}
            </button>
          )}
          {can(role,ROLES.MANAGER,ROLES.ADMIN)&&(
            <button className={`btn-audit${auditLoading?' scanning':''}`} onClick={generateAudit} disabled={auditLoading}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/><rect x="9" y="1.5" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/><rect x="1.5" y="9" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/><rect x="9" y="9" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/></svg>
              {auditLoading?'Generating…':'Audit Dashboard'}
            </button>
          )}
          {can(role,ROLES.DISPATCHER,ROLES.MANAGER,ROLES.ADMIN)&&(
            <button className={`btn-scan${isScanning?' scanning':''}`} onClick={runScan} disabled={isScanning}>
              {isScanning?'Processing Telemetry…':'Run Predictive Scan'}
            </button>
          )}
        </div>
      </nav>

      <div className="kpi-row">
        {[
          {type:'total',   val:stats.total,    label:'Total Signals',cc:'',         icon:<path d="M8 2v12M4 6v8M12 4v10M1 10v4M15 8v6" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round"/>},
          {type:'critical',val:stats.critical, label:'Critical',     cc:'kpi-red',  icon:<><path d="M8 2L1 13h14L8 2z" stroke="#dc2626" strokeWidth="1.5" strokeLinejoin="round"/><path d="M8 6v4M8 11.5v.5" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round"/></>},
          {type:'warning', val:stats.warning,  label:'Warning',      cc:'kpi-amber',icon:<><circle cx="8" cy="8" r="6" stroke="#d97706" strokeWidth="1.5"/><path d="M8 5v4M8 10.5v.5" stroke="#d97706" strokeWidth="1.5" strokeLinecap="round"/></>},
          {type:'healthy', val:stats.healthy,  label:'Optimal',      cc:'kpi-green',icon:<><circle cx="8" cy="8" r="6" stroke="#059669" strokeWidth="1.5"/><path d="M5 8l2.5 2.5L11 6" stroke="#059669" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></>},
        ].map(k=>(
          <div key={k.type} className="kpi-card">
            <div className={`kpi-icon kpi-${k.type}`}><svg width="16" height="16" viewBox="0 0 16 16" fill="none">{k.icon}</svg></div>
            <div><div className={`kpi-val ${k.cc}`}><AnimatedNumber value={k.val}/></div><div className="kpi-lbl">{k.label}</div></div>
          </div>
        ))}
      </div>

      <div className="kanban-area">
        {renderCol('Optimal','green',healthy)}
        {renderCol('Warning','amber',warnings)}
        {renderCol('Critical','red',criticals)}
      </div>

      <div className="bottom-panels">
        <div className="bottom-panel">
          <div className="panel-head">
            <div className="panel-dot panel-dot--amber"/>
            <span className="panel-title">Pending Escalations</span>
            {pendingEscalations.length>0
              ?<span className="panel-badge badge-amber">{pendingEscalations.length} awaiting manager</span>
              :escalated.length>0?<span className="panel-badge badge-green">All reviewed</span>:null}
          </div>
          <div className="panel-body">
            {pendingEscalations.length===0
              ?<p className="panel-empty">No pending escalations</p>
              :pendingEscalations.map(renderEscalatedLog)}
          </div>
        </div>
        <div className="bottom-panel">
          <div className="panel-head">
            <div className="panel-dot panel-dot--green"/>
            <span className="panel-title">Active Work Orders</span>
            {incompleteWork.length>0
              ?<span className="panel-badge badge-amber">{incompleteWork.length} in progress</span>
              :history.length>0?<span className="panel-badge badge-green">All complete ✓</span>:null}
          </div>
          <div className="panel-body">
            {incompleteWork.length===0
              ?<p className="panel-empty">{history.length>0?'All work orders complete ✓':'Awaiting actions…'}</p>
              :incompleteWork.map(renderHistory)}
          </div>
        </div>
      </div>
    </div>
  )
}

function AppContent() {
  const { accounts, inProgress } = useMsal()
  if(inProgress==='login'||inProgress==='logout'||inProgress==='acquireToken')
    return <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'100vh'}}><div className="login-auth-spinner"/></div>
  return accounts&&accounts.length>0?<Dashboard/>:<LoginPage/>
}

export default function App() {
  return <MsalProvider instance={msalInstance}><AppContent/></MsalProvider>
}