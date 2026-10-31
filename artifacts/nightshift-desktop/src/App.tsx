import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type CSSProperties } from 'react';
import {
  Archive, ExternalLink, Gamepad2, Maximize2, Search, Settings as SettingsIcon, Upload,
} from 'lucide-react';

type AppId = 'steam' | 'archive' | 'settings';
type Game = { id: string; title: string; category: string; subtitle: string; cover: 'parenting' | 'ink' | 'retro' | 'basketball' | 'custom'; externalLaunchUrl?: string; builtInUrl?: string };
type AppWindow = { open: boolean; minimized: boolean; z: number; x?: number; y?: number; closing?: boolean };
type Source = { url?: string; fileUrl?: string; fileName?: string };
type Preferences = {
  theme: 'dark' | 'extra-dark';
  background: 'deep-current' | 'graphite' | 'tidal';
  animateBackground: boolean;
  transparency: number;
  showStatus: boolean;
  showDock: boolean;
  dockSize: number;
  dockAnimation: boolean;
  fullscreen: boolean;
  stretch: boolean;
  audioDefault: boolean;
  interfaceSounds: boolean;
  rememberApp: boolean;
  lowPower: boolean;
  reduceEffects: boolean;
  reduceMotion: boolean;
  pauseInactive: boolean;
};

const defaultPreferences: Preferences = {
  theme: 'dark', background: 'deep-current', animateBackground: true, transparency: 82,
  showStatus: true, showDock: true, dockSize: 52, dockAnimation: true,
  fullscreen: false, stretch: false, audioDefault: true, interfaceSounds: false, rememberApp: true,
  lowPower: false, reduceEffects: false, reduceMotion: false, pauseInactive: true,
};
const defaultGames: Game[] = [
  { id: 'bad-parenting', title: 'Bad Parenting', category: 'Horror', subtitle: 'A strange little nightmare', cover: 'parenting' },
  { id: 'bendy', title: 'Bendy and the Ink Machine', category: 'Adventure', subtitle: 'The studio is waiting', cover: 'ink' },
  { id: 'retro-bowl', title: 'Retro Bowl', category: 'Sports', subtitle: 'Embedded HTML game wrapper · external assets required', cover: 'retro', builtInUrl: '/games/retro_bowl.html', externalLaunchUrl: 'https://poki.com/en/g/retro-bowl' },
  { id: 'basketball-stars', title: 'Basketball Stars', category: 'Sports', subtitle: 'Included HTML launcher · internet required', cover: 'basketball', builtInUrl: '/games/basketball_stars.html' },
];
const prefKey = 'nightshift.preferences.v1';
const sourceKey = 'nightshift.game-sources.v1';
const lastAppKey = 'nightshift.last-app.v1';
const customGamesKey = 'nightshift.custom-games.v1';

