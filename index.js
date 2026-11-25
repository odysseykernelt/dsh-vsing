/**
 * dsh-vsing — virtual singer workbench, skeleton (host half).
 *
 * What exists today, and only this:
 *   - a project file on disk (`.vproj`, schema vproj/1);
 *   - lyric import → per-char time axis (marked estimated, because nothing was
 *     measured yet), note draft, LRC / USTX export;
 *   - an HTTP API under /dsh-vsing/api for the future panel and any browser;
 *   - agent tools wb_open / wb_status / wb_lyrics / wb_notes / wb_export.
 *
 * What deliberately does NOT exist yet: alignment, audio rendering, the panel,
 * format conversion through ufdata. `wb_align` answers `aligner_not_configured`
 * instead of pretending — a visible failure beats a silent empty axis.
 */

import { readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineTool } from '@deepseek-ai/dsh-tools';

import { draftNotes, importLyrics, summary, toLrc, toUstx } from './lib/project.js';
import {
  createProject,
  defaultRoot,
  listProjects,
  loadProject,
  saveProject,
  writeOut,
} from './lib/store.js';

const ROUTE_PREFIX = '/dsh-vsing/api';
// 客户端面板挂载时报到用的时间戳；只在内存里，重启就清空。
let lastClientPing = null;

const PACKAGE_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * 本机配置（可选）：同目录的 config.local.json，只放本机路径。
 *   { "openutauDirs": ["D:\\apps\\OpenUtau"] }
 * 读不到或有语法错误就当没有，并在 /host 的无害字段里如实说明，不抛。
 */
function localOpenUtauDirs() {
  try {
    const raw = readFileSync(join(PACKAGE_DIR, 'config.local.json'), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.openutauDirs) ? parsed.openutauDirs : [];
  } catch {
    return [];
  }
}
const JSON_OUTPUT = {
  schema: { type: 'json' },
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
};

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

function sendJson(res, status, value) {
  res.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify(value));
}

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error(`JSON 解析失败：${error.message}`));
      }
    });
    req.on('error', reject);
  });
}

function failure(error, code, detail, next) {
  return { ok: false, error: code, detail: detail ?? messageOf(error), next: next ?? '' };
}

export const name = 'dsh-vsing';
export const inject = ['tools'];

