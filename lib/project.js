/**
 * Project model for the virtual-singer workbench.
 *
 * Everything here is a pure function over plain JSON, so the same rules run in
 * tests, in the Host plugin, and in any future CLI. The project file is the
 * contract: `.vproj` (schema vproj/1) can leave this tool at any time.
 *
 * Provenance is an append-only array — every step records who produced it.
 * Nothing here guesses: timing that was estimated is marked `estimated: true`
 * so a later real alignment can replace it without pretending it was measured.
 */

export const SCHEMA = 'vproj/1';
export const TICKS_PER_BEAT = 480;

/** A compact id we can use as a directory name on every platform. */
export function makeId(seed = Date.now()) {
  const stamp = new Date(seed).toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  const salt = Math.random().toString(36).slice(2, 6);
  return `p-${stamp}-${salt}`;
}

export function newProject(options = {}) {
  const {
    id = makeId(),
    title = '未命名工程',
    bpm = 120,
    timeSignature = [4, 4],
    language = 'zh',
  } = options;

  return {
    schema: SCHEMA,
    meta: { id, title, bpm, timeSignature, language, createdAt: new Date().toISOString() },
    lyrics: { source: { kind: 'text', path: '', hash: '' }, lines: [] },
    tracks: [],
    notes: { format: 'ufdata', tracks: [{ notes: [], pitch: { ticks: [], values: [], isAbsolute: false } }] },
    palette: { source: { kind: 'none', path: '' }, seed: '', roles: {}, contrast: { standard: 'WCAG-AA', checked: false } },
    video: { recipe: '', recipeHash: '', fps: 30, size: [1920, 1080] },
    render: { sampleRate: 44100, channels: 2, loudnessTarget: -14 },
    provenance: [],
  };
}

function record(project, step, tool, params = {}) {
  project.provenance.push({
    step,
    tool,
    version: '0.1.0',
    at: new Date().toISOString(),
    params,
    estimated: true,
  });
}

