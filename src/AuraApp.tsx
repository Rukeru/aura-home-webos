import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {APPS, type AppItem} from './lib/apps';
import {isWebOS, launchApp, listLaunchPoints} from './service/luna';
import {fetchForecast, searchCity, type Forecast, type GeoResult} from './service/weather';
import {loadConfig, type GeoLocation} from './lib/config';
import {CloudSun} from 'lucide-react';
import PhotoBackground from './components/PhotoBackground';
import {PHOTO_COLLECTIONS} from './lib/ambient-collections';
import './aura.css';

type CollectionId = 'original' | keyof typeof PHOTO_COLLECTIONS;
type Wallpaper = {name:string;image?:string};
const originalNames=['Aurora','Dune','Tide'];
const collections:Record<CollectionId,{name:string;wallpapers:Wallpaper[]}>= {original:{name:'Original Abstracts',wallpapers:originalNames.map(name=>({name}))},...PHOTO_COLLECTIONS};
type Preferences = {order: string[]; collection:CollectionId; wallpaper: number; rotation: boolean; interval: number; hour12: boolean};
type Panel = 'menu' | 'inputs' | 'settings' | 'weather' | 'apps' | null;
type WeatherPreferences = {location: GeoLocation | null; unit: 'celsius' | 'fahrenheit'};
const KEY = 'aura-home.v1';
const defaults: Preferences = {order: [], collection:'space', wallpaper: 0, rotation: true, interval: 300000, hour12: false};
const catalog = Object.values(APPS).flat().filter(a => a.launchType !== 'input' && a.launchType !== 'internal');
const sampleIds = ['netflix', 'youtube.leanback.v4', 'amazon', 'com.disney.disneyplus-prod', 'spotify-beehive', 'org.webosbrew.hbchannel'];
const samples = sampleIds.map(id => catalog.find(a => a.id === id)!).filter(Boolean);
function load(): Preferences {
 try {
  const p = JSON.parse(localStorage.getItem(KEY) || '{}');
  const collection:CollectionId=typeof p.collection==='string'&&Object.prototype.hasOwnProperty.call(collections,p.collection)?p.collection:defaults.collection;
  return {order: Array.isArray(p.order) ? p.order.filter((id: unknown) => typeof id === 'string') : [], collection, wallpaper: Number.isInteger(p.wallpaper) && p.wallpaper >= 0 && p.wallpaper < collections[collection].wallpapers.length ? p.wallpaper : 0, rotation: typeof p.rotation === 'boolean' ? p.rotation : true, interval: [15000,120000,300000,600000,1800000].includes(p.interval) ? p.interval : defaults.interval, hour12: typeof p.hour12 === 'boolean' ? p.hour12 : false};
 } catch {return {...defaults};}
}
function loadWeather(): WeatherPreferences {
 try {
  const raw=JSON.parse(localStorage.getItem('aura-weather.v1')||'null');
  const previous=loadConfig();
  const location=raw?.location ?? (previous.location.name!=='Your City'?previous.location:null);
  const valid=location&&typeof location.name==='string'&&Number.isFinite(location.latitude)&&Number.isFinite(location.longitude)&&Math.abs(location.latitude)<=90&&Math.abs(location.longitude)<=180;
  return {location:valid?location:null,unit:raw?.unit==='fahrenheit'?'fahrenheit':'celsius'};
 } catch {return {location:null,unit:'celsius'};}
}