export function apply(ctx, config) {
  const root = String(config?.projectsDir || '').trim() || defaultRoot();
  // 额外要探测的 OpenUtau 目录：cordis.patch.yml 里写通用的，
  // 本机路径可写进同目录的 config.local.json。
  const extraOpenUtauDirs = [
    ...(Array.isArray(config?.openutauDirs) ? config.openutauDirs : []),
    ...localOpenUtauDirs(),
  ].map((d) => String(d || '').trim()).filter(Boolean);

  /* -------------------------------- routes -------------------------------- */

  ctx.inject(['webServer'], (host) => {
    host.effect(
      () => host.webServer.register({
        kind: 'prefix',
        path: ROUTE_PREFIX,
        handler: (req, res) => {
          void handleRoute(req, res, root, extraOpenUtauDirs);
        },
      }),
      'dsh-vsing: workbench api',
    );
  });

  /* -------------------------------- tools --------------------------------- */

  ctx.tools.register(defineTool({
    name: 'wb_open',
    description: [
      '打开或新建一个虚拟歌姬工程。工程是磁盘上的 .vproj（JSON），随时可以拿走。',
      '不给 id 就是新建；给了 id 就打开已有的。返回工程摘要和目录。',
    ].join('\n'),
    parameters: {
      id: { type: 'string', description: '已有工程的 id；省略则新建' },
      title: { type: 'string', description: '新建时的标题，默认「未命名工程」' },
      bpm: { type: 'number', description: '新建时的 BPM，默认 120' },
    },
    output: JSON_OUTPUT,
    async execute(args) {
      try {
        if (args.id) {
          const project = await loadProject(root, String(args.id));
          return { ok: true, root, ...summary(project) };
        }
        const project = await createProject(root, {
          title: args.title ? String(args.title) : undefined,
          bpm: Number(args.bpm) > 0 ? Number(args.bpm) : undefined,
        });
        return { ok: true, root, ...summary(project) };
      } catch (error) {
        return failure(error, 'open_failed');
      }
    },
  }));

  ctx.tools.register(defineTool({
    name: 'wb_status',
    description: '列出工程，或查看一个工程的摘要（行数、字数、音符数、已做过的步骤）。',
    parameters: {
      id: { type: 'string', description: '工程 id；省略则列出全部工程' },
    },
    output: JSON_OUTPUT,
    async execute(args) {
      try {
        if (String(args.id || '').trim()) {
          const project = await loadProject(root, String(args.id).trim());
          return { ok: true, root, ...summary(project) };
        }
        return { ok: true, root, projects: await listProjects(root) };
      } catch (error) {
        return failure(error, 'status_failed');
      }
    },
  }));

  ctx.tools.register(defineTool({
    name: 'wb_lyrics',
    description: [
      '把歌词文本导入工程的歌词轴：一行一句，按等分给出每个字的起始时间。',
      '这一步没有音频、没有测量，时间是占位值（provenance 里标 estimated），后面真正打轴时会被替换。',
    ].join('\n'),
    parameters: {
      id: { type: 'string', required: true, description: '工程 id' },
      text: { type: 'string', required: true, description: '歌词文本，一行一句；以 # 开头的行忽略' },
      msPerLine: { type: 'number', description: '每句占位时长（毫秒），默认 4000' },
    },
    output: JSON_OUTPUT,
    async execute(args) {
      try {
        const project = await loadProject(root, String(args.id));
        importLyrics(project, args.text, { msPerLine: Number(args.msPerLine) || undefined });
        const file = await saveProject(root, project);
        return { ok: true, file, ...summary(project) };
      } catch (error) {
        return failure(error, 'lyrics_failed');
      }
    },
  }));

  ctx.tools.register(defineTool({
    name: 'wb_notes',
    description: [
      '把歌词轴草拟成音符层：一个字一个音符，音高先一律 C4，等人工或后续步骤再改。',
      'style=legato 会把音符延长到下一个音符开始；square 保留原长度；follow-vocal 目前等同 square（要等 F0 提取接上）。',
    ].join('\n'),
    parameters: {
      id: { type: 'string', required: true, description: '工程 id' },
      style: {
        type: 'string',
        enum: ['follow-vocal', 'square', 'legato'],
        description: '音符草拟风格，默认 follow-vocal',
      },
    },
    output: JSON_OUTPUT,
    async execute(args) {
      try {
        const project = await loadProject(root, String(args.id));
        draftNotes(project, { style: args.style });
        const file = await saveProject(root, project);
        return { ok: true, file, ...summary(project) };
      } catch (error) {
        return failure(error, 'notes_failed');
      }
    },
  }));

  ctx.tools.register(defineTool({
    name: 'wb_export',
    description: [
      '导出工程产物到工程目录的 out/ 下。目前支持 lrc（歌词轴字幕）和 ustx（OpenUtau 工程）。',
      '一次导出多个目标，全部落在同一个 out/ 里。',
    ].join('\n'),
    parameters: {
      id: { type: 'string', required: true, description: '工程 id' },
      targets: {
        type: 'array',
        items: { type: 'string', enum: ['lrc', 'ustx'] },
        description: '要导出的目标，默认 ["lrc","ustx"]',
      },
    },
    output: JSON_OUTPUT,
    async execute(args) {
      try {
        const project = await loadProject(root, String(args.id));
        const targets = Array.isArray(args.targets) && args.targets.length ? args.targets : ['lrc', 'ustx'];
        const files = [];
        for (const target of targets) {
          if (target === 'lrc') {
            files.push(await writeOut(root, project.meta.id, 'lyrics.lrc', toLrc(project)));
          } else if (target === 'ustx') {
            files.push(await writeOut(root, project.meta.id, 'vocal.ustx', toUstx(project)));
          } else {
            return failure(null, 'unknown_target', `不支持的导出目标：${target}`, '可用目标：lrc、ustx');
          }
        }
        return { ok: true, files };
      } catch (error) {
        return failure(error, 'export_failed');
      }
    },
  }));

  ctx.tools.register(defineTool({
    name: 'wb_align',
    description: [
      '给工程做逐字打轴（音频 + 歌词 → 字级时间）。',
      '当前版本还没有接对齐器：调用会明确返回 aligner_not_configured，不会写一个假的轴进去。',
    ].join('\n'),
    parameters: {
      id: { type: 'string', required: true, description: '工程 id' },
      audio: { type: 'string', description: '参考音频路径（本版本未使用）' },
    },
    output: JSON_OUTPUT,
    async execute() {
      return failure(
        null,
        'aligner_not_configured',
        '对齐全流程还没接：WhisperX/SOFA 未安装、引擎侧 job 未实现。',
        '先用 wb_lyrics 的占位轴，或等下一步接入对齐器；不要把它当成已完成。',
      );
    },
  }));
}

/* ------------------------------- HTTP API -------------------------------- */

/**
 * 宿主探测：桥进程通过 %TEMP%/OpenUtau/PluginServers/<name>.json 登记自己，
 * 所以「有没有桥在等」是可读的事实，不是猜测。OpenUtau 版本从安装目录读。
 */
async function probeHost(extraDirs = []) {
  const bridges = [];
  let version = null;
  const temp = process.env.TEMP || process.env.TMP || '';
  const bridgeDir = temp ? join(temp, 'OpenUtau', 'PluginServers') : '';

  if (bridgeDir) {
    try {
      for (const name of await readdir(bridgeDir)) {
        if (!name.endsWith('.json')) continue;
        try {
          const raw = await readFile(join(bridgeDir, name), 'utf8');
          const info = JSON.parse(raw);
          bridges.push({ name: name.slice(0, -5), port: info.port, apiVersion: info.apiVersion, file: join(bridgeDir, name) });
        } catch {
          bridges.push({ name: name.slice(0, -5), unreadable: true });
        }
      }
    } catch {
      // 目录不存在就是没有桥；这不是错误。
    }
  }

  const installs = [];
  const candidates = [
    process.env.VSING_OPENUTAU_DIR,
    ...extraDirs,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Programs', 'OpenUtau') : null,
    'C:\\Program Files\\OpenUtau',
  ].filter(Boolean);

  for (const dir of candidates) {
    const found = await describeInstall(dir);
    if (found) installs.push(found);
  }

  const primary = installs.find((i) => i.dawIntegration) ?? installs[0] ?? null;
  version = primary?.version ?? null;

  return {
    engine: 'openutau',
    version,
    installs,
    dataDir: primary?.dataDir ?? null,
    bridgeDir,
    bridges,
    embed: 'not_implemented',
    aligner: 'not_configured',
    renderer: 'not_configured',
  };
}

