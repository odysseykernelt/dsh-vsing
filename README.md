# dsh-vsing

![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![Status: WIP](https://img.shields.io/badge/status-WIP-orange.svg)

DSH 虚拟歌姬工作台。0.1.0 骨架。

歌词 → 逐字时间轴 → 音符草稿 → LRC / USTX。工程是磁盘上的 `.vproj`（JSON）。

## 工具

| 动作 | 工具 | HTTP |
|---|---|---|
| 新建 / 打开工程 | `wb_open` | `POST /dsh-vsing/api/projects` |
| 列工程 / 摘要 | `wb_status` | `GET /dsh-vsing/api/projects` |
| 歌词 → 逐字轴 | `wb_lyrics` | `POST /dsh-vsing/api/projects/:id/lyrics` |
| 轴 → 音符草稿 | `wb_notes` | `POST /dsh-vsing/api/projects/:id/notes` |
| 导出 LRC / USTX | `wb_export` | `POST /dsh-vsing/api/projects/:id/export` |
| 对齐 | `wb_align` | `aligner_not_configured` |
| 宿主探测 | — | `GET /dsh-vsing/api/host` |

`/host` 返回本机 OpenUtau 安装目录、版本、是否含 `DawIntegration`、数据目录、已注册的 DAW 桥。

面板：`main` 主面板 + `sidebar.panellist` 侧栏入口，零构建（ModuleLoader，无打包器）。

## 安装

```sh
dsh plugin --profile <profile> add <bundle-dir>
```

`cordis.patch.yml`：

- `projectsDir`：默认 `<DSH_HOME>/vsing/projects`
- `openutauDirs`：额外 OpenUtau 目录
- `config.local.json`（可选）：本地覆盖，格式 `{ "openutauDirs": ["D:\\apps\\OpenUtau"] }`

## 工程目录

```
<id>/
  project.vproj
  out/          # lyrics.lrc, vocal.ustx
  cache/
```

## 代码

```
index.js                 # 宿主侧：工具 + /dsh-vsing/api
lib/project.js           # 工程模型（歌词、音符、LRC、USTX）
lib/store.js             # 磁盘存取
lib/client.js            # 浏览器侧，零构建
test/project.test.js
tools/extract-asar.mjs   # 从 DSH app.asar 提取文件
```

## 未实现

- 时间是占位值，`provenance[].estimated = true`；无对齐器
- 音高固定 C4，`follow-vocal` 等同 `square`
- USTX 字段依 `OpenUtau.Core/Format/USTx.cs`，未在 OpenUtau 内验证
- UST 不导出（Shift-JIS 未处理）

## 测试

```sh
node test/project.test.js
```

开发中
