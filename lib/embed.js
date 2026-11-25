/**
 * embed.js — 把原生窗口（OpenUtau）塞进 DSH 主窗口的那个 helper 的保姆。
 *
 * helper 是 engine/embed-host.ps1：一行一条 JSON 请求，一行一条 JSON 响应。
 * 这里只做三件事：起进程、串行发包（helper 不认并发）、把异常变成能看懂的错误。
 */

import { spawn } from 'node:child_process';

const REQUEST_TIMEOUT_MS = 15000;

export function createEmbedHelper({ scriptPath, parentPid, cwd }) {
  let child = null;
  let buffer = '';
  let dead = false;
  let ready = null;
  const pending = [];
  const queue = [];
  let inflight = false;

  function start() {
    if (child && !dead) return;
    if (child) {
      try { child.kill(); } catch { /* 已经死了 */ }
      child = null;
    }
    dead = false;
    ready = null;
    buffer = '';
    child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-ParentPid', String(parentPid)],
      { cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    );

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (line) onLine(line);
      }
    });

    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    child.on('error', (error) => failAll(`helper 启动失败：${error.message}`));
    child.on('exit', (code) => {
      dead = true;
      const tail = stderr.trim().split('\n').slice(-3).join(' | ');
      failAll(`helper 退出（code=${code}）${tail ? `：${tail}` : ''}`);
      child = null;
    });
  }

  function onLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.event === 'ready') {
      ready = message;
      const waiters = pending.splice(0);
      for (const waiter of waiters) waiter.resolve(message);
      return;
    }
    const waiter = pending.shift();
    if (!waiter) return;
    clearTimeout(waiter.timer);
    waiter.resolve(message);
  }

  function failAll(reason) {
    const waiters = pending.splice(0);
    for (const waiter of waiters) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error(reason));
    }
    queue.length = 0;
    inflight = false;
  }

  function send(command, timeoutMs = REQUEST_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      queue.push({ command, resolve, reject, timeoutMs });
      void drain();
    });
  }

  async function drain() {
    // helper 死了也要能重来：dead 只说明上一次进程没了，不代表这一轮不发。
    if (inflight) return;
    const job = queue.shift();
    if (!job) return;
    inflight = true;
    try {
      start();
      if (!ready) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('helper 没有报到（ready 超时）')), REQUEST_TIMEOUT_MS);
          pending.push({
            resolve: (value) => { clearTimeout(timer); resolve(value); },
            reject: (error) => { clearTimeout(timer); reject(error); },
            timer,
          });
        });
      }
      const response = await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`helper 响应超时（${job.timeoutMs}ms，cmd=${job.command.cmd}）`)),
          job.timeoutMs,
        );
        pending.push({ resolve, reject, timer });
        child.stdin.write(`${JSON.stringify(job.command)}\n`);
      });
      job.resolve(response);
    } catch (error) {
      job.reject(error);
    } finally {
      inflight = false;
      void drain();
    }
  }

  function status() {
    return {
      running: Boolean(child),
      ready: Boolean(ready),
      parentHwnd: ready?.parentHwnd ?? null,
      helperPid: ready?.helperPid ?? null,
    };
  }

  async function dispose() {
    try {
      if (child) await send({ cmd: 'quit' }, 3000);
    } catch {
      // 关不掉就算了，进程会随宿主一起走。
    }
    if (child) {
      child.stdin.end();
      child.kill();
      child = null;
    }
  }

  return { send, status, dispose };
}
