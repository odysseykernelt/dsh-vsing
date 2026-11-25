// 冒烟测试：在 Node 里模拟宿主模块加载器，require('react') 用最小桩，
// 把 client.js 的 factory 真的跑一遍、apply 也跑一遍（用假 ctx），
// 抓「引用不存在的值 / 未定义变量」这类会在浏览器里炸掉的错。
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');

const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useEffect: () => {},
  useMemo: (fn) => fn(),
  useRef: (v) => ({ current: v }),
  useState: (v) => [v, () => {}],
};

let loaded = null;
const sandbox = {
  window: {
    __ModuleLoader__: {
      load({ id, factory }) {
        loaded = { id, factory };
      },
    },
    devicePixelRatio: 1,
    addEventListener() {},
    removeEventListener() {},
  },
  fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
  setTimeout,
  clearTimeout,
  setInterval: () => 0,
  clearInterval: () => {},
  ResizeObserver: class { observe() {} disconnect() {} },
  console,
  document: { createElement: () => ({}) },
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'client.js' });

if (!loaded) throw new Error('__ModuleLoader__.load 没有被调用');
console.log('module id:', loaded.id);

const mod = loaded.factory((name) => {
  if (name === 'react') return React;
  throw new Error(`unexpected require: ${name}`);
});
console.log('inject:', JSON.stringify(mod.inject));

const registered = [];
const components = [];
const ctx = {
  effect(fn) { const dispose = fn(); return typeof dispose === 'function' ? dispose : () => {}; },
  locale: {
    register(ns, dict) { registered.push(['locale', ns, Object.keys(dict)]); return () => {}; },
    bind() { return (key) => key; },
  },
  slots: {
    inject(name, cb) { registered.push(['inject', name]); return cb(); },
    register(options, component) {
      registered.push(['register', options.name, options.key || options.id]);
      components.push([options.name, component]);
      return () => {};
    },
  },
};
mod.apply(ctx);
for (const row of registered) console.log('  ', row.join(' | '));

// 真渲染一遍：组件体内如果有未定义变量，这里会抛。
for (const [name, component] of components) {
  try {
    const out = component({ t: (key) => key, size: 18, host: null, project: null });
    console.log(`render ${name}: ok (${out ? 'node' : 'null'})`);
  } catch (error) {
    console.log(`render ${name}: FAILED ${error.message}`);
    process.exitCode = 1;
  }
}
console.log('SMOKE_OK');
