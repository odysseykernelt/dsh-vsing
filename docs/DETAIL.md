# 虚拟歌姬工作台（骨架版 0.1.0）

以「歌词轴」为中心的虚拟歌姬工程。这一版只做一件事：把**工程文件**和**轴 → 音符 → 导出**这条最短闭环跑通，其他能力（对齐、音频、面板、格式互转）留出位置，不做假装。

## 现在能做什么

| 动作 | 工具 | HTTP |
|---|---|---|
| 新建/打开工程 | `wb_open` | `POST /dsh-vsing/api/projects` |
| 看工程列表/摘要 | `wb_status` | `GET /dsh-vsing/api/projects` |
| 导入歌词 → 逐字时间轴 | `wb_lyrics` | `POST …/projects/:id/lyrics` |
| 轴 → 音符草稿 | `wb_notes` | `POST …/projects/:id/notes` |
| 导出 LRC / USTX | `wb_export` | `POST …/projects/:id/export` |
| 打轴 | `wb_align` | — |

工程默认放在 `<DSH_HOME>/vsing/projects/<id>/`，可在 `cordis.patch.yml` 的 `projectsDir` 改。

```
<id>/
  project.vproj     # 工程本体，JSON
  out/              # lyrics.lrc、vocal.ustx
  cache/            # 中间产物，可见，不藏
```

## 诚实的边界

- **时间是占位的。** `wb_lyrics` 没有音频可对齐，按句等分给字，`provenance[].estimated = true` 标着；后面真打轴会替换它，不会伪装成测量结果。
- **音高一律 C4。** 音符草稿不猜旋律；`follow-vocal` 要等 F0 提取接上，现在等同 `square`。
- **`wb_align` 会失败。** 返回 `aligner_not_configured` 并说明下一步，不写空轴糊过去。
- **USTX 未在 OpenUtau 里打开验证。** 字段按 `OpenUtau.Core/Format/USTx.cs` 写，只输出能填的键。

## 工程文件

`.vproj`，schema `vproj/1`：`meta` / `lyrics.chars` / `notes`（ufdata 形状）/ `tracks` / `palette` / `video` / `render` / `provenance`。

音符层用 ufdata 的形状（tick = 1/480 拍，C4 = 60），等格式互转接上时不需要迁移。`provenance` 是数组，每一步追加一条，可以回溯谁做的、什么参数、是不是估计值。

## 下一步

1. 面板（四区界面 + 任务队列）——现在只有 API。
2. 对齐器接入（WhisperX / SOFA），`wb_align` 从「明确失败」变成「真能跑」。
3. ufdata 往返（`@sevenc-nanashi/utaformatix-ts`），接 ust/ustx/vsqx/mid/musicxml。
4. 音频：MeltySynth 伴奏 + 假插件桥拿人声。