/**
 * 读一个 OpenUtau 目录，返回能验证的事实：版本号、是不是便携模式（没有 installed.txt）、
 * 这一份有没有 DAW 集成 API（Core.dll 里有 DawIntegration 字符串，0.1.576 起才有）。
 */
async function describeInstall(dir) {
  try {
    const main = await readFile(join(dir, 'OpenUtau.dll'));
    const text = main.toString('latin1');
    const version = /0\.1\.\d{3}(?:\.\d+)?/.exec(text)?.[0] ?? null;

    let dawIntegration = false;
    let dllBytes = 0;
    try {
      const core = await readFile(join(dir, 'OpenUtau.Core.dll'));
      dllBytes = core.length;
      dawIntegration = core.includes('DawIntegration');
    } catch {
      // 没有 Core.dll 就是残缺安装，照实报 dawIntegration:false。
    }

    const portable = !(await exists(join(dir, 'installed.txt')));
    const dataDir = portable
      ? dir
      : join(process.env.USERPROFILE ?? '', 'Documents', 'OpenUtau');

    return { dir, version, dawIntegration, portable, dataDir, dllBytes };
  } catch {
    return null;
  }
}

async function exists(path) {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

async function handleRoute(req, res, root, extraOpenUtauDirs) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const subPath = url.pathname.slice(ROUTE_PREFIX.length) || '/';
  const parts = subPath.split('/').filter(Boolean);

  try {
    if (req.method === 'POST' && subPath === '/hello') {
      lastClientPing = new Date().toISOString();
      sendJson(res, 200, { ok: true, seen: lastClientPing });
      return;
    }

    if (req.method === 'GET' && subPath === '/health') {
      sendJson(res, 200, {
        ok: true, version: '0.1.0', root, schema: 'vproj/1', lastClientSeen: lastClientPing,
      });
      return;
    }

    if (req.method === 'GET' && subPath === '/host') {
      // 宿主环境：只报能验证的事实——本地装了哪些 OpenUtau、桥进程有没有在等。
      sendJson(res, 200, { ok: true, ...(await probeHost(extraOpenUtauDirs)) });
      return;
    }

    if (req.method === 'GET' && (subPath === '/projects' || subPath === '/projects/')) {
      sendJson(res, 200, { ok: true, projects: await listProjects(root) });
      return;
    }

    if (req.method === 'POST' && subPath === '/projects') {
      const body = await readBody(req);
      const project = await createProject(root, {
        title: body.title ? String(body.title) : undefined,
        bpm: Number(body.bpm) > 0 ? Number(body.bpm) : undefined,
      });
      sendJson(res, 200, { ok: true, project: summary(project) });
      return;
    }

    if (parts[0] === 'projects' && parts[1]) {
      const id = decodeURIComponent(parts[1]);
      const tail = parts.slice(2).join('/');

      if (req.method === 'GET' && tail === '') {
        sendJson(res, 200, { ok: true, project: await loadProject(root, id) });
        return;
      }

      if (req.method === 'POST' && tail === 'lyrics') {
        const body = await readBody(req);
        const project = await loadProject(root, id);
        importLyrics(project, body.text, { msPerLine: Number(body.msPerLine) || undefined });
        await saveProject(root, project);
        sendJson(res, 200, { ok: true, project: summary(project) });
        return;
      }

      if (req.method === 'POST' && tail === 'notes') {
        const body = await readBody(req);
        const project = await loadProject(root, id);
        draftNotes(project, { style: body.style });
        await saveProject(root, project);
        sendJson(res, 200, { ok: true, project: summary(project) });
        return;
      }

      if (req.method === 'POST' && tail === 'export') {
        const body = await readBody(req);
        const project = await loadProject(root, id);
        const targets = Array.isArray(body.targets) && body.targets.length ? body.targets : ['lrc', 'ustx'];
        const files = [];
        for (const target of targets) {
          if (target === 'lrc') files.push(await writeOut(root, id, 'lyrics.lrc', toLrc(project)));
          else if (target === 'ustx') files.push(await writeOut(root, id, 'vocal.ustx', toUstx(project)));
          else sendJson(res, 400, { ok: false, error: 'unknown_target', detail: String(target) });
        }
        sendJson(res, 200, { ok: true, files });
        return;
      }
    }

    sendJson(res, 404, { ok: false, error: 'not_found', detail: subPath });
  } catch (error) {
    sendJson(res, 400, { ok: false, error: 'request_failed', detail: messageOf(error) });
  }
}