export function textLines(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

/**
 * Import plain lyrics. There is no audio to align against yet, so each line is
 * given a placeholder span and every char an even share of it. The axis is
 * usable, but it is not a measurement — `estimated: true` says so.
 */
export function importLyrics(project, text, options = {}) {
  const msPerLine = Number(options.msPerLine) > 0 ? Number(options.msPerLine) : 4000;
  const lines = textLines(text);
  if (!lines.length) throw new Error('歌词为空：至少给一行文本');

  let cursor = 0;
  project.lyrics.lines = lines.map((raw) => {
    const chars = Array.from(raw).map((ch) => ({ ch }));
    const span = Math.max(200, Math.round(msPerLine));
    const step = chars.length ? span / chars.length : span;
    const startMs = cursor;
    const withTime = chars.map((item, index) => ({
      ...item,
      startMs: Math.round(startMs + index * step),
      durMs: Math.round(step),
      confidence: null,
      estimated: true,
    }));
    cursor += span;
    return { text: raw, startMs, endMs: cursor, chars: withTime };
  });
  project.lyrics.source = { kind: 'text', path: '', hash: '' };
  record(project, 'lyrics_import', 'dsh-vsing', { lines: project.lyrics.lines.length, msPerLine });
  return project;
}

function msToTicks(ms, bpm) {
  return Math.round((ms / 1000) * (bpm / 60) * TICKS_PER_BEAT);
}

/** Turn the lyric axis into a first note layer: one note per char, tone C4. */
export function draftNotes(project, options = {}) {
  const style = options.style === 'square' || options.style === 'legato' ? options.style : 'follow-vocal';
  const bpm = Number(project.meta.bpm) || 120;
  const notes = [];

  for (const line of project.lyrics.lines) {
    for (const char of line.chars) {
      if (!Number.isFinite(char.startMs) || !(char.durMs > 0)) continue;
      const position = msToTicks(char.startMs, bpm);
      const duration = Math.max(1, msToTicks(char.durMs, bpm));
      notes.push({
        position,
        duration,
        tone: 60,
        lyric: char.ch,
        // filled by a later step; kept explicit so the UI can show "no pitch yet"
        pitch: null,
      });
    }
  }

  if (!notes.length) throw new Error('没有可用的字：先 wb_lyrics 导入歌词');
  notes.sort((a, b) => a.position - b.position);

  // legato: extend each note up to the next note's start so nothing is silent
  if (style === 'legato') {
    for (let i = 0; i < notes.length - 1; i += 1) {
      const gap = notes[i + 1].position - notes[i].position;
      if (gap > notes[i].duration) notes[i].duration = gap;
    }
  }

  project.notes = { format: 'ufdata', tracks: [{ notes, pitch: { ticks: [], values: [], isAbsolute: false } }] };
  if (!project.tracks.some((track) => track.id === 'v1')) {
    project.tracks.unshift({
      id: 'v1',
      type: 'vocal',
      voicebank: '',
      ufdataTrack: 0,
      partStartMs: 0,
      partEndMs: Math.max(0, ...project.lyrics.lines.map((line) => line.endMs)),
    });
  }
  record(project, 'notes_draft', 'dsh-vsing', { style, count: notes.length });
  return project;
}

export function toLrc(project) {
  const pad = (value) => String(value).padStart(2, '0');
  const stamp = (ms) => {
    const total = Math.max(0, Math.round(ms));
    const minutes = Math.floor(total / 60000);
    const seconds = Math.floor((total % 60000) / 1000);
    const hundredths = Math.round((total % 1000) / 10);
    return `[${pad(minutes)}:${pad(seconds)}.${pad(hundredths)}]`;
  };
  const head = [`[ti:${project.meta.title}]`, `[by:dsh-vsing]`, ''].join('\n');
  const body = project.lyrics.lines.map((line) => `${stamp(line.startMs)}${line.text}`).join('\n');
  return `${head}${body}${body ? '\n' : ''}`;
}

/**
 * Minimal USTX writer. Field names follow OpenUtau's `USTx.cs`; we only emit the
 * keys we can fill honestly. Not verified by opening in OpenUtau yet — the
 * delivery notes say so instead of claiming it loads.
 */
export function toUstx(project) {
  const bpm = Number(project.meta.bpm) || 120;
  const [beatPerBar, beatUnit] = project.meta.timeSignature ?? [4, 4];
  const notes = project.notes?.tracks?.[0]?.notes ?? [];
  const lastEnd = notes.reduce((max, note) => Math.max(max, note.position + note.duration), 0);
  const lines = [];

  lines.push('ustxVersion: 0.10');
  lines.push(`name: ${quote(project.meta.title)}`);
  lines.push("comment: ''");
  lines.push("output_dir: 'out'");
  lines.push("cache_dir: 'cache'");
  lines.push(`resolution: ${TICKS_PER_BEAT}`);
  lines.push('time_signature:');
  lines.push(`  beat_per_bar: ${beatPerBar}`);
  lines.push(`  beat_unit: ${beatUnit}`);
  lines.push(`bpm: ${bpm}`);
  lines.push('tracks:');
  lines.push('  - track_name: vocal');
  lines.push("    singer: ''");
  lines.push("    phonemizer: 'OpenUtau.Core.DefaultPhonemizer'");
  lines.push("    renderer: ''");
  lines.push('    mute: false');
  lines.push('    solo: false');
  lines.push('    volume: 0');
  lines.push('    pan: 0');
  lines.push('voice_parts:');
  lines.push('  - name: vocal');
  lines.push('    track_no: 0');
  lines.push('    position: 0');
  lines.push(`    duration: ${Math.max(0, lastEnd)}`);
  lines.push('    notes:');
  for (const note of notes) {
    lines.push(`      - position: ${note.position}`);
    lines.push(`        duration: ${note.duration}`);
    lines.push(`        tone: ${note.tone}`);
    lines.push(`        lyric: ${quote(note.lyric)}`);
  }
  if (!notes.length) lines.push('      []');
  return `${lines.join('\n')}\n`;
}

function quote(value) {
  const text = String(value ?? '');
  if (!/[:#\-?,[\]{}&*!|>'"%@`]/.test(text) && text.trim() === text && text.length > 0) return text;
  return `'${text.replaceAll("'", "''")}'`;
}

export function summary(project) {
  const notes = project.notes?.tracks?.[0]?.notes?.length ?? 0;
  return {
    id: project.meta.id,
    title: project.meta.title,
    bpm: project.meta.bpm,
    lines: project.lyrics.lines.length,
    chars: project.lyrics.lines.reduce((sum, line) => sum + line.chars.length, 0),
    notes,
    estimated: project.provenance.every((step) => step.estimated !== false),
    provenance: project.provenance.map((step) => step.step),
  };
}