function readPreferences(): Preferences {
  try { return { ...defaultPreferences, ...JSON.parse(localStorage.getItem(prefKey) || '{}') }; }
  catch { return defaultPreferences; }
}
function readSources(): Record<string, Source> {
  try { return JSON.parse(localStorage.getItem(sourceKey) || '{}'); }
  catch { return {}; }
}
function readCustomGames(): Game[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(customGamesKey) || '[]');
    if (!Array.isArray(stored)) return [];
    return stored.filter((value): value is Game => {
      if (!value || typeof value !== 'object') return false;
      const item = value as Partial<Game>;
      return typeof item.id === 'string' && item.id.startsWith('custom-')
        && typeof item.title === 'string' && item.title.length > 0
        && typeof item.category === 'string' && item.cover === 'custom';
    });
  } catch { return []; }
}
function formatDate(date: Date) {
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function App() {
  const [preferences, setPreferences] = useState<Preferences>(readPreferences);
  const [sources, setSources] = useState<Record<string, Source>>(readSources);
  const [windows, setWindows] = useState<Record<AppId, AppWindow>>({
    steam: { open: false, minimized: false, z: 1 },
    archive: { open: false, minimized: false, z: 1 },
    settings: { open: false, minimized: false, z: 1 },
  });
  const [zTop, setZTop] = useState(2);
  const [game, setGame] = useState<Game | null>(null);
  const [gameReturnApp, setGameReturnApp] = useState<AppId>('steam');
  const [activeSettings, setActiveSettings] = useState('Appearance');
  const [now, setNow] = useState(new Date());
  const [toast, setToast] = useState('');
  const [archiveQuery, setArchiveQuery] = useState('');
  const [archiveCategory, setArchiveCategory] = useState('All games');
  const [addingGame, setAddingGame] = useState(false);
  const [newGameTitle, setNewGameTitle] = useState('');
  const [newGameCategory, setNewGameCategory] = useState('Indie');
  const [configureGame, setConfigureGame] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState('');
  const [clockLabel, setClockLabel] = useState('');
  const [isInactive, setIsInactive] = useState(false);
  const [dockEdgeActive, setDockEdgeActive] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);
  const dragRef = useRef<{ id: AppId; offsetX: number; offsetY: number } | null>(null);
  const remembered = useRef(false);
  const objectUrls = useRef(new Set<string>());
  const audioContext = useRef<AudioContext | null>(null);
  const [customGames, setCustomGames] = useState<Game[]>(readCustomGames);
  const games = useMemo(() => [...defaultGames, ...customGames], [customGames]);

  const playUiSound = useCallback((kind: 'open' | 'close' | 'launch') => {
    if (!preferences.interfaceSounds || typeof window.AudioContext === 'undefined') return;
    try {
      const context = audioContext.current ?? new window.AudioContext();
      audioContext.current = context;
      if (context.state === 'suspended') void context.resume().catch(() => undefined);
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime;
      oscillator.type = 'sine';
      oscillator.frequency.value = kind === 'open' ? 660 : kind === 'close' ? 440 : 780;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.018, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.13);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.14);
    } catch {
      // Audio is optional; unsupported or blocked audio never interrupts the desktop.
    }
  }, [preferences.interfaceSounds]);

  useEffect(() => {
    localStorage.setItem(prefKey, JSON.stringify(preferences));
    document.documentElement.style.setProperty('--glass', String(preferences.transparency / 100));
  }, [preferences]);
  useEffect(() => {
    const persistent: Record<string, Source> = {};
    Object.entries(sources).forEach(([id, source]) => { if (source.url) persistent[id] = { url: source.url }; });
    localStorage.setItem(sourceKey, JSON.stringify(persistent));
  }, [sources]);
  useEffect(() => {
    localStorage.setItem(customGamesKey, JSON.stringify(customGames));
  }, [customGames]);
  useEffect(() => () => {
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current.clear();
    void audioContext.current?.close();
  }, []);
  useEffect(() => {
    const tick = () => {
      const date = new Date();
      setNow(date);
      setClockLabel(date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }));
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    const update = () => setIsInactive(document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  useEffect(() => {
    const revealAtEdge = (event: MouseEvent) => setDockEdgeActive(event.clientY >= window.innerHeight - 92);
    window.addEventListener('mousemove', revealAtEdge);
    return () => window.removeEventListener('mousemove', revealAtEdge);
  }, []);
  useEffect(() => {
    if (!preferences.rememberApp || remembered.current) return;
    remembered.current = true;
    const last = localStorage.getItem(lastAppKey) as AppId | null;
    if (last && ['steam', 'archive', 'settings'].includes(last)) openApp(last);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferences.rememberApp]);
  useEffect(() => () => {
    Object.values(sources).forEach((source) => { if (source.fileUrl) URL.revokeObjectURL(source.fileUrl); });
  }, [sources]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 2600);
  }, []);
  const raiseApp = useCallback((id: AppId) => {
    setZTop((current) => current + 1);
    setWindows((current) => ({ ...current, [id]: { ...current[id], open: true, minimized: false, closing: false, z: zTop + 1 } }));
    localStorage.setItem(lastAppKey, id);
  }, [zTop]);
  const openApp = useCallback((id: AppId) => {
    playUiSound('open');
    raiseApp(id);
  }, [playUiSound, raiseApp]);
  const closeApp = useCallback((id: AppId) => {
    playUiSound('close');
    setWindows((current) => ({ ...current, [id]: { ...current[id], closing: true } }));
    window.setTimeout(() => setWindows((current) => current[id].closing
      ? { ...current, [id]: { ...current[id], open: false, minimized: false, closing: false } }
      : current), 170);
  }, [playUiSound]);
  const minimizeApp = useCallback((id: AppId) => {
    playUiSound('close');
    setWindows((current) => ({ ...current, [id]: { ...current[id], minimized: true } }));
  }, [playUiSound]);
  const launchGame = (selected: Game) => {
    playUiSound('launch');
    setGame(selected);
    setConfigureGame(null);
    if (preferences.fullscreen) {
      document.documentElement.requestFullscreen?.().catch(() => showToast('Fullscreen was not permitted by this browser.'));
    }
  };
  const closeGame = () => {
    playUiSound('close');
    setGame(null);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
  };
  const launchFrom = (selected: Game, appId: AppId) => {
    setGameReturnApp(appId);
    launchGame(selected);
  };
  const patchPreferences = (patch: Partial<Preferences>) => setPreferences((current) => ({ ...current, ...patch }));
  const onDragStart = (id: AppId, event: ReactPointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    const rect = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { id, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
    raiseApp(id);
    event.preventDefault();
  };
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const width = window.innerWidth;
      const height = window.innerHeight;
      setWindows((current) => ({
        ...current,
        [drag.id]: { ...current[drag.id], x: Math.max(0, Math.min(width - 210, event.clientX - drag.offsetX)), y: Math.max(34, Math.min(height - 120, event.clientY - drag.offsetY)) },
      }));
    };
    const up = () => { dragRef.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && game) closeGame();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [game]);

  const categories = useMemo(() => ['All games', ...new Set(games.map((item) => item.category))], [games]);
  const visibleGames = games.filter((item) =>
    item.title.toLowerCase().includes(archiveQuery.toLowerCase()) &&
    (archiveCategory === 'All games' || item.category === archiveCategory),
  );
  const saveUrl = (gameId: string) => {
    const candidate = urlDraft.trim();
    try {
      const parsed = new URL(candidate);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported protocol');
      const priorFileUrl = sources[gameId]?.fileUrl;
      if (priorFileUrl) {
        URL.revokeObjectURL(priorFileUrl);
        objectUrls.current.delete(priorFileUrl);
      }
      setSources((current) => {
        return { ...current, [gameId]: { url: parsed.href } };
      });
      setConfigureGame(null);
      setUrlDraft('');
      showToast('Game source saved on this device.');
    } catch {
      showToast('Enter a complete https:// or http:// game URL.');
    }
  };
  const addFile = (gameId: string, file?: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.html') && file.type !== 'text/html') {
      showToast('Choose a self-contained browser game HTML file.');
      return;
    }
    const previousFileUrl = sources[gameId]?.fileUrl;
    if (previousFileUrl) {
      URL.revokeObjectURL(previousFileUrl);
      objectUrls.current.delete(previousFileUrl);
    }
    const fileUrl = URL.createObjectURL(file);
    objectUrls.current.add(fileUrl);
    setSources((current) => {
      return { ...current, [gameId]: { fileUrl, fileName: file.name } };
    });
    setConfigureGame(null);
    showToast('Local game file ready for this session.');
  };
  const sourceFor = (selected: Game) => sources[selected.id];
  const launchDock = (id: AppId) => {
    if (windows[id].open && !windows[id].minimized) setWindows((current) => ({ ...current, [id]: { ...current[id], minimized: true } }));
    else openApp(id);
  };

  const appClass = `desktop ${preferences.theme === 'extra-dark' ? 'extra-dark' : ''} ${!preferences.animateBackground || (preferences.pauseInactive && isInactive) ? 'motion-off' : ''} ${preferences.lowPower ? 'low-power' : ''} ${preferences.reduceEffects ? 'no-blur' : ''} ${preferences.reduceMotion ? 'reduce-motion' : ''} ${preferences.background === 'graphite' ? 'bg-graphite' : preferences.background === 'tidal' ? 'bg-tidal' : ''}`;
  const windowStyle = (id: AppId): CSSProperties => ({
    zIndex: windows[id].z,
    ...(windows[id].x !== undefined ? { left: windows[id].x, top: windows[id].y, transform: 'none' } : {}),
    ['--glass' as string]: preferences.transparency / 100,
    ...(preferences.reduceEffects ? { backdropFilter: 'none', WebkitBackdropFilter: 'none' } : {}),
  });
  const windowOpen = (id: AppId) => windows[id].open && !windows[id].minimized;
  const currentGameSource = game ? sourceFor(game) : undefined;
  const currentGameUrl = currentGameSource?.fileUrl || currentGameSource?.url || game?.builtInUrl;
  const openExternalGame = (url: string) => window.open(url, '_blank', 'noopener,noreferrer');

  return (
    <main className={appClass} style={{ ['--glass' as string]: preferences.transparency / 100 }} data-testid="desktop">
      {preferences.showStatus && <header className="statusbar" data-testid="status-bar">
        <div className="status-left">
          <div className="brand-mark"><span className="brand-glyph" /> NIGHTSHIFT</div>
          <span className="status-detail">DESKTOP 01</span>
        </div>
        <div className="status-right">
          <span className="status-detail">FOCUS MODE</span>
          <span>{formatDate(now)}</span>
          <time className="clock" data-testid="desktop-clock">{clockLabel}</time>
        </div>
      </header>}
      <div className="desk-label"><small>YOUR NIGHT, YOUR LIBRARY</small><strong>Stay in the game.</strong></div>

      {windowOpen('steam') && <section
        className={`window steam-window ${windows.steam.closing ? 'closing' : ''}`}
        style={windowStyle('steam')} onPointerDown={() => raiseApp('steam')} data-testid="steam-window" aria-label="Steam library window"
      >
        <WindowHeader title="Steam Library" onClose={() => closeApp('steam')} onMinimize={() => minimizeApp('steam')} onPointerDown={(event) => onDragStart('steam', event)} />
        <div className="window-body app-content">
          <div className="eyebrow">Your collection · 02 titles</div>
          <div className="section-heading"><div><h1>Ready when you are.</h1><p>Choose a title to open its game space.</p></div></div>
          <div className="game-grid">
            {games.filter((item) => item.id === 'bad-parenting' || item.id === 'bendy').map((item) => <GameCard key={item.id} game={item} source={sources[item.id]} onPlay={() => launchFrom(item, 'steam')} />)}
          </div>
          <div className="status-detail" style={{ marginTop: 17 }}>External games need a browser-ready source. Configure one from the unavailable screen.</div>
        </div>
      </section>}

      {windowOpen('archive') && <section
        className={`window archive-window ${windows.archive.closing ? 'closing' : ''}`}
        style={windowStyle('archive')} onPointerDown={() => raiseApp('archive')} data-testid="archive-window" aria-label="Games Archive window"
      >
        <WindowHeader title="Games Archive" onClose={() => closeApp('archive')} onMinimize={() => minimizeApp('archive')} onPointerDown={(event) => onDragStart('archive', event)} />
        <div className="window-body app-content">
          <div className="eyebrow">A shelf for the next session</div>
          <div className="section-heading"><div><h1>Games Archive</h1><p>Keep every favorite within reach.</p></div><button className="secondary-button" data-testid="add-game" onClick={() => setAddingGame((value) => !value)}>{addingGame ? 'Cancel' : '＋ Add title'}</button></div>
          {addingGame && <form className="archive-tools" onSubmit={(event) => {
            event.preventDefault();
            const title = newGameTitle.trim();
            if (!title) return;
            const id = `custom-${Date.now()}`;
            setCustomGames((existing) => [...existing, { id, title, category: newGameCategory, subtitle: 'Added to your archive', cover: 'custom' }]);
            setNewGameTitle(''); setAddingGame(false); showToast('Title added to Games Archive.');
          }}>
            <input aria-label="New game title" className="archive-input" value={newGameTitle} onChange={(event) => setNewGameTitle(event.target.value)} placeholder="Game title" data-testid="new-game-title" />
            <select aria-label="Game category" className="filter-select" value={newGameCategory} onChange={(event) => setNewGameCategory(event.target.value)} data-testid="new-game-category"><option>Indie</option><option>Adventure</option><option>Sports</option><option>Horror</option><option>Action</option></select>
            <button className="primary-button" type="submit" data-testid="save-new-game">Add</button>
          </form>}
          <div className="archive-tools">
            <label className="search-wrap"><Search size={14} aria-hidden="true" /><input value={archiveQuery} onChange={(event) => setArchiveQuery(event.target.value)} placeholder="Search your library" aria-label="Search games" data-testid="archive-search" /></label>
            <select className="filter-select" value={archiveCategory} onChange={(event) => setArchiveCategory(event.target.value)} aria-label="Filter by category" data-testid="archive-filter">
              {categories.map((category) => <option key={category}>{category}</option>)}
            </select>
          </div>
          {visibleGames.length ? <div className="archive-grid">{visibleGames.map((item) => <GameCard key={item.id} game={item} source={sources[item.id]} compact onPlay={() => launchFrom(item, 'archive')} />)}</div>
            : <div className="empty-state">No titles match that search. Try another name or category.</div>}
        </div>
      </section>}

      {windowOpen('settings') && <section
        className={`window settings-window ${windows.settings.closing ? 'closing' : ''}`}
        style={windowStyle('settings')} onPointerDown={() => raiseApp('settings')} data-testid="settings-window" aria-label="Settings window"
      >
        <WindowHeader title="System Settings" onClose={() => closeApp('settings')} onMinimize={() => minimizeApp('settings')} onPointerDown={(event) => onDragStart('settings', event)} />
        <SettingsContent active={activeSettings} setActive={setActiveSettings} preferences={preferences} patch={patchPreferences} games={games} sources={sources} onConfigure={(id) => { setConfigureGame(id); setUrlDraft(sources[id]?.url || ''); }} configuration={configureGame} urlDraft={urlDraft} setUrlDraft={setUrlDraft} onSaveUrl={saveUrl} />
      </section>}

      {game && <section className="game-window" aria-label={`${game.title} game view`} data-testid="game-window">
        <div className="game-toolbar">
          <div className="traffic"><button aria-label="Close game and return to desktop" onClick={closeGame} data-testid="game-close" /></div>
          <span className="game-toolbar-title">{game.title}</span>
          <div className="game-actions">
            <button className="icon-button" onClick={() => {
              if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => showToast('Fullscreen is unavailable in this browser.'));
              else document.exitFullscreen?.().catch(() => undefined);
            }} aria-label="Toggle fullscreen" data-testid="game-fullscreen"><Maximize2 size={13} /> Fullscreen</button>
            <button className="icon-button" onClick={() => { closeGame(); openApp(gameReturnApp); }} data-testid="return-to-library">Library</button>
          </div>
        </div>
        <div className="game-viewport">
          {currentGameUrl ? <>
            <iframe
              className="game-frame"
              title={`${game.title} configured browser game`}
              src={currentGameUrl}
              sandbox="allow-scripts allow-forms allow-pointer-lock allow-downloads"
              allow={preferences.audioDefault ? 'fullscreen; autoplay; gamepad' : 'fullscreen; gamepad'}
              allowFullScreen
              style={{ objectFit: preferences.stretch ? 'fill' : 'contain' }}
              data-testid="configured-game-frame"
            />
            {currentGameSource.url && <a className="icon-button game-source-link" href={currentGameSource.url} target="_blank" rel="noopener noreferrer" data-testid="open-configured-source">Open source <ExternalLink size={12} /></a>}
            <div className="game-toolbar-title" style={{ top: 40, zIndex: 2, left: 'auto', right: 12, transform: 'none', pointerEvents: 'none', fontSize: 9 }}>
              {currentGameSource?.fileName ? `LOCAL FILE · ${currentGameSource.fileName}` : game.builtInUrl ? 'INCLUDED GAME WRAPPER · EXTERNAL ASSETS REQUIRED' : 'USER-CONFIGURED SOURCE · EMBEDDING MAY BE RESTRICTED'}
            </div>
          </> : game.externalLaunchUrl ? <div className="game-unavailable">
            <div className="unavailable-symbol"><Gamepad2 size={24} /></div>
            <div className="eyebrow">Licensed browser version</div>
            <h2>{game.title}</h2>
            <p>The licensed web release is hosted by Poki, whose page does not allow this game to be embedded in Nightshift. Open the official playable version in a separate tab, or configure another authorized source you can embed.</p>
            <div className="unavailable-actions">
              <a className="primary-button" href={game.externalLaunchUrl} target="_blank" rel="noopener noreferrer" data-testid="open-official-game">Play on Poki <ExternalLink size={13} /></a>
              <button className="secondary-button" onClick={() => { setConfigureGame(game.id); setUrlDraft(''); }} data-testid="configure-game-url">Configure a game URL</button>
              <label className="secondary-button" htmlFor={`game-file-${game.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}><Upload size={13} /> Choose HTML file</label>
              <input id={`game-file-${game.id}`} className="file-input" type="file" accept=".html,text/html" onChange={(event) => { addFile(game.id, event.target.files?.[0]); event.currentTarget.value = ''; }} data-testid="game-file-input" />
            </div>
            {configureGame === game.id && <form className="url-form" onSubmit={(event) => { event.preventDefault(); saveUrl(game.id); }}>
              <input type="url" value={urlDraft} onChange={(event) => setUrlDraft(event.target.value)} placeholder="https://your-authorized-game.example" aria-label="Authorized browser game URL" autoFocus data-testid="game-url-input" />
              <button type="submit" className="primary-button" data-testid="save-game-url">Save</button>
            </form>}
          </div> : <div className="game-unavailable">
            <div className="unavailable-symbol"><Gamepad2 size={24} /></div>
            <div className="eyebrow">No verified browser build configured</div>
            <h2>{game.title}</h2>
            <p>This library entry is ready, but Nightshift has no verified playable source for it. Add an authorized browser URL or a game HTML file you have the rights to use. Nothing is being simulated here.</p>
            <div className="unavailable-actions">
              <button className="primary-button" onClick={() => { setConfigureGame(game.id); setUrlDraft(''); }} data-testid="configure-game-url">Configure a game URL</button>
              <label className="secondary-button" htmlFor={`game-file-${game.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}><Upload size={13} /> Choose HTML file</label>
              <input id={`game-file-${game.id}`} className="file-input" type="file" accept=".html,text/html" onChange={(event) => { addFile(game.id, event.target.files?.[0]); event.currentTarget.value = ''; }} data-testid="game-file-input" />
            </div>
            {configureGame === game.id && <form className="url-form" onSubmit={(event) => { event.preventDefault(); saveUrl(game.id); }}>
              <input type="url" value={urlDraft} onChange={(event) => setUrlDraft(event.target.value)} placeholder="https://your-authorized-game.example" aria-label="Authorized browser game URL" autoFocus data-testid="game-url-input" />
              <button type="submit" className="primary-button" data-testid="save-game-url">Save</button>
            </form>}
            {currentGameSource?.fileUrl && <p style={{ marginBottom: 0 }}>Local file loaded: {currentGameSource.fileName}. It is available until this tab closes.</p>}
          </div>}
        </div>
      </section>}

      <div className={`dock-wrap ${!preferences.showDock && !dockEdgeActive ? 'dock-hidden' : ''}`} data-testid="desktop-dock" style={{ ['--dock-size' as string]: `${preferences.dockSize}px` }}>
        <nav className="dock" aria-label="Application Dock">
          <DockButton label="Steam" active={windows.steam.open && !windows.steam.minimized} animate={preferences.dockAnimation} onClick={() => launchDock('steam')} data-testid="dock-steam"><SteamGlyph /></DockButton>
          <DockButton label="Games Archive" active={windows.archive.open && !windows.archive.minimized} animate={preferences.dockAnimation} onClick={() => launchDock('archive')} data-testid="dock-archive"><Archive size={25} strokeWidth={1.8} /></DockButton>
          <span className="dock-divider" />
          <DockButton label="Settings" active={windows.settings.open && !windows.settings.minimized} animate={preferences.dockAnimation} onClick={() => launchDock('settings')} data-testid="dock-settings"><SettingsIcon size={26} strokeWidth={1.7} /></DockButton>
        </nav>
      </div>
      {toast && <div className="toast-message" role="status" data-testid="desktop-toast">{toast}</div>}
    </main>
  );
}

