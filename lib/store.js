/**
 * On-disk project store.
 *
 * One directory per project under the projects root:
 *   <root>/<id>/project.vproj
 *   <root>/<id>/out/            exported files
 *   <root>/<id>/cache/          intermediate products (visible, never hidden)
 *
 * The root defaults to <DSH_HOME>/vsing/projects and is overridable through the
 * plugin Config so a user can keep projects next to their music.
 */

import { mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { newProject, makeId } from './project.js';

export function defaultRoot() {
  const home = process.env.DSH_HOME?.trim();
  return join(home || join(homedir(), '.dsh'), 'vsing', 'projects');
}

export function projectPaths(root, id) {
  const dir = join(root, id);
  return { dir, file: join(dir, 'project.vproj'), out: join(dir, 'out'), cache: join(dir, 'cache') };
}

/** Create a project on disk. Fails loudly if the id already exists. */
export async function createProject(root, options = {}) {
  const id = options.id || makeId();
  const paths = projectPaths(root, id);
  if (existsSync(paths.file)) throw new Error(`工程已存在：${id}`);
  await mkdir(paths.out, { recursive: true });
  await mkdir(paths.cache, { recursive: true });
  const project = newProject({ ...options, id });
  await saveProject(root, project);
  return project;
}

export async function loadProject(root, id) {
  const paths = projectPaths(root, id);
  let raw;
  try {
    raw = await readFile(paths.file, 'utf8');
  } catch {
    throw new Error(`找不到工程：${id}`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`工程文件损坏：${id}（${error.message}）`);
  }
}

export async function saveProject(root, project) {
  const paths = projectPaths(root, project.meta.id);
  await mkdir(paths.dir, { recursive: true });
  await writeFile(paths.file, `${JSON.stringify(project, null, 2)}\n`, 'utf8');
  return paths.file;
}

export async function listProjects(root) {
  let entries = [];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const rows = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const paths = projectPaths(root, entry.name);
    try {
      const [raw, info] = await Promise.all([readFile(paths.file, 'utf8'), stat(paths.file)]);
      const project = JSON.parse(raw);
      rows.push({
        id: project.meta?.id ?? entry.name,
        title: project.meta?.title ?? entry.name,
        bpm: project.meta?.bpm ?? null,
        lines: project.lyrics?.lines?.length ?? 0,
        notes: project.notes?.tracks?.[0]?.notes?.length ?? 0,
        updatedAt: info.mtime.toISOString(),
      });
    } catch (error) {
      rows.push({ id: entry.name, error: String(error.message || error) });
    }
  }
  rows.sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));
  return rows;
}

/** Write an export file inside the project's out/ directory. */
export async function writeOut(root, id, filename, content) {
  const paths = projectPaths(root, id);
  await mkdir(paths.out, { recursive: true });
  const target = resolve(paths.out, filename);
  if (!target.startsWith(resolve(paths.out))) throw new Error('导出文件名越界');
  await writeFile(target, content, 'utf8');
  return target;
}
