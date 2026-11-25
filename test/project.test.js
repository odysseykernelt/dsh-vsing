import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { draftNotes, importLyrics, newProject, summary, toLrc, toUstx } from '../lib/project.js';
import { createProject, listProjects, loadProject, saveProject, writeOut, projectPaths } from '../lib/store.js';

test('import lyrics splits one line into per-char timings', () => {
  const project = newProject({ title: 't', bpm: 120 });
  importLyrics(project, '第一句\n第二句', { msPerLine: 4000 });
  assert.equal(project.lyrics.lines.length, 2);
  const first = project.lyrics.lines[0];
  assert.equal(first.chars.length, 3);
  assert.equal(first.startMs, 0);
  assert.equal(first.endMs, 4000);
  assert.equal(first.chars[1].startMs, Math.round((4000 / 3) * 1));
  assert.ok(first.chars.every((char) => char.estimated === true));
  assert.equal(project.lyrics.lines[1].startMs, 4000);
});

test('empty lyrics throws instead of writing an empty axis', () => {
  const project = newProject();
  assert.throws(() => importLyrics(project, '   \n# comment\n'), /歌词为空/);
});

test('draft notes maps chars to ticks at the project bpm', () => {
  const project = newProject({ bpm: 120 });
  importLyrics(project, '啊哦', { msPerLine: 4000 });
  draftNotes(project, { style: 'square' });
  const notes = project.notes.tracks[0].notes;
  assert.equal(notes.length, 2);
  // 4000ms at 120bpm = 2 bars = 8 beats = 3840 ticks total, 1920 per note
  assert.equal(notes[0].position, 0);
  assert.equal(notes[0].duration, 1920);
  assert.equal(notes[1].position, 1920);
  assert.equal(notes[0].lyric, '啊');
});

test('legato stretches each note to the next start', () => {
  const project = newProject();
  importLyrics(project, '一二三', { msPerLine: 3000 });
  draftNotes(project, { style: 'square' });
  const squareGap = project.notes.tracks[0].notes[0].duration;
  draftNotes(project, { style: 'legato' });
  const notes = project.notes.tracks[0].notes;
  assert.equal(notes[0].duration, notes[1].position);
  assert.ok(notes[0].duration >= squareGap);
});

test('lrc has a timestamp per line', () => {
  const project = newProject({ title: '歌' });
  importLyrics(project, '甲\n乙', { msPerLine: 2500 });
  const lrc = toLrc(project);
  assert.match(lrc, /\[ti:歌\]/);
  assert.match(lrc, /\[00:00\.00\]甲/);
  assert.match(lrc, /\[00:02\.50\]乙/);
});

test('ustx declares version, tempo and one note per char', () => {
  const project = newProject({ title: 'a: b', bpm: 100 });
  importLyrics(project, '啊', { msPerLine: 1000 });
  draftNotes(project);
  const ustx = toUstx(project);
  assert.match(ustx, /ustxVersion: 0\.10/);
  assert.match(ustx, /bpm: 100/);
  assert.match(ustx, /tone: 60/);
  assert.match(ustx, /lyric: 'a: b'|lyric: 啊/);
  const noteCount = (ustx.match(/- position:/g) ?? []).length;
  assert.equal(noteCount, 1);
});

test('project round-trips through disk and shows up in the list', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vsing-'));
  const project = await createProject(root, { title: '往返', bpm: 90 });
  importLyrics(project, '测试一句', { msPerLine: 2000 });
  draftNotes(project);
  const file = await saveProject(root, project);
  assert.equal(file, projectPaths(root, project.meta.id).file);

  const loaded = await loadProject(root, project.meta.id);
  assert.equal(loaded.meta.title, '往返');
  assert.equal(loaded.notes.tracks[0].notes.length, 4);

  const rows = await listProjects(root);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, '往返');

  const outFile = await writeOut(root, project.meta.id, 'lyrics.lrc', toLrc(loaded));
  const written = await readFile(outFile, 'utf8');
  assert.match(written, /测试一句/);
});

test('summary reports what still is estimated', () => {
  const project = newProject({ title: 'x' });
  importLyrics(project, '词', { msPerLine: 1000 });
  draftNotes(project);
  const report = summary(project);
  assert.equal(report.lines, 1);
  assert.equal(report.chars, 1);
  assert.equal(report.notes, 1);
  assert.equal(report.estimated, true);
  assert.deepEqual(report.provenance, ['lyrics_import', 'notes_draft']);
});
