# dsh-skill-mount · 技能挂载

DeepSeek Harness 插件：把 SKILL 变成聊天栏里可开关的挂载项。

输入框右侧多一个「🧩 技能」按钮，点开就能勾选／关闭本会话要挂载的 SKILL；设置里多一页「技能挂载」，可以给每个 SKILL 起备注（备注名会直接显示在聊天栏选择器里），也能卸载、本地安装。

> A DeepSeek Harness plugin: mount skills from the chat bar, rename them with your own notes, uninstall and install local skills from Settings.

## 安装

```powershell
git clone https://github.com/zshlove321-cyber/dsh-skill-mount.git "$env:USERPROFILE\.dsh\plugins\dsh-skill-mount"

New-Item -ItemType Junction `
  -Path "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-skill-mount" `
  -Target "$env:USERPROFILE\.dsh\plugins\dsh-skill-mount"
```

再改 `~/.dsh/profiles/desktop/package.json`：`dependencies` 里加 `"dsh-skill-mount": "file:../../plugins/dsh-skill-mount"`，`dsh.profile.bundles` 里加 `"dsh-skill-mount"`，然后重启 DeepSeek Harness。

零依赖、无构建步骤：源码就是运行时代码，改完重启即生效。

## 组成

| 位置 | 作用 |
| --- | --- |
| `lib/index.js` | 宿主半边：注册 `/skill-mount/*` HTTP 接口，并在 `agent/pre-step` 里把已挂载技能的全部指令注入当前会话 |
| `lib/routes.js` | 接口实现（state / toggle / note / remove / install / install-zip / reveal） |
| `lib/skillfs.js` | 扫 `~/.dsh/skills`、`<workspace>/.dsh/skills`，解析 `SKILL.md`，安装 zip／文件夹，卸载进回收站 |
| `lib/state.js` | 挂载表与备注，落在 `$DSH_HOME/skill-mount.json` |
| `client/client.js` | 浏览器半边：`conversation.input.right` 托盘 + `settings.section` 设置页 |
| `cordis.patch.yml` | 把本插件插进 profile 的插件树 |

## 用法

1. **挂载**：输入框右侧「🧩 技能」→ 勾选。勾上的技能，其 `SKILL.md` 正文会在下一次发消息时以 `<skill_content>` 注入当前会话，模型直接按它执行，不用再调 `skill` 工具。
2. **关闭**：再点一次取消勾选；下一轮会注入一条「已卸载」提示，让模型停止沿用旧指令。「全部关闭」一键清空本会话。
3. **备注**：设置 → 技能挂载 → 每行的备注输入框，失焦即保存。备注名会替换聊天栏列表里显示的名字，真实 `name` 仍以小字显示。
4. **全局挂载**：设置页那张表格里的 ●/○，对**所有新会话**默认挂载。
5. **安装**：设置页填本地路径（文件夹或 `.zip`），或点「选择 .zip 上传安装」。
6. **卸载**：设置页行尾「卸载」→ 再点一次「确认卸载」；文件移到 `$DSH_HOME/skills-trash/<时间戳>-<名字>`，可手动恢复。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/skill-mount/state?sessionId=` | 技能清单 + 挂载表 + 备注 |
| POST | `/skill-mount/toggle` | `{sessionId, name, mounted}`；`sessionId` 为空即全局 |
| POST | `/skill-mount/mounts` | `{sessionId, names}` 整体覆盖 |
| POST | `/skill-mount/clear` | `{sessionId}` 清空 |
| POST | `/skill-mount/note` | `{name, note}` 备注 |
| POST | `/skill-mount/remove` | `{name}` 卸载到回收站 |
| POST | `/skill-mount/install` | `{path, scope}` 安装文件夹／zip |
| POST | `/skill-mount/install-zip?filename=` | 请求体直接是 zip 字节 |
| POST | `/skill-mount/reveal` | `{which: "user" \| "trash"}` 打开目录 |

写操作只接受回环地址 + 同源 `Origin`，与 DSH 其他本地插件的约定一致。

## 状态文件

`$DSH_HOME/skill-mount.json`

```json
{
  "version": 1,
  "mounts": { "<sessionId>": ["novel-to-storyboard"], "*": ["prompt-semantic-compiler"] },
  "notes": { "novel-to-storyboard": "分镜" }
}
```

`*` 是全局挂载键：会话自己的列表优先，没有自己的列表时用全局。

## 安装 / 升级

```powershell
# 1. 放进 ~/.dsh/plugins（见上面「安装」）
# 2. 链进 profile（或改 package.json 依赖后 pnpm install）
New-Item -ItemType Junction `
  -Path "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-skill-mount" `
  -Target "$env:USERPROFILE\.dsh\plugins\dsh-skill-mount"
# 3. profiles\desktop\package.json：dependencies 加 "dsh-skill-mount": "file:../../plugins/dsh-skill-mount"
#    dsh.profile.bundles 加 "dsh-skill-mount"
# 4. 重启 DeepSeek Harness
```

升级就是 `git -C "$env:USERPROFILE\.dsh\plugins\dsh-skill-mount" pull` 再重启。

## 边界

- 挂载 = 把技能指令写进会话，不是给 `skill` 工具加白名单；产品自带的 `<available_skills>` 目录仍列出全部已装技能，模型仍可能主动加载未挂载的技能。
- 注入是一次性的：每轮只在「会话里还没有该技能正文」时补一次，历史被压缩掉后会重新补。
- 技能正文超过 120000 字符会截断，注入消息里会给出目录路径提示。

## 技能来源

清单同时列出两类技能：$DSH_HOME/skills（及工作区 .dsh/skills）里的磁盘技能，和 harness 内置/提供者技能（office-docx 等）。内置技能没有自己的目录，卸载按钮显示「内置技能，不可卸载」；挂载时它们的正文通过 skills 服务读取。