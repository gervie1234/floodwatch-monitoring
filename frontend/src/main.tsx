import { useEffect, useRef, useState, type FormEvent } from 'react';
import {Waves, LayoutDashboard, History, Bell, Settings as Gear, Radio, ArrowUpRight, ArrowDownToLine, MapPin, Sun, Wifi, Activity, ChevronRight, CircleHelp, BookOpen, Menu, Check, X, RefreshCw, Satellite, ShieldCheck, Clock3} from 'lucide-react';
import './style.css';
import './readability.css';
import './guide.css';
import { publicReview, initialDemoMode, apiBase, sampleReadings } from './review';
import BuildGuide from './BuildGuide';

type Settings = {
  name: string;
  heightCm: number;
  advisoryCm: number;
  warningCm: number;
  criticalCm: number;
  publicGps?: boolean;
};
type Reading = {
  deviceId: string;
  bootId: string;
  sequence: number;
  observedAtUtc: string;
  receivedAtUtc: string;
  distanceCm: number;
  levelCm: number;
  latitude: number | null;
  longitude: number | null;
};

const navigation = [
  { page: 'Overview', icon: LayoutDashboard },
  { page: 'Reading history', icon: History },
  { page: 'Alerts', icon: Bell },
  { page: 'Station settings', icon: Gear },
  { page: 'Build guide', icon: BookOpen },
] as const;
type Page = (typeof navigation)[number]['page'];

const defaults: Settings = { name: 'Monitoring station 01', heightCm: 150, advisoryCm: 30, warningCm: 50, criticalCm: 70 };

const observationFormat = new Intl.DateTimeFormat('en-PH', {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit',
});
const hourFormat = new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' });
const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
const canEditSettings = isLocal && !publicReview && !apiBase;

function levelStatus(level: number, settings: Settings) {
  if (level >= settings.criticalCm) return 'Critical';
  if (level >= settings.warningCm) return 'Warning';
  return level >= settings.advisoryCm ? 'Advisory' : 'Normal';
}

function coordinates(latitude: number, longitude: number) {
  return `${Math.abs(latitude).toFixed(4)}° ${latitude < 0 ? 'S' : 'N'}, ${Math.abs(longitude).toFixed(4)}° ${longitude < 0 ? 'W' : 'E'}`;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(apiBase + path, options);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.detail || `Request failed (${response.status})`);
  }
  return response.json();
}