function WindowHeader({ title, onClose, onMinimize, onPointerDown }: { title: string; onClose: () => void; onMinimize: () => void; onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void }) {
  const testId = title.toLowerCase().replaceAll(' ', '-');
  return <header className="window-header" onPointerDown={onPointerDown} data-testid={`window-drag-handle-${testId}`}>
    <div className="traffic">
      <button aria-label={`Close ${title}`} onClick={onClose} data-testid={`window-close-${testId}`} />
      <button className="minimize" aria-label={`Minimize ${title}`} onClick={onMinimize} data-testid={`window-minimize-${testId}`} />
    </div>
    <span className="window-title">{title}</span>
  </header>;
}

function GameCard({ game, source, onPlay, compact = false }: { game: Game; source?: Source; onPlay: () => void; compact?: boolean }) {
  const coverClass = game.cover === 'custom' ? 'cover-retro' : `cover-${game.cover}`;
  return <article className="game-card" data-testid={`game-card-${game.id}`}>
    <div className={`cover ${coverClass}`}>
      {game.cover === 'parenting' && <span className="cover-ghost" />}
      {game.cover === 'ink' && <span className="cover-orbit" />}
      <div><span className="cover-kicker">{game.category} · NIGHTSHIFT LIBRARY</span><div className="cover-name">{game.title}</div></div>
    </div>
    <div className="game-info"><div><h3>{game.title}</h3><p>{source?.url || source?.fileUrl ? 'Source configured' : game.builtInUrl ? 'Included HTML game · internet required' : game.subtitle}</p></div>
      <button className="play-button" onClick={onPlay} data-testid={`play-${game.id}`}>PLAY</button>
    </div>
    {compact && game.cover === 'custom' && null}
  </article>;
}

