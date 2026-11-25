/**
 * dsh-vsing — 工作台前端（浏览器侧，零构建 ESM）。
 *
 * 两个入口，和 DSH 自己的 Plugins 页同一套机制：
 *   1. `sidebar.panellist` —— 左侧栏一行，渲染图标；
 *   2. `main`（keyed，key='dsh-vsing'）—— 主工作区整页，也就是工作台本体。
 *
 * 工作台分四区：顶栏（工程 / 节拍 / 导出）、左侧工具栏、中央工作区、底部状态条。
 * 每个工具只做它已经真的能做的事；做不到的写「未接」，不画假界面。
 */

const NS = 'dsh-vsing';

const DICT = {
  zh: {
    panel: '虚拟歌姬',
    workbench: '虚拟歌姬工作台',
    newProject: '新建工程',
    untitled: '未命名工程',
    bpm: '节拍',
    saving: '保存中…',
    saved: '已记盘',
    tools: '工具',
    toolLyrics: '歌词轴',
    toolNotes: '音符',
    toolVoice: '音源',
    toolHost: 'OpenUtau 宿主',
    toolPalette: '配色',
    toolMv: 'MV',
    toolExport: '导出',
    statusReady: '可用',
    statusPartial: '部分',
    statusMissing: '未接',
    emptyTitle: '还没有工程',
    emptyBody: '歌词、音符和导出都从一个工程开始。先用一句词开一个。',
    lyricInput: '把歌词贴进来，一行一句',
    importLyrics: '导入歌词',
    clear: '清空',
    lines: '句',
    chars: '字',
    estimated: '按句均分（估算）',
    measured: '已对齐',
    notesHint: '音符草稿：全部落在 C4，按字切分。接上对齐器后才会跟着唱腔走。',
    styleSquare: '方波',
    styleLegato: '连音',
    rebuild: '重排音符',
    voiceHint: '四个音源槽位。声库归属、授权与采样都要逐个审，插件里不预置任何声源。',
    voiceSlot: '槽位',
    voiceEmpty: '未配置',
    voiceNeed: '需要 DiffSinger 或 UTAU 声库目录',
    hostTitle: 'OpenUtau 宿主',
    hostBridge: 'DAW 桥',
    hostBridgeOn: '已连接',
    hostBridgeOff: '未连接',
    hostBridgeHint: '桥进程负责把 OpenUtau 的渲染结果交给工作台；没连上时，宿主区只是占位。',
    hostEmbed: '原生窗口嵌入位',
    hostEmbedHint: '这里将承载 OpenUtau 窗口本体（SetParent 方案，仅桌面版）。原型未落地前不画假画面。',
    hostAttach: '嵌入窗口',
    hostDetach: '脱开',
    hostLaunch: '启动 OpenUtau',
    hostLaunched: '已拉起 OpenUtau，等它窗口出来再点「嵌入窗口」。',
    hostIdle: '未嵌入',
    hostEmbedded: '已嵌入',
    hostFailed: '嵌入失败',
    hostNoInstall: '没找到 OpenUtau 安装目录。',
    hostEmbedHintShort: '窗口尺寸变了会跟着走；原生窗口始终盖在网页上层。',
    hostDetect: '重新检测',
    hostVersion: '安装位置',
    hostInstalls: '找到的 OpenUtau',
    hostNone: '没检测到 OpenUtau 安装',
    hostPortable: '便携',
    hostData: '数据目录',
    hostDaw: 'DAW 桥',
    hostYes: '有',
    hostNo: '无',
    paletteTitle: '配色',
    paletteHint: '从伴奏或封面提色，导出一张可直接给 MV 用的色板。',
    paletteMissing: '提色器未接：需要 colorthief + culori（OKLCH 化）两个依赖。',
    paletteEmpty: '还没有色板',
    mvTitle: 'MV',
    mvHint: '帧 = f(t) 的纯函数配方。渲染器（Playwright + ffmpeg）还没接进来。',
    mvRecipe: '配方',
    mvMissing: '未接：渲染器与模板库都没落地。',
    exportTitle: '导出',
    exportHint: '只导出已经能保证格式正确的东西。',
    exportLrc: '导出 LRC',
    exportUstx: '导出 USTX',
    exported: '已导出',
    exportWarn: 'USTX 未在 OpenUtau 里打开验证过；UST 不导出（Shift-JIS 未处理）。',
    statusChars: '字',
    statusNotes: '音符',
    statusAlign: '对齐',
    loadError: '读取失败',
    noProject: '无工程',
  },
  en: {
    panel: 'Virtual singer',
    workbench: 'Virtual singer workbench',
    newProject: 'New project',
    untitled: 'Untitled',
    bpm: 'BPM',
    saving: 'Saving…',
    saved: 'Saved',
    tools: 'Tools',
    toolLyrics: 'Lyrics',
    toolNotes: 'Notes',
    toolVoice: 'Voices',
    toolHost: 'OpenUtau host',
    toolPalette: 'Palette',
    toolMv: 'MV',
    toolExport: 'Export',
    statusReady: 'ready',
    statusPartial: 'partial',
    statusMissing: 'missing',
    emptyTitle: 'No project yet',
    emptyBody: 'Lyrics, notes and export all start from one project. Start with a single line.',
    lyricInput: 'Paste lyrics, one line per phrase',
    importLyrics: 'Import lyrics',
    clear: 'Clear',
    lines: 'lines',
    chars: 'chars',
    estimated: 'even split (estimated)',
    measured: 'aligned',
    notesHint: 'Note draft: every note on C4, one per character. Real singing needs the aligner.',
    styleSquare: 'Square',
    styleLegato: 'Legato',
    rebuild: 'Rebuild notes',
    voiceHint: 'Four voice slots. Licensing and sampling must be reviewed per library; nothing is bundled.',
    voiceSlot: 'Slot',
    voiceEmpty: 'empty',
    voiceNeed: 'Needs a DiffSinger or UTAU voicebank folder',
    hostTitle: 'OpenUtau host',
    hostBridge: 'DAW bridge',
    hostBridgeOn: 'connected',
    hostBridgeOff: 'not connected',
    hostBridgeHint: 'The bridge hands rendered audio back to the workbench. Without it this area is a placeholder.',
    hostEmbed: 'Native window seat',
    hostEmbedHint: 'The OpenUtau window itself will be reparented here (desktop only). No fake picture before the prototype lands.',
    hostAttach: 'Embed window',
    hostDetach: 'Detach',
    hostLaunch: 'Launch OpenUtau',
    hostLaunched: 'OpenUtau is starting; click “Embed window” once its window appears.',
    hostIdle: 'not embedded',
    hostEmbedded: 'embedded',
    hostFailed: 'embed failed',
    hostNoInstall: 'No OpenUtau install found.',
    hostEmbedHintShort: 'Follows the seat on resize; the native window always paints above the page.',
    hostDetect: 'Check again',
    hostVersion: 'install',
    hostInstalls: 'OpenUtau found',
    hostNone: 'No OpenUtau install detected',
    hostPortable: 'portable',
    hostData: 'data dir',
    hostDaw: 'DAW API',
    hostYes: 'yes',
    hostNo: 'no',
    paletteTitle: 'Palette',
    paletteHint: 'Extract colors from the backing track or cover, then hand a palette to the MV.',
    paletteMissing: 'Extractor missing: needs colorthief + culori (OKLCH).',
    paletteEmpty: 'No palette yet',
    mvTitle: 'MV',
    mvHint: 'Frame = pure f(t) recipe. The renderer (Playwright + ffmpeg) is not wired in.',
    mvRecipe: 'Recipe',
    mvMissing: 'Missing: renderer and template library.',
    exportTitle: 'Export',
    exportHint: 'Only formats we can actually guarantee.',
    exportLrc: 'Export LRC',
    exportUstx: 'Export USTX',
    exported: 'Exported',
    exportWarn: 'USTX has not been opened in OpenUtau yet; UST is not exported (Shift-JIS pending).',
    statusChars: 'chars',
    statusNotes: 'notes',
    statusAlign: 'align',
    loadError: 'Load failed',
    noProject: 'no project',
  },
};