export default function App() {
  const [page, setPage] = useState<Page>('Overview');
  const [demo, setDemo] = useState(initialDemoMode);
  const [rows, setRows] = useState<Reading[]>([]);
  const [settings, setSettings] = useState(defaults);
  const [draft, setDraft] = useState(defaults);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [saveError, setSaveError] = useState('');
  const [chartHours, setChartHours] = useState(24);
  const [historyHours, setHistoryHours] = useState(24);
  const [filter, setFilter] = useState('All states');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [clock, setClock] = useState(Date.now);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const helpRef = useRef<HTMLDialogElement>(null);

  async function load(signal?: AbortSignal) {
    try {
      const [nextSettings, nextRows] = publicReview
        ? [defaults, sampleReadings(defaults.heightCm)]
        : await Promise.all([
          request<Settings>('/api/settings', { signal }),
          request<Reading[]>(`/api/readings?demo=${demo}`, { signal }),
        ]);
      if (signal?.aborted) return;
      setSettings(previous => JSON.stringify(previous) === JSON.stringify(nextSettings) ? previous : nextSettings);
      setRows(nextRows);
      setError('');
    } catch (caught) {
      if (!signal?.aborted) setError((caught as Error).message);
    } finally {
      if (!signal?.aborted) {
        setBusy(false);
        setClock(Date.now());
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setRows([]);
    load(controller.signal);
    const interval = window.setInterval(() => load(controller.signal), 10000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [demo]);

  useEffect(() => setDraft(settings), [settings]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const latest = rows.at(-1);
  const privateGps = !demo && settings.publicGps === false;
  const stale = !latest || clock - Date.parse(latest.observedAtUtc) > 30000;
  let connection = 'Connected';
  if (error) connection = 'API unavailable';
  else if (demo) connection = 'No device linked';
  else if (stale) connection = latest ? 'Readings delayed' : 'Awaiting device';

  const chartStart = clock - chartHours * 3600000;
  const chartRows = rows.filter(row => Date.parse(row.observedAtUtc) >= chartStart);
  const historyStart = clock - historyHours * 3600000;
  const history = rows.filter(row =>
    Date.parse(row.observedAtUtc) >= historyStart &&
    (filter === 'All states' || levelStatus(row.levelCm, settings) === filter),
  ).reverse();
  const events = rows.filter((row, index) => levelStatus(row.levelCm, settings) !==
    (index ? levelStatus(rows[index - 1].levelCm, settings) : 'Normal')).reverse();

  function navigate(next: Page) {
    if (page !== next || mobileMenuOpen) window.requestAnimationFrame(() => headingRef.current?.focus());
    setPage(next);
    setMobileMenuOpen(false);
  }

  function exportCsv() {
    if (!history.length) return;
    const lines = [
      'observedAtUtc,deviceId,levelCm,distanceCm,state,latitude,longitude,source',
      ...history.map(row => [
        row.observedAtUtc, row.deviceId, row.levelCm, row.distanceCm, levelStatus(row.levelCm, settings),
        privateGps ? '' : row.latitude ?? '', privateGps ? '' : row.longitude ?? '', demo ? 'sample' : 'device',
      ].join(',')),
    ];
    const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `floodwatch-${demo ? 'sample' : 'device'}-readings.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice('Reading history exported.');
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canEditSettings || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      const { name, heightCm, advisoryCm, warningCm, criticalCm } = draft;
      const next = await request<Settings>('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, heightCm, advisoryCm, warningCm, criticalCm }),
      });
      setSettings(next);
      setNotice('Station settings saved. Update the ESP32 firmware to match.');
    } catch (caught) {
      setSaveError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const currentStatus = latest ? levelStatus(latest.levelCm, settings) : 'No data';
  const peak = chartRows.length ? Math.max(...chartRows.map(row => row.levelCm)) : null;

  useEffect(() => {
    if (!mobileMenuOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || helpRef.current?.open) return;
      setMobileMenuOpen(false);
      menuButtonRef.current?.focus();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobileMenuOpen]);

 return <div className="app">
  <a href="#main-content" className="skip-link">Skip to content</a>
  <aside className={mobileMenuOpen ? 'sidebar open' : 'sidebar'}><a className="brand" href="#" onClick={e=>{e.preventDefault();navigate('Overview')}}><span className="brand-icon"><Waves/></span><span>FloodWatch<small>WATER LEVEL MONITORING</small></span></a><div className="workspace"><span className="workspace-icon"><Radio size={18}/></span><div>Student workspace<small>Water level monitoring</small></div><span className="tiny-dot"/></div><div className="nav-label">WORKSPACE</div><nav id="station-navigation" aria-label="Main navigation" ref={navRef}>{navigation.map(({ page: title, icon: Icon }) => (
    <button key={title} type="button" className={page === title ? 'nav-item active' : 'nav-item'}
      aria-current={page === title ? 'page' : undefined} onClick={() => navigate(title)}><Icon size={19}/>{title}{title==='Alerts'&&events.length>0&&<span className="count">{events.length}</span>}</button>
  ))}</nav><div className="sidebar-bottom"><button className="help" onClick={() => helpRef.current?.showModal()}><CircleHelp size={18}/>How this system works<ArrowUpRight size={15}/></button><div className="profile"><span>FW</span><div>Research team<small>FloodWatch project</small></div><span className="local-pill">PROJECT</span></div></div></aside>
 <div className="shell"><header className="topbar"><button className="icon-button mobile-menu" aria-label={mobileMenuOpen ? 'Close navigation' : 'Open navigation'}
    aria-controls="station-navigation" aria-expanded={mobileMenuOpen} ref={menuButtonRef}
    onClick={() => {
      if (!mobileMenuOpen) window.requestAnimationFrame(() => navRef.current?.querySelector<HTMLElement>('[aria-current]')?.focus());
      setMobileMenuOpen(!mobileMenuOpen);
    }}>{mobileMenuOpen ? <X /> : <Menu />}</button><span className="breadcrumb">Workspace <ChevronRight size={14}/> <strong>{page}</strong></span><div className="top-right"><span className="date">{new Date().toLocaleDateString('en-PH',{month:'long',day:'numeric',year:'numeric'})}</span><button className="icon-button" aria-label="View alerts" onClick={() => navigate('Alerts')}><Bell size={19}/>{events.length>0&&<i/>}</button><span className="avatar">RT</span></div></header>
 <main id="main-content"><div className="page-heading"><div><div className="eyebrow"><span/>STATION MONITORING</div><h1 ref={headingRef} tabIndex={-1}>{page==='Overview'?'A clearer view of the water.':page}</h1><p>{page==='Overview'?'Monitor water levels, track changes, and stay informed.':page==='Reading history'?'Explore recorded measurements and export your observations.':page==='Alerts'?'Review threshold changes across the current data source.':page==='Build guide'?'Learn the hardware, software, wiring and project costs.':'View station calibration and monitoring thresholds.'}</p></div>{page!=='Build guide'&&<button className="button secondary" onClick={exportCsv} disabled={!history.length}><ArrowDownToLine size={16}/>Export readings</button>}</div>
 {page!=='Build guide'&&<div className="source-banner source-compact"><div><span className="muted-dot"/><strong>{demo?'Sample readings':'Device readings'}</strong><span>{demo?'Generated data for project review.':'Measurements received from the station.'}</span></div>{!publicReview&&<label className="mode"><span>Use sample readings</span><input aria-label="Use sample readings" type="checkbox" checked={demo} onChange={e=>setDemo(e.target.checked)}/><span className="toggle"/></label>}</div>}
 {error&&<div className="error" role="alert">API connection failed. {error}. Data may be outdated.<button onClick={()=>load()}>Retry</button></div>}
 {busy&&<div className="loading">Connecting to monitoring API…</div>}
 {page==='Overview'&&<><section className="metrics"><div className="metric"><div className="metric-title">Current water level<Waves size={19}/></div><div className="metric-value">{latest?latest.levelCm.toFixed(1):'--'}<small>cm</small></div><div className="metric-foot"><span className={`badge ${currentStatus.toLowerCase()}`}>{currentStatus}</span><span>Above reference datum</span></div></div><div className="metric"><div className="metric-title">Highest level <Activity size={18}/></div><div className="metric-value">{peak?.toFixed(1)??'--'}<small>cm</small></div><div className="metric-foot"><span className="muted-dot"/>In the last {chartHours} hours</div></div><div className="metric"><div className="metric-title">Station connection<Wifi size={18}/></div><div className="connection-value"><span className={error||demo||stale?'status-dot gray':'status-dot'}/>{connection}</div><div className="metric-foot">{latest?`${demo ? 'Latest sample' : 'Last observation'} ${fmt(latest.observedAtUtc)}`:'No readings received yet'}</div></div><div className="metric"><div className="metric-title">Power design<Sun size={18}/></div><div className="power-value">Solar + backup</div><div className="metric-foot"><span className="muted-dot"/>Battery telemetry not available</div></div></section>
 <div className="overview-grid"><section className="card chart-card"><div className="card-heading"><div><h2>Water level trend</h2><p>Water level above the reference datum</p></div><select aria-label="Chart time range" value={chartHours} onChange={event => setChartHours(Number(event.target.value))}><option value="6">Last 6 hours</option><option value="12">Last 12 hours</option><option value="24">Last 24 hours</option></select></div><div className="chart-legend"><span><i className="line-sample"/>Water level</span><span><i className="dash-sample"/>Warning threshold</span></div><Chart rows={chartRows} settings={settings} /><div className="chart-footer"><span><RefreshCw size={13}/>Refreshes every 10 seconds</span><span>All times in your local timezone</span></div></section>
 <section className="card station-card"><div className="card-heading"><div><h2>Monitoring station</h2><p>One station. A continuous view.</p></div><span className="station-symbol"><Radio size={19}/></span></div><div className="station-visual"><StationIllustration/><span className="visual-label"><span className={demo||stale?'status-dot gray':'status-dot'}/>FW-001</span></div><div className="station-details"><div className="station-name"><h3>{settings.name}</h3><span className="device-id">FW-001</span></div><div className="detail-row"><MapPin size={15}/><span>{privateGps ? 'GPS location is private' : latest?.latitude != null && latest.longitude != null ? coordinates(latest.latitude, latest.longitude) : 'GPS coordinates unavailable'}</span></div>{!privateGps && <div className="detail-row"><Satellite size={15}/><span>{demo ? 'Sample location' : latest?.latitude != null ? 'Location supplied by device' : 'Waiting for GPS fix'}</span></div>}<button className="text-button" onClick={() => navigate('Station settings')}>View station configuration<ArrowUpRight size={15}/></button></div></section></div>
 <div className="lower-grid"><section className="card"><div className="card-heading"><div><h2>Recent readings</h2><p>The latest observations from your station</p></div><button className="text-button" onClick={() => navigate('Reading history')}>View all<ArrowUpRight size={15}/></button></div><ReadingsTable rows={rows.slice(-5).reverse()} settings={settings}/></section><section className="card thresholds"><div className="card-heading"><div><h2>Know your thresholds</h2><p>Configured water-level indicators</p></div><ShieldCheck size={19}/></div>{[['Normal',`Below ${settings.advisoryCm} cm`],['Advisory',`${settings.advisoryCm} to < ${settings.warningCm} cm`],['Warning',`${settings.warningCm} to < ${settings.criticalCm} cm`],['Critical',`${settings.criticalCm} cm and above`]].map(([a,b])=><div className="threshold-row" key={a}><span className={`threshold-dot ${a.toLowerCase()}`}/><strong>{a}</strong><span>{b}</span></div>)}<div className="threshold-note">Research settings only. Site thresholds require validation.</div></section></div></>}
 {page==='Reading history'&&<section className="card"><div className="card-heading"><div><h2>Observation log <span className="small-count">{history.length}</span></h2><p>{demo?'Sample observations for project review':'Received device measurements'}</p></div><div className="filters"><select aria-label="History time range" value={historyHours} onChange={event => setHistoryHours(Number(event.target.value))}>{[6,12,24,168].map(h=><option key={h} value={h}>Last {h} hours</option>)}</select><select aria-label="Filter status" value={filter} onChange={e=>setFilter(e.target.value)}>{['All states','Normal','Advisory','Warning','Critical'].map(s=><option key={s}>{s}</option>)}</select></div></div><ReadingsTable rows={history} settings={settings} full/></section>}
 {page==='Alerts'&&<section className="card"><div className="card-heading"><div><h2>Threshold activity</h2><p>Calculated state transitions, not acknowledged emergency notifications</p></div><span className="small-count">{events.length} events</span></div>{events.length?events.map(r=><div className="event" key={`${r.bootId}-${r.sequence}`}><span className={`event-icon ${levelStatus(r.levelCm,settings).toLowerCase()}`}><Bell size={18}/></span><div><strong>{levelStatus(r.levelCm,settings)} threshold state</strong><p>FW-001 recorded {r.levelCm.toFixed(1)} cm above the reference datum.</p><small>{fmt(r.observedAtUtc,true)} · {demo?'Sample observation':'Device reading'}</small></div><span className={`badge ${levelStatus(r.levelCm,settings).toLowerCase()}`}>{levelStatus(r.levelCm,settings)}</span></div>):<Empty text="No threshold events in this data source."/>}</section>}
 {page==='Station settings'&&<form onSubmit={save} className="settings-layout"><fieldset disabled={!canEditSettings || saving} className="settings-fields"><section className="card settings-card"><div className="card-heading"><div><h2>Station configuration</h2><p>Calibration and dashboard threshold settings</p></div><Gear size={20}/></div><div className="form-grid"><label className="full">Station name<input maxLength={80} required value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label><label className="full">Mounting height above reference datum (cm)<input type="number" min="40" max="600" step="0.1" required value={draft.heightCm} onChange={e=>setDraft({...draft,heightCm:Number(e.target.value)})}/><small>Water level = mounting height minus the sensor’s air-gap reading.</small></label>{(['advisoryCm','warningCm','criticalCm'] as const).map((key,i)=><label key={key}>{['Advisory','Warning','Critical'][i]} (cm)<input type="number" min="0" step="0.1" required value={draft[key]} onChange={e=>setDraft({...draft,[key]:Number(e.target.value)})}/></label>)}</div>{saveError && <div className="error" role="alert">{saveError}</div>}
  {canEditSettings && <div className="form-actions"><button type="button" className="button secondary" onClick={() => { setDraft(settings); setSaveError(''); }}>Reset changes</button><button className="button primary" type="submit"><Check size={17}/>{saving ? 'Saving…' : 'Save settings'}</button></div>}</section></fieldset><aside className="card config-note"><ShieldCheck size={28}/><h2>Calibrate before deployment.</h2><p>Keep thresholds increasing and at least 30 cm below the sensor mounting height. Verify your sensor’s actual blind zone.</p><p>These settings control the dashboard and API calculation. Existing readings retain their original level. Update and validate ESP32 firmware settings separately.</p><hr/><h3>{canEditSettings ? 'Local station management' : 'Station reference'}</h3><p>{canEditSettings ? 'Settings editing is restricted to local requests. Device ingestion requires a server-side API key.' : apiBase ? 'The server administrator manages this station’s calibration.' : 'Calibration is read-only here. Open the dashboard on the station laptop to update its settings.'}</p></aside></form>}
 {page==='Build guide'&&<BuildGuide/>}<footer className="footer"><span><Waves size={15}/>FloodWatch <span className="footer-sep">/</span> Student project</span><span>Observe. Understand. Prepare.</span></footer>
 </main></div>{notice&&<div className="toast" role="status"><Check size={18}/>{notice}<button aria-label="Dismiss notification" onClick={()=>setNotice('')}><X size={16}/></button></div>}<dialog className="modal" ref={helpRef} aria-labelledby="help-title"><button className="icon-button close" aria-label="Close help" onClick={() => helpRef.current?.close()}><X/></button><span className="brand-icon"><Waves/></span><h2 id="help-title">How this system works</h2><p>The ultrasonic sensor measures the air gap above water. The ESP32 calculates the water level and operates its local buzzer. Through Wi-Fi, it sends observations to ASP.NET Core. This dashboard retrieves them every 10 seconds.</p><p>The sample dataset lets you explore the interface before a station is connected. Actual measurements require the ESP32 and hosted ASP.NET Core API. GPS identifies the station, while solar and backup power support the sensing unit.</p><button className="button primary" onClick={() => helpRef.current?.close()}>Got it<ChevronRight size={16}/></button></dialog></div>
}
function fmt(value: string, full = false) {
  return (full ? observationFormat : hourFormat).format(Date.parse(value));
}

function Empty({text}:{text:string}){return <div className="empty"><Radio size={30}/><h3>{text}</h3><p>Try a different time range or status filter. Actual station readings appear after device connection.</p></div>}
function ReadingsTable({rows,settings,full=false}:{rows:Reading[];settings:Settings;full?:boolean}){return rows.length?<div className="table-scroll" tabIndex={0} role="region" aria-label={full ? 'Observation log' : 'Recent observations'}><table><thead><tr><th>OBSERVATION TIME</th><th>WATER LEVEL</th>{full&&<th>AIR GAP</th>}<th>STATUS</th><th>STATION</th></tr></thead><tbody>{rows.map(r=><tr key={`${r.bootId}-${r.sequence}`}><td><Clock3 size={13}/>{fmt(r.observedAtUtc,true)}</td><td className="number">{r.levelCm.toFixed(1)} <span>cm</span></td>{full&&<td>{r.distanceCm.toFixed(1)} cm</td>}<td><span className={`badge ${levelStatus(r.levelCm,settings).toLowerCase()}`}>{levelStatus(r.levelCm,settings)}</span></td><td className="mono">{r.deviceId}</td></tr>)}</tbody></table></div>:<Empty text="No readings to display."/>}
function Chart({ rows, settings }: { rows: Reading[]; settings: Settings }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    if (!chartRef.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(230, entry.contentRect.width)));
    observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, []);

  const first = rows.at(0);
  const last = rows.at(-1);
  if (!first || !last) return <div className="chart" ref={chartRef}><Empty text="Your water-level trend will appear here." /></div>;

  const start = Date.parse(first.observedAtUtc);
  const end = Date.parse(last.observedAtUtc);
  const left = 38;
  const right = width - 15;
  const bottom = width < 470 ? 166 : 230;
  const topLevel = Math.max(40, settings.criticalCm, ...rows.map(row => row.levelCm));
  const step = Math.max(10, Math.ceil(topLevel / 40) * 10);
  const highest = step * 4;
  const x = (ratio: number) => left + (right - left) * ratio;
  const y = (level: number) => bottom - level / highest * (bottom - 26);
  const point = (row: Reading) => x(end === start ? 0.5 : (Date.parse(row.observedAtUtc) - start) / (end - start));
  const points = rows.map(row => `${point(row)},${y(row.levelCm)}`).join(' ');
  const ticks = end === start ? [0.5] : width < 470 ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="chart" ref={chartRef}>
      <svg viewBox={`0 0 ${width} ${bottom + 36}`} role="img" aria-label="Water level history chart in centimeters">
        <defs>
          <linearGradient id="fill" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#15998d" stopOpacity=".23" />
            <stop offset="100%" stopColor="#15998d" stopOpacity=".015" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map(index => {
            const level = step * index;
          return <g key={index}>
            <line x1={left} x2={right} y1={y(level)} y2={y(level)} stroke="#edf1f2" />
            <text x={left - 8} y={y(level) + 4} textAnchor="end">{level}</text>
          </g>;
        })}
        <text x="13" y="13">cm</text>
        <line x1={left} x2={right} y1={y(settings.warningCm)} y2={y(settings.warningCm)} stroke="#b17b25" strokeDasharray="5 5" />
        <polygon points={`${point(first)},${bottom} ${points} ${point(last)},${bottom}`} fill="url(#fill)" />
        <polyline points={points} fill="none" stroke="#11978b" strokeWidth="2.7" strokeLinejoin="round" />
        <circle cx={point(last)} cy={y(last.levelCm)} r="4.5" fill="#11978b" stroke="white" strokeWidth="2" />
        {ticks.map(ratio => {
          const time = start + ratio * (end - start);
          return <text key={ratio} x={x(ratio)} y={bottom + 27} textAnchor={ratio === 0 ? 'start' : ratio === 1 ? 'end' : 'middle'}>
            {hourFormat.format(time)}
          </text>;
        })}
      </svg>
    </div>
  );
}

function StationIllustration(){return <svg viewBox="0 0 360 178" role="img" aria-label="Illustration of a solar-powered water-level monitoring station"><defs><pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="#b9d4cb"/></pattern></defs><rect width="360" height="178" fill="#edf5ee"/><rect width="360" height="178" fill="url(#dots)"/><circle cx="290" cy="37" r="17" fill="#e6d99f"/><path d="M0 118 Q65 91 127 117T260 109T360 114V178H0Z" fill="#d6e4d1"/><path d="M0 143Q66 132 137 149T280 139T360 143V178H0Z" fill="#a9d5ce"/><path d="M0 158Q100 147 180 160T360 156" stroke="#ecf9f4" fill="none"/><path d="M69 169l40-3m91 1l36-2m59-12l25-2" stroke="#eaf7f1" strokeWidth="2"/><path d="M162 137V42h56v37" fill="none" stroke="#42665c" strokeWidth="5"/><rect x="150" y="70" width="25" height="35" rx="3" fill="#f9fcf7" stroke="#6d8e7e"/><circle cx="162" cy="97" r="2" fill="#0e9580"/><path d="M145 29l48-8 10 21-49 8z" fill="#386b6a" stroke="#e0f0e5" strokeWidth="2"/><path d="M158 27l10 21m4-24l10 21m4-24l10 21m-45-5l48-8" stroke="#9bbdb6"/><rect x="210" y="77" width="16" height="8" rx="3" fill="#648e7e"/><path d="M218 90v44" stroke="#5f9c8b" strokeDasharray="3 4"/><path d="M205 137q13-7 26 0m-31 6q18-10 36 0" stroke="#4caa9a" fill="none"/><path d="M151 138h24" stroke="#6a8d73" strokeWidth="4"/><path d="M46 136v-19m-6 8l6 4 7-11m247 20v-16m-5 7l5 3 6-9" stroke="#93b391" strokeWidth="2"/></svg>}