function DockButton({ label, active, animate, onClick, children, ...props }: { label: string; active: boolean; animate: boolean; onClick: () => void; children: ReactNode; 'data-testid': string }) {
  return <button type="button" className={`dock-button ${animate ? '' : 'no-dock-animation'}`} onClick={onClick} aria-label={`Open ${label}`} data-testid={props['data-testid']}>
    <span className="dock-label">{label}</span>{children}{active && <span className="dock-dot" />}
  </button>;
}

function SteamGlyph() {
  return <svg viewBox="0 0 32 32" aria-hidden="true" fill="none">
    <circle cx="20.7" cy="10.1" r="6.4" stroke="#e4ecec" strokeWidth="1.65" />
    <circle cx="20.7" cy="10.1" r="2.55" stroke="#91dfca" strokeWidth="1.5" />
    <circle cx="9.1" cy="22.1" r="4.3" stroke="#e4ecec" strokeWidth="1.65" />
    <path d="m12.9 20.2 4.4-2.9M6 20.6l-2.7-1.3" stroke="#91dfca" strokeWidth="1.7" strokeLinecap="round" />
  </svg>;
}

function SettingsContent({ active, setActive, preferences, patch, games, sources, onConfigure, configuration, urlDraft, setUrlDraft, onSaveUrl }: {
  active: string; setActive: (value: string) => void; preferences: Preferences; patch: (value: Partial<Preferences>) => void;
  games: Game[]; sources: Record<string, Source>; onConfigure: (id: string) => void; configuration: string | null;
  urlDraft: string; setUrlDraft: (value: string) => void; onSaveUrl: (id: string) => void;
}) {
  const sections = ['Appearance', 'Desktop', 'Gaming', 'Performance'];
  const setting = (title: string, detail: string, key: keyof Preferences) => (
    <div className="setting-row" key={key}>
      <div className="setting-copy"><strong>{title}</strong><small>{detail}</small></div>
      <button type="button" role="switch" aria-checked={Boolean(preferences[key])} className={`switch ${preferences[key] ? 'on' : ''}`} onClick={() => patch({ [key]: !preferences[key] } as Partial<Preferences>)} aria-label={title} data-testid={`setting-${key}`} />
    </div>
  );
  return <div className="settings-layout">
    <aside className="settings-sidebar"><div className="settings-brand">Nightshift</div><nav className="settings-nav" aria-label="Settings sections">
      {sections.map((section) => <button key={section} className={active === section ? 'active' : ''} onClick={() => setActive(section)} data-testid={`settings-tab-${section.toLowerCase()}`}>{section}</button>)}
    </nav></aside>
    <div className="settings-panel">
      <div className="eyebrow">System preferences</div><h2>{active}</h2><p className="settings-intro">A desktop that fits the way you play.</p>
      {active === 'Appearance' && <>
        <div className="setting-row"><div className="setting-copy"><strong>Desktop tone</strong><small>Choose the depth of the night.</small></div>
          <select className="select-setting" value={preferences.theme} onChange={(event) => patch({ theme: event.target.value as Preferences['theme'] })} data-testid="setting-theme"><option value="dark">Dark</option><option value="extra-dark">Extra dark</option></select></div>
        <div className="setting-row"><div className="setting-copy"><strong>Background field</strong><small>Subtle color atmosphere behind your windows.</small></div>
          <select className="select-setting" value={preferences.background} onChange={(event) => patch({ background: event.target.value as Preferences['background'] })} data-testid="setting-background"><option value="deep-current">Deep current</option><option value="graphite">Soft graphite</option><option value="tidal">Tidal glass</option></select></div>
        {setting('Animate background', 'Slow, restrained movement.', 'animateBackground')}
        <div className="setting-row"><div className="setting-copy"><strong>Window transparency</strong><small>{preferences.transparency}% glass opacity.</small></div><input className="range-setting" type="range" min="55" max="96" value={preferences.transparency} onChange={(event) => patch({ transparency: Number(event.target.value) })} aria-label="Window transparency" data-testid="setting-transparency" /></div>
      </>}
      {active === 'Desktop' && <>
        {setting('Show status bar', 'Clock, date and desktop status.', 'showStatus')}
        {setting('Show Dock', 'Keep your app launcher at the bottom.', 'showDock')}
        <div className="setting-row"><div className="setting-copy"><strong>Dock icon size</strong><small>{preferences.dockSize}px</small></div><input className="range-setting" type="range" min="42" max="64" value={preferences.dockSize} onChange={(event) => patch({ dockSize: Number(event.target.value) })} aria-label="Dock icon size" data-testid="setting-dockSize" /></div>
        {setting('Dock hover animation', 'Lift icons as you move across the Dock.', 'dockAnimation')}
      </>}
      {active === 'Gaming' && <>
        {setting('Request fullscreen on launch', 'Browsers may require a direct user gesture.', 'fullscreen')}
        {setting('Stretch game to fill', 'Allow the configured game to ignore its native ratio.', 'stretch')}
        {setting('Interface sounds', 'Play a quiet tone when apps or games open and close.', 'interfaceSounds')}
        {setting('Game audio enabled by default', 'Allow autoplay for game audio when supported by the browser.', 'audioDefault')}
        {setting('Remember last application', 'Restore the last opened app on this device.', 'rememberApp')}
        <div className="setting-row"><div className="setting-copy"><strong>Game sources</strong><small>Configure an authorized URL for any library entry.</small></div></div>
        {games.map((item) => <div key={item.id}>
          <div className="setting-row"><div className="setting-copy"><strong>{item.title}</strong><small>{sources[item.id]?.url ? 'URL saved on this device' : sources[item.id]?.fileUrl ? 'Local file loaded for this tab' : item.externalLaunchUrl ? 'Licensed browser version hosted on Poki' : 'No source configured'}</small></div><button className="secondary-button" onClick={() => onConfigure(item.id)} data-testid={`configure-${item.id}`}>{configuration === item.id ? 'Editing' : 'Set URL'}</button></div>
          {configuration === item.id && <form className="url-form" onSubmit={(event) => { event.preventDefault(); onSaveUrl(item.id); }}>
            <input type="url" value={urlDraft} onChange={(event) => setUrlDraft(event.target.value)} placeholder="https://your-authorized-game.example" aria-label={`Authorized URL for ${item.title}`} data-testid={`settings-url-${item.id}`} />
            <button className="primary-button" type="submit" data-testid={`settings-save-url-${item.id}`}>Save URL</button>
          </form>}
        </div>)}
      </>}
      {active === 'Performance' && <>
        {setting('Low-power mode', 'Stops background movement and dials back effects.', 'lowPower')}
        {setting('Reduce background effects', 'Disable backdrop blur in app windows.', 'reduceEffects')}
        {setting('Reduce motion', 'Use restrained transitions throughout the desktop.', 'reduceMotion')}
        {setting('Pause when tab is inactive', 'Stop background movement while this page is hidden.', 'pauseInactive')}
        <div className="setting-row"><div className="setting-copy"><strong>Local storage</strong><small>Preferences and URL sources stay in this browser only.</small></div><span className="settings-saved">SAVED AUTOMATICALLY</span></div>
      </>}
    </div>
  </div>;
}

export default App;