window.__ModuleLoader__.load({
  id: 'dsh-vsing',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useMemo, useRef, useState } = React;

    /* ------------------------------ 小工具 ------------------------------ */

    /** 扁平化子节点：数组直接展开，null/false 丢弃——省掉一堆条件括号。 */
    function kids(list) {
      const out = [];
      for (const item of list) {
        if (item === null || item === undefined || item === false) continue;
        if (Array.isArray(item)) out.push(...kids(item));
        else out.push(item);
      }
      return out;
    }
    const box = (style, ...children) => h('div', { style }, ...kids(children));
    const text = (style, value) => h('div', { style }, value);

    async function call(path, init) {
      const res = await fetch('/dsh-vsing/api' + path, {
        headers: { 'content-type': 'application/json' },
        ...init,
      });
      const raw = await res.text();
      let body = null;
      try { body = raw ? JSON.parse(raw) : null; } catch { body = { raw }; }
      if (!res.ok) throw new Error((body && (body.detail || body.error)) || res.statusText);
      return body;
    }

    const notesOf = (project) => {
      const tracks = (project && project.notes && project.notes.tracks) || [];
      return (tracks[0] && tracks[0].notes) || [];
    };
    const colorsOf = (project) => {
      const roles = (project && project.palette && project.palette.roles) || {};
      return Object.values(roles).filter((value) => typeof value === 'string');
    };

    /* ------------------------------- 样式 ------------------------------- */

    const muted = { color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, lineHeight: 1.65 };
    const mono = { fontFamily: 'var(--dsw-font-mono, ui-monospace, monospace)' };
    const card = {
      border: '1px solid var(--dsw-alias-border-l2)',
      borderRadius: 'var(--dsw-radius-lg)',
      background: 'var(--dsw-alias-bg-layer-2)',
      padding: 16,
    };
    const stack = { display: 'grid', gap: 14 };
    const button = (primary) => ({
      appearance: 'none',
      border: '1px solid var(--dsw-alias-border-l3)',
      background: primary ? 'var(--dsw-alias-state-business-primary)' : 'transparent',
      color: primary ? '#fff' : 'var(--dsw-alias-label-primary)',
      borderRadius: 'var(--dsw-radius-md)',
      padding: '6px 12px',
      fontSize: 13,
      cursor: 'pointer',
    });
    const chip = (state) => ({
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '1px 7px', borderRadius: 999, fontSize: 11, lineHeight: '17px',
      border: '1px solid var(--dsw-alias-border-l3)',
      whiteSpace: 'nowrap',
      color: state === 'ready'
        ? 'var(--dsw-alias-state-success-primary)'
        : state === 'partial'
          ? 'var(--dsw-alias-state-warn-primary)'
          : 'var(--dsw-alias-label-tertiary)',
    });
    const dot = (state) => ({
      width: 6, height: 6, borderRadius: 999,
      background: state === 'ready'
        ? 'var(--dsw-alias-state-success-primary)'
        : state === 'partial'
          ? 'var(--dsw-alias-state-warn-primary)'
          : 'var(--dsw-alias-border-l4)',
    });

    const stateOf = (state) => (state === 'ready' ? 'statusReady' : state === 'partial' ? 'statusPartial' : 'statusMissing');

    /* ------------------------------ 组件 ------------------------------- */

    const TOOLS = [
      { id: 'lyrics', icon: '¶', label: 'toolLyrics', state: 'ready' },
      { id: 'notes', icon: '♪', label: 'toolNotes', state: 'partial' },
      { id: 'voice', icon: '◉', label: 'toolVoice', state: 'missing' },
      { id: 'host', icon: '⌗', label: 'toolHost', state: 'partial' },
      { id: 'palette', icon: '◐', label: 'toolPalette', state: 'missing' },
      { id: 'mv', icon: '▤', label: 'toolMv', state: 'missing' },
      { id: 'export', icon: '⤓', label: 'toolExport', state: 'ready' },
    ];

    /** 音符条：方块，不是波形。没有音高数据就不假装有。 */
    function NoteStrip({ notes, colors }) {
      const span = notes.reduce((max, note) => Math.max(max, note.position + note.duration), 0) || 1;
      const blocks = notes.slice(0, 240).map((note, index) => h('div', {
        key: index,
        title: `${note.lyric} · tone ${note.tone}`,
        style: {
          position: 'absolute',
          left: `${(note.position / span) * 100}%`,
          width: `calc(${(note.duration / span) * 100}% - 1px)`,
          top: 20,
          height: 56,
          borderRadius: 4,
          background: colors[index % colors.length] || 'var(--dsw-alias-state-business-primary)',
          opacity: 0.85,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, color: '#fff', overflow: 'hidden',
        },
      }, note.lyric));
      return box({
        position: 'relative', height: 96, marginTop: 12,
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 'var(--dsw-radius-md)',
        background: 'repeating-linear-gradient(90deg, transparent 0 39px, var(--dsw-alias-border-l1) 39px 40px)',
        overflow: 'hidden',
      }, blocks);
    }

    function LyricsPane({ t, project, busy, onImport, onNotes }) {
      const [draft, setDraft] = useState('');
      const lines = (project && project.lyrics.lines) || [];
      const notes = notesOf(project);
      const charCount = lines.reduce((sum, line) => sum + line.chars.length, 0);
      const aligned = lines.length > 0 && lines.every((line) => line.chars.every((c) => !c.estimated));

      const editor = box({ ...card },
        text({ fontSize: 13, fontWeight: 600, marginBottom: 8 }, t('toolLyrics')),
        h('textarea', {
          value: draft,
          onChange: (event) => setDraft(event.target.value),
          placeholder: t('lyricInput'),
          spellCheck: false,
          style: {
            width: '100%', minHeight: 220, resize: 'vertical',
            background: 'var(--dsw-alias-bg-layer-3)',
            color: 'var(--dsw-alias-label-primary)',
            border: '1px solid var(--dsw-alias-border-l2)',
            borderRadius: 'var(--dsw-radius-md)', padding: 10, fontSize: 13,
            fontFamily: 'inherit', lineHeight: 1.7, boxSizing: 'border-box',
          },
        }),
        box({ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' },
          h('button', {
            style: button(true), disabled: busy || !draft.trim(),
            onClick: () => onImport(draft),
          }, t('importLyrics')),
          h('button', { style: button(false), disabled: busy || !draft, onClick: () => setDraft('') }, t('clear')),
          h('span', { style: muted }, `${lines.length} ${t('lines')} · ${charCount} ${t('chars')}`)));

      const axis = box({ ...card },
        box({ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
          text({ fontSize: 13, fontWeight: 600 }, t('toolNotes')),
          h('span', { style: chip(aligned ? 'ready' : 'partial') }, t(aligned ? 'measured' : 'estimated'))),
        lines.length === 0
          ? text({ ...muted, padding: '32px 0' }, t('emptyBody'))
          : box({ display: 'grid', gap: 6, maxHeight: 280, overflow: 'auto' },
            lines.map((line, index) => box({
              display: 'flex', gap: 8, alignItems: 'baseline',
              padding: '6px 8px', borderRadius: 'var(--dsw-radius-sm)',
              background: index % 2 ? 'var(--dsw-alias-bg-layer-3)' : 'transparent',
            },
            h('span', { style: { ...muted, ...mono, width: 54 } }, `${(line.startMs / 1000).toFixed(2)}s`),
            h('span', { style: { fontSize: 13 } }, line.text || line.chars.map((c) => c.ch).join('')),
            line.chars[0] && line.chars[0].estimated ? h('span', { style: { ...muted, fontSize: 11 } }, '≈') : null))),
        notes.length ? h(NoteStrip, { notes, colors: colorsOf(project) }) : null,
        box({ display: 'flex', gap: 8, marginTop: 12 },
          h('button', { style: button(false), disabled: busy || !project, onClick: () => onNotes('square') }, `${t('styleSquare')} · ${t('rebuild')}`),
          h('button', { style: button(false), disabled: busy || !project, onClick: () => onNotes('legato') }, `${t('styleLegato')} · ${t('rebuild')}`)),
        text({ ...muted, marginTop: 8 }, t('notesHint')));

      return h('div', {
        style: { display: 'grid', gap: 14, gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.15fr)' },
      }, editor, axis);
    }

    function VoicePane({ t }) {
      const slots = [1, 2, 3, 4].map((n) => box({ ...card },
        box({ display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
          text({ fontSize: 13, fontWeight: 600 }, `${t('voiceSlot')} ${n}`),
          h('span', { style: chip('missing') }, t('voiceEmpty'))),
        text({ ...muted, marginTop: 6 }, t('voiceNeed'))));
      return box(stack,
        text(muted, t('voiceHint')),
        h('div', {
          style: { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' },
        }, ...slots));
    }

    /**
     * OpenUtau 宿主页：原生窗口真嵌进来（SetParent），不是截图也不是假框。
     * 席位 div 量出自己的屏幕像素矩形交给 helper；窗口尺寸一变就跟着走。
     * 原生窗口永远盖在网页上层，所以按钮只能放在席位上方的工具栏里。
     */
    // 离开面板就收回去：原生窗口是贴在宿主窗口上的，不主动放回去会一直盖着工作区。
    // 记一份「用户想嵌着」的意图，回到面板时自动再嵌一次。
    let embedWanted = false;

    function HostPane({ t, host, onDetect }) {
      const bridges = (host && host.bridges) || [];
      const installs = (host && host.installs) || [];
      const primary = installs.find((item) => item.dawIntegration) || installs[0] || null;
      const seat = useRef(null);
      const attached = useRef(false);
      const [state, setState] = useState('idle');
      const [note, setNote] = useState(null);

      const rect = () => {
        const node = seat.current;
        if (!node) return null;
        const area = node.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        return {
          x: Math.max(0, Math.round(area.left * dpr)),
          y: Math.max(0, Math.round(area.top * dpr)),
          width: Math.max(80, Math.round(area.width * dpr)),
          height: Math.max(80, Math.round(area.height * dpr)),
        };
      };

      const post = (path, payload) => call(path, {
        method: 'POST',
        body: JSON.stringify(payload || {}),
      });

      const attach = async () => {
        const area = rect();
        if (!area) return;
        setState('attaching');
        setNote(null);
        try {
          await post('/embed/attach', { ...area, process: 'OpenUtau' });
          attached.current = true;
          embedWanted = true;
          setState('attached');
          // 刚 SetParent 完窗口可能还带着旧尺寸，等一帧再按席位量一次，保证贴着席位。
          setTimeout(() => {
            const again = rect();
            if (again && attached.current) void post('/embed/move', again).catch(() => {});
          }, 220);
        } catch (error) {
          attached.current = false;
          embedWanted = false;
          setState('error');
          setNote(error.message);
        }
      };

      const detach = async () => {
        try {
          await post('/embed/detach');
        } catch (error) {
          setNote(error.message);
        }
        attached.current = false;
        embedWanted = false;
        setState('idle');
      };

      // 打开面板时先问一句「现在到底嵌没嵌」，别让状态条和真实情况对不上
      // （外面 attach 过、helper 重启过都会让本地状态漂移）。
      useEffect(() => {
        let alive = true;
        void call('/embed/status').then((status) => {
          if (!alive) return;
          const live = Boolean(status && status.ok && status.bounds && status.helper && status.helper.ready);
          if (live) {
            attached.current = true;
            embedWanted = true;
            setState('attached');
          }
        }).catch(() => {});
        return () => { alive = false; };
      }, []);

      // 卸载（切工具 / 切面板 / 关页面）一律把原生窗口放回去，不让它留在原地挡工作。
      useEffect(() => {
        const releaseNow = () => {
          if (!attached.current) return;
          attached.current = false;
          void post('/embed/release', { process: 'OpenUtau' }).catch(() => {});
        };
        window.addEventListener('beforeunload', releaseNow);
        return () => {
          window.removeEventListener('beforeunload', releaseNow);
          releaseNow();
        };
      }, []);

      // 回到面板时接着嵌（用户上次是嵌着的）。
      useEffect(() => {
        if (!embedWanted) return;
        const timer = setTimeout(() => { void attach(); }, 260);
        return () => clearTimeout(timer);
      }, []);

      const launch = async () => {
        if (!primary || !primary.dir) {
          setNote(t('hostNoInstall'));
          return;
        }
        setNote(null);
        try {
          await post('/embed/launch', { path: `${primary.dir.replace(/[\\/]+$/, '')}\\OpenUtau.exe` });
          setNote(t('hostLaunched'));
        } catch (error) {
          setNote(error.message);
        }
      };

      // 席位尺寸变化 → 让原生窗口跟着走。只在真的嵌上以后才发。
      useEffect(() => {
        let timer = null;
        const sync = () => {
          clearTimeout(timer);
          timer = setTimeout(() => {
            if (!attached.current) return;
            const area = rect();
            if (area) void post('/embed/move', area).catch(() => {});
          }, 120);
        };
        const node = seat.current;
        const observer = new ResizeObserver(sync);
        if (node) observer.observe(node);
        window.addEventListener('resize', sync);
        return () => {
          observer.disconnect();
          window.removeEventListener('resize', sync);
          clearTimeout(timer);
        };
      }, []);

      const chipState = state === 'attached' ? 'ready' : state === 'error' ? 'missing' : 'partial';
      const chipText = state === 'attached'
        ? t('hostEmbedded')
        : state === 'attaching' ? t('saving') : state === 'error' ? t('hostFailed') : t('hostIdle');

      const toolbar = box({
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: '10px 16px', borderBottom: '1px solid var(--dsw-alias-border-l1)',
      },
      text({ fontSize: 13, fontWeight: 600 }, t('hostEmbed')),
      h('span', { style: chip(chipState) }, chipText),
      h('span', { style: { ...muted, ...mono, fontSize: 11 } },
        primary ? `${primary.version || '—'} · ${primary.dir}` : t('hostNone')),
      box({ flex: 1 }),
      h('button', { style: button(false), onClick: () => void launch() }, t('hostLaunch')),
      h('button', { style: button(true), disabled: state === 'attaching', onClick: () => void attach() }, t('hostAttach')),
      h('button', { style: button(false), onClick: () => void detach() }, t('hostDetach')),
      h('button', { style: button(false), onClick: onDetect }, t('hostDetect')));

      const seatBox = h('div', {
        ref: seat,
        style: {
          flex: '1 1 auto', minHeight: 240, position: 'relative', overflow: 'hidden',
          background: 'var(--dsw-alias-bg-layer-2)',
        },
      },
      state === 'attached' ? null : box({
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24, textAlign: 'center',
      },
      text({ fontSize: 15, fontWeight: 600 }, t('hostEmbed')),
      text({ ...muted, maxWidth: 460 }, t('hostEmbedHint')),
      h('button', { style: button(true), disabled: state === 'attaching', onClick: () => void attach() }, t('hostAttach'))));

      const footer = box({
        display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap',
        padding: '8px 16px', borderTop: '1px solid var(--dsw-alias-border-l1)',
      },
      h('span', { style: { ...muted, ...mono, fontSize: 11 } },
        `${t('hostBridge')}: ${bridges.length ? `${bridges.length}` : t('hostBridgeOff')}`),
      note ? h('span', { style: { ...muted, color: 'var(--dsw-alias-state-warn-primary)' } }, note) : null,
      box({ flex: 1 }),
      h('span', { style: { ...muted, fontSize: 11 } }, t('hostEmbedHintShort')));

      return box({ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 },
        toolbar, seatBox, footer);
    }

    function PalettePane({ t, project }) {
      const colors = colorsOf(project);
      const swatches = colors.length === 0
        ? text({ ...muted, padding: '24px 0' }, t('paletteEmpty'))
        : h('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap' } },
          ...colors.map((color, index) => box({ width: 72 },
            h('div', {
              style: {
                height: 56, borderRadius: 8, background: color,
                border: '1px solid var(--dsw-alias-border-l2)',
              },
            }),
            text({ ...muted, ...mono, marginTop: 4, fontSize: 11 }, color))));
      return box(stack,
        text(muted, t('paletteHint')),
        box(card, swatches, text({ ...muted, marginTop: 12 }, t('paletteMissing'))));
    }

    function MvPane({ t }) {
      return box(stack,
        text(muted, t('mvHint')),
        box(card,
          text({ fontSize: 13, fontWeight: 600, marginBottom: 6 }, t('mvRecipe')),
          h('div', {
            style: {
              ...mono, fontSize: 12, color: 'var(--dsw-alias-label-secondary)',
              background: 'var(--dsw-alias-bg-layer-3)', borderRadius: 'var(--dsw-radius-md)', padding: 12,
            },
          }, 'frame(t) → { background, lyricLayer, accents }'),
          text({ ...muted, marginTop: 12 }, t('mvMissing'))));
    }

    function ExportPane({ t, project, busy, onExport, lastExport }) {
      const files = (lastExport && lastExport.files) || [];
      return box(stack,
        text(muted, t('exportHint')),
        box(card,
          box({ display: 'flex', gap: 8 },
            h('button', { style: button(true), disabled: busy || !project, onClick: () => onExport('lrc') }, t('exportLrc')),
            h('button', { style: button(false), disabled: busy || !project, onClick: () => onExport('ustx') }, t('exportUstx'))),
          files.map((file) => text({ ...mono, fontSize: 12, marginTop: 8, color: 'var(--dsw-alias-label-secondary)' },
            `${t('exported')} · ${file.target} · ${file.bytes} B · ${file.path}`)),
          text({ ...muted, marginTop: 10 }, t('exportWarn'))));
    }

    /* ----------------------------- 工作台本体 ----------------------------- */

    function Workbench({ t }) {
      const [projectId, setProjectId] = useState(null);
      const [project, setProject] = useState(null);
      const [tool, setTool] = useState('lyrics');
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState(null);
      const [host, setHost] = useState(null);
      const [lastExport, setLastExport] = useState(null);
      const alive = useRef(true);
      const pending = useRef(false);

      useEffect(() => () => { alive.current = false; }, []);

      const load = async (id) => {
        const value = await call(`/projects/${id}`);
        if (alive.current) setProject(value.project);
      };

      const detectHost = async (quiet) => {
        try {
          const value = await call('/host');
          if (alive.current) setHost(value);
        } catch (e) {
          if (!quiet && alive.current) setError(e.message);
        }
      };

      useEffect(() => {
        let stop = false;
        const boot = async () => {
          try {
            const list = await call('/projects');
            const first = (list.projects || [])[0];
            if (first && !stop) {
              setProjectId(first.id);
              await load(first.id);
            }
          } catch (e) {
            if (!stop) setError(e.message);
          }
          await detectHost(true);
        };
        void boot();
        const timer = setInterval(() => { if (!pending.current) void detectHost(true); }, 5000);
        return () => { stop = true; clearInterval(timer); };
      }, []);

      const wrap = async (fn) => {
        if (pending.current) return;
        pending.current = true;
        setBusy(true);
        setError(null);
        try {
          await fn();
        } catch (e) {
          if (alive.current) setError(e.message);
        } finally {
          pending.current = false;
          if (alive.current) setBusy(false);
        }
      };

      const create = async () => {
        const value = await call('/projects', {
          method: 'POST',
          body: JSON.stringify({ title: t('untitled'), bpm: 128 }),
        });
        const id = value.project.id;
        setProjectId(id);
        await load(id);
        setLastExport(null);
      };

      const importLyrics = (raw) => wrap(async () => {
        let id = projectId;
        if (!id) {
          const created = await call('/projects', {
            method: 'POST',
            body: JSON.stringify({ title: t('untitled'), bpm: 128 }),
          });
          id = created.project.id;
          setProjectId(id);
        }
        await call(`/projects/${id}/lyrics`, { method: 'POST', body: JSON.stringify({ text: raw }) });
        await load(id);
      });

      const draft = (style) => wrap(async () => {
        if (!projectId) return;
        await call(`/projects/${projectId}/notes`, { method: 'POST', body: JSON.stringify({ style }) });
        await load(projectId);
      });

      const exportAs = (target) => wrap(async () => {
        if (!projectId) return;
        setLastExport(await call(`/projects/${projectId}/export`, {
          method: 'POST',
          body: JSON.stringify({ targets: [target] }),
        }));
      });

      const stats = useMemo(() => {
        if (!project) return null;
        const notes = notesOf(project);
        const last = notes.reduce((max, note) => Math.max(max, (note.position + note.duration) / 480), 0);
        return {
          chars: project.lyrics.lines.reduce((sum, line) => sum + line.chars.length, 0),
          notes: notes.length,
          length: `${last.toFixed(1)}s`,
          aligned: project.lyrics.lines.length > 0
            && project.lyrics.lines.every((line) => line.chars.every((c) => !c.estimated)),
        };
      }, [project]);

      const emptyState = box({
        ...card, textAlign: 'center', padding: '56px 24px', maxWidth: 560, margin: '40px auto',
      },
      text({ fontSize: 15, fontWeight: 600, marginBottom: 8 }, t('emptyTitle')),
      text({ ...muted, marginBottom: 16 }, t('emptyBody')),
      h('button', { style: button(true), disabled: busy, onClick: () => void wrap(create) }, t('newProject')));

      const pane = !project
        ? emptyState
        : tool === 'lyrics'
          ? h(LyricsPane, { t, project, busy, onImport: importLyrics, onNotes: draft })
          : tool === 'voice'
            ? h(VoicePane, { t })
            : tool === 'host'
              ? h(HostPane, { t, host, onDetect: () => void detectHost(false) })
              : tool === 'palette'
                ? h(PalettePane, { t, project })
                : tool === 'mv'
                  ? h(MvPane, { t })
                  : h(ExportPane, { t, project, busy, onExport: exportAs, lastExport });

      const topBar = box({
        display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px',
        borderBottom: '1px solid var(--dsw-alias-border-l1)', flex: '0 0 auto',
      },
      text({ fontSize: 14, fontWeight: 600 }, t('workbench')),
      h('span', { style: { ...muted, ...mono } }, project ? project.meta.title : t('noProject')),
      project ? h('span', { style: muted }, `${t('bpm')} ${project.meta.bpm}`) : null,
      box({ flex: 1 }),
      error ? h('span', { style: { ...muted, color: 'var(--dsw-alias-state-error-primary)' } }, error) : null,
      h('button', { style: button(false), disabled: busy, onClick: () => void wrap(create) }, t('newProject')),
      h('span', { style: { ...muted, minWidth: 56, textAlign: 'right' } }, busy ? t('saving') : t('saved')));

      const rail = box({
        width: 152, flex: '0 0 152px', borderRight: '1px solid var(--dsw-alias-border-l1)',
        padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 2,
      },
      text({ ...muted, padding: '4px 10px 8px' }, t('tools')),
      TOOLS.map((item) => h('button', {
        key: item.id,
        onClick: () => setTool(item.id),
        style: {
          appearance: 'none', border: 'none', textAlign: 'left',
          display: 'flex', alignItems: 'center', gap: 9, width: '100%',
          padding: '7px 10px', borderRadius: 'var(--dsw-radius-md)', cursor: 'pointer', fontSize: 13,
          background: tool === item.id ? 'var(--dsw-alias-interactive-bg-active)' : 'transparent',
          color: tool === item.id ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)',
        },
      },
      h('span', { style: { ...mono, width: 14, opacity: 0.75 } }, item.icon),
      h('span', { style: { flex: 1 } }, t(item.label)),
      h('span', { title: t(stateOf(item.state)), style: dot(item.state) }))));

      const statusBar = box({
        display: 'flex', gap: 18, alignItems: 'center', padding: '7px 20px', flex: '0 0 auto',
        borderTop: '1px solid var(--dsw-alias-border-l1)', ...muted, fontSize: 12,
      },
      h('span', null, stats ? `${stats.chars} ${t('statusChars')}` : t('noProject')),
      h('span', null, stats ? `${stats.notes} ${t('statusNotes')}` : null),
      h('span', null, stats ? stats.length : null),
      h('span', null, stats ? `${t('statusAlign')}: ${stats.aligned ? t('measured') : t('estimated')}` : null),
      box({ flex: 1 }),
      h('span', null, `${t('hostBridge')}: ${((host && host.bridges) || []).length}`));

      return box({
        display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0,
        background: 'var(--dsw-alias-bg-module-platform)',
        color: 'var(--dsw-alias-label-primary)', fontSize: 13,
      },
      topBar,
      box({ display: 'flex', flex: '1 1 auto', minHeight: 0 },
        rail,
        h('div', { style: { flex: '1 1 auto', minWidth: 0, minHeight: 0, overflow: tool === 'host' ? 'hidden' : 'auto', padding: tool === 'host' ? 0 : 20 } }, pane)),
      statusBar);
    }

    function PanelIcon({ size }) {
      const edge = typeof size === 'number' ? size : 18;
      return h('svg', {
        width: edge, height: edge, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round',
        'aria-hidden': true, style: { display: 'block' },
      },
      h('path', { d: 'M4 13v-1a2 2 0 0 1 2-2h1' }),
      h('path', { d: 'M7 10v5a2 2 0 0 0 2 2h1' }),
      h('circle', { cx: 6, cy: 16.5, r: 1.6 }),
      h('path', { d: 'M14 5v9.5' }),
      h('path', { d: 'M14 5c2.6 0 4.2.9 5 2.4' }),
      h('path', { d: 'M14 9c2 .1 3.3.7 4 1.9' }));
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        // 客户端活着的证据：面板挂载时给宿主报一次到；宿主在 /health 里回报。
        try {
          void fetch('/dsh-vsing/api/hello', { method: 'POST' }).catch(() => {});
        } catch {
          // 拿不到就算了，不影响面板。
        }
        ctx.effect(() => ctx.locale.register(NS, DICT), 'dsh-vsing: dictionaries');
        const t = ctx.locale.bind(NS);
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main', key: 'dsh-vsing', locale: NS,
        }, Workbench));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id: 'dsh-vsing', order: 30,
          label: () => t('panel'), locale: NS,
        }, PanelIcon));
      },
    };
  },
});