export default function AuraApp() {
 const device = isWebOS();
 const [prefs, setPrefs] = useState<Preferences>(load);
 const wallpapers=collections[prefs.collection].wallpapers;
 const names=wallpapers.map(w=>w.name);
 const [weatherPrefs,setWeatherPrefs]=useState<WeatherPreferences>(loadWeather);
 const [forecast,setForecast]=useState<Forecast|null>(null);
 const [weatherStatus,setWeatherStatus]=useState('');
 const [query,setQuery]=useState('');
 const [results,setResults]=useState<GeoResult[]>([]);
 const [searching,setSearching]=useState(false);
 const searchRequest=useRef(0);
 const [installed, setInstalled] = useState<AppItem[]>(device ? [] : samples);
 const [discovery, setDiscovery] = useState(device ? 'loading' : 'preview');
 const [settingsId, setSettingsId] = useState<string | null>(null);
 const [panel, setPanel] = useState<Panel>(null);
 const [appsPage,setAppsPage]=useState(0);
 const [moving, setMoving] = useState(false);
 const [selected, setSelected] = useState(0);
 const [now, setNow] = useState(new Date());
 const [message, setMessage] = useState('');
 const [idle, setIdle] = useState(false);
 const toastTimer = useRef<ReturnType<typeof setTimeout>>();
 const originalOrder = useRef<string[]>([]);
 const clockRef = useRef<HTMLButtonElement>(null);
 const dockRef = useRef<HTMLElement>(null);
 const panelRef = useRef<HTMLElement>(null);
 const pendingFocus = useRef<number | null>(null);
 const lastInput = useRef(Date.now());
 const apps = useMemo(() => {
  const rank = new Map(prefs.order.map((id, i) => [id, i]));
  return installed.slice().sort((a,b) => (rank.get(a.id) ?? 10000) - (rank.get(b.id) ?? 10000));
 }, [installed, prefs.order]);
 useLayoutEffect(()=>{
  if(!panel&&pendingFocus.current!==null){cancelAnimationFrame(pendingFocus.current);pendingFocus.current=null;dockRef.current?.querySelector<HTMLButtonElement>(`[data-index="${selected}"]`)?.focus();}
 },[selected,moving,panel,apps]);
 const page = Math.floor(selected / 7);
 const visible = apps.slice(page * 7, page * 7 + 7);
 const pageCount = Math.ceil(apps.length / 7);
 const browserPageCount=Math.ceil(apps.length/6);
 const browserPage=Math.min(appsPage,Math.max(0,browserPageCount-1));
 const browserApps=apps.slice(browserPage*6,browserPage*6+6);
 const notify = useCallback((text: string) => {setMessage(text);clearTimeout(toastTimer.current);toastTimer.current = setTimeout(() => setMessage(''), 3500);}, []);
 const discover = useCallback(async () => {
  if (!device) return;
  setDiscovery('loading');
  try {
   const result = await listLaunchPoints();
   const points = result.launchPoints;
   if (!Array.isArray(points)) throw new Error('Invalid app list');
   const settings = points.find(lp => /^(settings|all settings)$/i.test(lp.title) || lp.id === 'com.webos.app.settings');
   setSettingsId(settings?.id || null);
   const unique = new Map<string, AppItem>();
   points.forEach(lp => {
    if (!lp.id || lp.id === 'tld.my.customhome' || /^com\.webos\.app\.hdmi\d+$/.test(lp.id)) return;
    const known = catalog.find(a => a.id === lp.id) || catalog.find(a => a.title.toLowerCase() === lp.title?.toLowerCase());
    const icon = known?.icon || (lp.title?.toLowerCase() === 'plex' ? 'icons/plex.png' : undefined);
    unique.set(lp.id, {id:lp.id, title:lp.title || known?.title || lp.id, color:known?.color || '#b3d7d0', icon});
   });
   setInstalled([...unique.values()]);setSelected(0);setDiscovery('ready');
  } catch {setDiscovery('error');notify('Could not read your app list. Choose Refresh apps to retry.');}
 }, [device, notify]);
 useEffect(() => {void discover();}, [discover]);
 useEffect(() => {clockRef.current?.focus();}, []);
 useEffect(()=>{try{localStorage.setItem('aura-weather.v1',JSON.stringify(weatherPrefs));}catch{notify('Weather settings could not be saved.');}},[weatherPrefs,notify]);
 useEffect(()=>{
  if(!weatherPrefs.location){setForecast(null);setWeatherStatus('');return;}
  let alive=true;
  setForecast(null);setWeatherStatus('Loading weather…');
  const location=weatherPrefs.location;
  const refresh=()=>fetchForecast({...location,temperatureUnit:weatherPrefs.unit}).then(fc=>{if(alive){setForecast(fc);setWeatherStatus('');}}).catch(()=>{if(alive){setForecast(null);setWeatherStatus('Weather unavailable');}});
  void refresh();const timer=setInterval(()=>{if(!document.hidden)void refresh();},900000);
  return()=>{alive=false;clearInterval(timer);};
 },[weatherPrefs]);
 const findCity=async()=>{
  const request=++searchRequest.current;setSearching(true);setResults([]);
  const found=await searchCity(query);
  if(request!==searchRequest.current)return;
  setResults(found);setSearching(false);
  if(!found.length)notify('No city results. Check the name and your internet connection.');
 };
 useEffect(() => {if (!moving) {try {localStorage.setItem(KEY, JSON.stringify(prefs));} catch {notify('Your changes could not be saved.');}}}, [prefs, moving, notify]);
 useEffect(() => {
  const timer = setInterval(() => setNow(new Date()), 1000);
  return () => {clearInterval(timer);clearTimeout(toastTimer.current);};
 }, []);
 useEffect(() => {
  if (!prefs.rotation || moving || panel || idle || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const timer = setInterval(() => {if(!document.hidden)setPrefs(p => ({...p, wallpaper:(p.wallpaper + 1) % names.length}));}, prefs.interval);
  return () => clearInterval(timer);
 }, [prefs.rotation, prefs.interval, prefs.collection, moving, panel, idle]);
 useEffect(() => {
  const poke = () => {lastInput.current = Date.now();setIdle(false);};
  const events = ['keydown','pointermove','pointerdown','visibilitychange'];
  events.forEach(name => window.addEventListener(name,poke));
  const timer = setInterval(() => {if(!panel&&!moving&&Date.now()-lastInput.current>90000)setIdle(true);},5000);
  return () => {events.forEach(name => window.removeEventListener(name,poke));clearInterval(timer);};
 }, [panel,moving]);
 useEffect(() => {
  if(panel){const firstApp=panel==='apps'?panelRef.current?.querySelector<HTMLButtonElement>('.tv-app-grid button'):null;(firstApp||panelRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)'))?.focus();}
 }, [panel,appsPage]);
 const focusApp = (index: number) => {
  setSelected(index);
  if(pendingFocus.current!==null)cancelAnimationFrame(pendingFocus.current);
  pendingFocus.current=requestAnimationFrame(() => {pendingFocus.current=null;dockRef.current?.querySelector<HTMLButtonElement>(`[data-index="${index}"]`)?.focus();});
 };
 const close = () => {setPanel(null);clockRef.current?.focus();};
 const open = () => {if(moving)finish(true);setPanel('menu');};
 const reorder = () => {
  originalOrder.current = apps.map(a=>a.id);
  setPrefs(p=>({...p, order:apps.map(a=>a.id)}));setMoving(true);setPanel(null);focusApp(selected);
 };
 const move = (delta: number) => {
  const next = selected + delta;if(next < 0 || next >= apps.length)return;
  const order = apps.map(a=>a.id);[order[selected],order[next]] = [order[next],order[selected]];
  setPrefs(p=>({...p,order}));focusApp(next);
 };
 const finish = (save: boolean) => {
  if(!save)setPrefs(p=>({...p,order:originalOrder.current.slice()}));
  setMoving(false);notify(save?'App order saved':'Arrangement cancelled');
 };
 const launch = async (id: string, title: string) => {
  if(!device){notify(`Preview: ${title} selected`);return;}
  try {await launchApp(id);} catch {notify(`Could not open ${title}. You can still use the TV remote.`);}
 };
 const onKey = (event: React.KeyboardEvent<HTMLElement>) => {
  if(pendingFocus.current!==null){cancelAnimationFrame(pendingFocus.current);pendingFocus.current=null;}
  const key = event.key;
  if(idle){event.preventDefault();event.stopPropagation();setIdle(false);return;}
  if(key==='Escape'||event.keyCode===461){event.preventDefault();if(moving)finish(false);else if(panel==='apps')setPanel('menu');else if(panel)close();return;}
  if(event.target instanceof HTMLInputElement){if(key==='ArrowDown'){event.preventDefault();panelRef.current?.querySelector<HTMLButtonElement>('button[type=submit]:not(:disabled)')?.focus();}return;}
  if(event.target instanceof HTMLSelectElement)return;
  if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(key))return;
  event.preventDefault();
  if(panel){
   const gridButton=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-browser-index]');
   if(panel==='apps'&&gridButton){
    const grid=panelRef.current?.querySelector<HTMLElement>('.tv-app-grid');
    const buttons=Array.from(grid?.querySelectorAll<HTMLButtonElement>('button')||[]);
    const index=Number(gridButton.dataset.browserIndex),columns=grid?getComputedStyle(grid).gridTemplateColumns.split(' ').length:3;
    const delta=key==='ArrowLeft'?-1:key==='ArrowRight'?1:key==='ArrowUp'?-columns:columns;
    const next=index+delta;
    if(next<0&&key==='ArrowUp')panelRef.current?.querySelector<HTMLButtonElement>('[aria-label="Close quick controls"]')?.focus();
    else if(next>=buttons.length&&key==='ArrowDown')panelRef.current?.querySelector<HTMLButtonElement>('.tv-app-browser-footer button:not(:disabled)')?.focus();
    else buttons[Math.max(0,Math.min(buttons.length-1,next))]?.focus();
    return;
   }
   const nodes=Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),select,input')||[]);
   const index=nodes.indexOf(document.activeElement as HTMLElement),delta=key==='ArrowDown'||key==='ArrowRight'?1:-1;
   nodes[(index+delta+nodes.length)%nodes.length]?.focus();return;
  }
  if(document.activeElement===clockRef.current){if(key==='ArrowDown'&&apps.length)focusApp(selected);return;}
  const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-index]');
  if(button){
   const index=Number(button.dataset.index);
   if(moving&&(key==='ArrowLeft'||key==='ArrowRight')){move(key==='ArrowLeft'?-1:1);return;}
   if(key==='ArrowUp'){clockRef.current?.focus();return;}
   if(key==='ArrowDown'){document.querySelector<HTMLButtonElement>('.tv-arrange [data-commit],.tv-pagination button:not(:disabled)')?.focus();return;}
   if(key==='ArrowLeft'||key==='ArrowRight')focusApp(Math.max(0,Math.min(apps.length-1,index+(key==='ArrowLeft'?-1:1))));
  }
  else {
   const group=(event.target as HTMLElement).closest('.tv-arrange,.tv-pagination');
   if(group){if(key==='ArrowUp'){focusApp(selected);return;}const buttons=Array.from(group.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));const index=buttons.indexOf(event.target as HTMLButtonElement),delta=key==='ArrowLeft'?-1:1;buttons[(index+delta+buttons.length)%buttons.length]?.focus();}
   else if(key==='ArrowUp'||key==='ArrowRight')clockRef.current?.focus();
   else if(key==='ArrowDown'&&apps.length)focusApp(selected);
  }
 };
 const time = new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit',hour12:prefs.hour12}).format(now);
 const date = new Intl.DateTimeFormat(undefined,{weekday:'long',day:'numeric',month:'long'}).format(now);
 return <main className={`aura-tv${idle?' is-idle':''}`} onKeyDown={onKey} aria-label="Aura home">
  <div className="tv-wallpapers" aria-hidden="true">{originalNames.map((name,i)=><div key={name} className={`tv-wall ${name.toLowerCase()}${(prefs.collection==='original'?prefs.wallpaper:0)===i?' active':''}`}><div className="tv-ribbon"/><div className="tv-ribbon secondary"/></div>)}</div>
  <PhotoBackground src={wallpapers[prefs.wallpaper]?.image||''}/>
  <div className="tv-vignette"/>
  <header className="tv-header"><section className="tv-weather" aria-label="Weather">
   <div className="tv-weather-place">{weatherPrefs.location?.name||(!device?'Your city · sample weather':'Weather')}</div>
   {forecast?<><div className="tv-weather-current"><span aria-hidden="true">{forecast.now.glyph}</span><div><strong>{forecast.now.temp}{forecast.now.unit}</strong><span>{forecast.now.label}</span></div></div><div className="tv-weather-days">{forecast.days.map(day=><div key={day.label}><span>{day.label}</span><span aria-hidden="true">{day.glyph}</span><span>{day.hi}° / {day.lo}°</span></div>)}</div></>:weatherPrefs.location?<p>{weatherStatus}</p>:!device?<><div className="tv-weather-current"><CloudSun aria-hidden="true"/><div><strong>16°C</strong><span>Partly cloudy</span></div></div><div className="tv-weather-days"><div><span>Today</span><span>18° / 11°</span></div><div><span>Tomorrow</span><span>17° / 10°</span></div><div><span>Thu</span><span>16° / 9°</span></div></div></>:<button onClick={()=>setPanel('weather')}>Set your weather location</button>}
  </section>
   <section className="tv-clock-tile" aria-label="Clock and wallpaper controls"><button className="tv-clock" ref={clockRef} onClick={()=>panel?close():open()} aria-label="Clock and quick controls" aria-expanded={!!panel}><span className="tv-time">{time}</span><span className="tv-date">{date}</span><span className="tv-clock-hint">Quick controls ↗</span></button>
   </section>
  </header>
  <section className="tv-dock-area">
   <nav className="tv-dock" ref={dockRef} aria-label="Apps">{visible.map((app,i)=>{const index=page*7+i;return <button key={app.id} className={`tv-app${moving&&index===selected?' selected':''}`} data-index={index} onFocus={()=>setSelected(index)} onClick={()=>{if(moving)focusApp(index);else void launch(app.id,app.title);}} aria-label={moving?`Select ${app.title} to move`:`Open ${app.title}`} aria-pressed={moving?index===selected:undefined}>
    {app.icon?<img src={app.icon} alt="" onError={e=>{e.currentTarget.style.display='none';}}/>:<span className="tv-monogram">{app.title.slice(0,2).toUpperCase()}</span>}
   </button>;})}</nav>
   {discovery==='loading'&&<p className="tv-empty">Loading your apps…</p>}
   {discovery==='error'&&<button className="tv-retry" onClick={()=>void discover()}>Refresh apps</button>}
   {discovery==='ready'&&!apps.length&&<p className="tv-empty">No apps found. Open the clock to refresh.</p>}
   {moving?<div className="tv-arrange"><span>{apps[selected]?.title} · arrows move · ↓ Done saves · Back cancels</span><div><button onClick={()=>move(-1)} disabled={selected===0} aria-label="Move app left">←</button><button onClick={()=>move(1)} disabled={selected>=apps.length-1} aria-label="Move app right">→</button><button data-commit onClick={()=>finish(true)}>Done</button><button onClick={()=>finish(false)}>Cancel</button></div></div>:pageCount>1?<div className="tv-pagination"><button disabled={page===0} onClick={()=>focusApp((page-1)*7)}>← Previous</button><button disabled={page>=pageCount-1} onClick={()=>focusApp((page+1)*7)}>More apps →</button></div>:null}
  </section>
  {panel&&<div className="tv-overlay" onClick={close}><section className="tv-panel" ref={panelRef} aria-label="Quick controls" onClick={e=>e.stopPropagation()}><div className="tv-panel-heading"><h2>{panel==='menu'?'Quick controls':panel==='apps'?'All apps':panel==='inputs'?'Inputs':panel==='weather'?'Weather location':'Settings'}</h2><button onClick={close} aria-label="Close quick controls">×</button></div>
   {panel==='menu'&&<section className="tv-caption"><label className="tv-collection-picker">Ambient collection<select aria-label="Ambient collection" value={prefs.collection} onChange={e=>setPrefs(p=>({...p,collection:e.target.value as CollectionId,wallpaper:0}))}>{Object.entries(collections).map(([id,collection])=><option key={id} value={id}>{collection.name}</option>)}</select></label><div>{names[prefs.wallpaper]}<button aria-label="Next wallpaper" onClick={()=>setPrefs(p=>({...p,wallpaper:(p.wallpaper+1)%names.length}))}>→</button></div></section>}
   {panel==='menu'?<div className="tv-menu"><button onClick={()=>{setAppsPage(0);setPanel('apps');}}>All apps <span>↗</span></button><button onClick={()=>setPanel('inputs')}>Inputs <span>↗</span></button><button onClick={()=>setPanel('settings')}>Settings <span>↗</span></button><button onClick={reorder} disabled={!apps.length}>Arrange apps <span>↔</span></button></div>:panel==='apps'?<div className="tv-app-browser"><nav className="tv-app-grid" aria-label="All apps">{browserApps.map((app,index)=><button key={app.id} data-browser-index={index} aria-label={`Launch ${app.title}`} onClick={()=>void launch(app.id,app.title)}>{app.icon?<img src={app.icon} alt="" onError={event=>{event.currentTarget.style.display='none';}}/>:<span className="tv-monogram">{app.title.slice(0,2).toUpperCase()}</span>}<span className="tv-browser-label">{app.title}</span></button>)}</nav>{!apps.length&&<p className="tv-empty">{discovery==='loading'?'Loading your apps…':discovery==='error'?'Could not read your app list.':'No apps found.'}</p>}<div className="tv-app-browser-footer">{browserPageCount>1&&<><button disabled={browserPage===0} onClick={()=>setAppsPage(browserPage-1)} aria-label="Previous apps page">←</button><span>{browserPage+1} / {browserPageCount}</span><button disabled={browserPage>=browserPageCount-1} onClick={()=>setAppsPage(browserPage+1)} aria-label="Next apps page">→</button></>}<button onClick={()=>setPanel('menu')}>← Quick controls</button>{discovery==='error'&&<button onClick={()=>void discover()}>Refresh apps</button>}</div></div>:panel==='inputs'?<div className="tv-menu">{[1,2,3,4].map(n=><button key={n} onClick={()=>void launch(`com.webos.app.hdmi${n}`,`HDMI ${n}`)}>HDMI {n}<span>↗</span></button>)}<button onClick={()=>setPanel('menu')}>← Quick controls</button></div>:panel==='weather'?<div className="tv-options"><form onSubmit={e=>{e.preventDefault();void findCity();}}><label>City<input value={query} onChange={e=>{setQuery(e.target.value);searchRequest.current++;setSearching(false);setResults([]);}} placeholder="Enter your city"/></label><button type="submit" disabled={searching||!query.trim()}>{searching?'Searching…':'Search'}</button></form>{results.map(result=><button key={`${result.latitude},${result.longitude}`} onClick={()=>{setWeatherPrefs(p=>({...p,location:{name:result.name,latitude:result.latitude,longitude:result.longitude}}));setPanel('settings');}}>{result.label}</button>)}<label>Temperature unit<select value={weatherPrefs.unit} onChange={e=>setWeatherPrefs(p=>({...p,unit:e.target.value as WeatherPreferences['unit']}))}><option value="celsius">Celsius</option><option value="fahrenheit">Fahrenheit</option></select></label><button onClick={()=>setPanel('settings')}>← Settings</button></div>:<div className="tv-options">
    <label className="tv-toggle">Rotate wallpapers<input type="checkbox" checked={prefs.rotation} onChange={e=>setPrefs(p=>({...p,rotation:e.target.checked}))}/></label>
    <label>Change wallpaper every<select value={prefs.interval} onChange={e=>setPrefs(p=>({...p,interval:Number(e.target.value)}))}>{!device&&<option value={15000}>15 seconds · preview</option>}<option value={120000}>2 minutes</option><option value={300000}>5 minutes</option><option value={600000}>10 minutes</option><option value={1800000}>30 minutes</option></select></label>
    <label>Clock format<select value={String(prefs.hour12)} onChange={e=>setPrefs(p=>({...p,hour12:e.target.value==='true'}))}><option value="false">24-hour</option><option value="true">12-hour</option></select></label>
    <button onClick={()=>setPanel('weather')}>Weather location · {weatherPrefs.location?.name||'Set city'}</button>
    <button onClick={()=>{if(!device)notify('Preview: TV settings selected');else if(settingsId)void launch(settingsId,'TV settings');}} disabled={device&&!settingsId}>{device&&!settingsId?'TV settings: use the remote':'TV settings ↗'}</button>
    <button onClick={()=>void discover()} disabled={!device||discovery==='loading'}>Refresh apps</button><button onClick={()=>setPanel('menu')}>← Quick controls</button>
   </div>}
  </section></div>}
  {message&&<div className="tv-toast" role="status">{message}</div>}
  {idle&&<div className="tv-idle"><span>{time}</span><small>Press any button to return</small><button onClick={()=>setIdle(false)}>Return home</button></div>}
 </main>;
}
