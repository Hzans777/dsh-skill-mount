/**
 * dsh-skill-mount — host half.
 *
 * 1. Serves the tray HTTP API (`/skill-mount/*`) so the browser can list,
 *    mount, note, uninstall, and install skills.
 * 2. Injects the body of every mounted skill into the conversation on the next
 *    pre-step, once per skill, re-arming after compaction drops it.
 *
 * Mounting is a real, per-session behaviour: the skill's instructions land in
 * the transcript as a user message, not merely as a UI flag.
 */
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROUTE_PREFIX, createRouter } from './routes.js'
import { MountState } from './state.js'
import {
  dshHome,
  listRoot,
  readSkillBody,
  stateFile,
  userSkillsRoot,
  workspaceSkillsRoot,
} from './skillfs.js'

export const name = 'dsh-skill-mount'

/** Only the web server is hard-required; everything else is opportunistic. */
export const inject = ['webServer']

const MARKER_PREFIX = '[[dsh-skill-mount:'

/**
 * Read a service without tripping cordis' inject guard.
 * Property access on a context proxy throws for anything outside `inject`;
 * a plugin that only *wants* the service must never let that escape.
 */
function peek(ctx, key) {
  try {
    const viaGet = typeof ctx.get === 'function' ? ctx.get(key) : undefined
    if (viaGet !== undefined && viaGet !== null) return viaGet
  } catch {
    /* not injected through get() either */
  }
  try {
    return ctx[key]
  } catch {
    return undefined
  }
}

/** Workspace registry, tolerating builds that expose it under another id. */
function workspacesOf(ctx) {
  const registry = peek(ctx, 'workspaceRegistry')
  if (registry === undefined || registry === null || typeof registry.list !== 'function') return []
  try {
    return registry.list().map((workspace) => ({
      id: String(workspace?.id ?? ''),
      path: String(workspace?.path ?? ''),
      title: String(workspace?.title ?? workspace?.path ?? ''),
    })).filter((workspace) => workspace.path !== '')
  } catch {
    return []
  }
}

/** Resolve one skill record by name, preferring the session's own workspace. */
function resolveRecord(name, cwd, workspaces) {
  const roots = []
  if (typeof cwd === 'string' && cwd !== '') roots.push({ scope: 'workspace', path: workspaceSkillsRoot(cwd), workspace: cwd })
  roots.push({ scope: 'user', path: userSkillsRoot(), workspace: null })
  for (const workspace of workspaces) {
    roots.push({ scope: 'workspace', path: workspaceSkillsRoot(workspace.path), workspace: workspace.path })
  }
  for (const root of roots) {
    if (!existsSync(root.path)) continue
    const record = listRoot(root.path, root.scope, root.workspace).find((item) => item.name === name)
    if (record !== undefined) return record
  }
  return null
}

/** One injected user message carrying a skill's whole instruction body. */
function mountMessage(name, dir, body, truncated) {
  const marker = `${MARKER_PREFIX}${name}]]`
  const lines = [
    '<system-reminder>',
    `本会话已在输入栏挂载技能「${name}」。下面就是它的全部指令，从现在起（包括本轮）按它执行；不要再调用 skill 工具重复加载同名技能。`,
    `marker: ${marker}`,
    truncated ? `（注：正文过长已截断，完整内容可用 read 工具打开 ${dir}）` : '',
    '',
    `<skill_content name="${escapeAttribute(name)}">`,
    '<skill_resources>',
    dir === ''
      ? 'Resources for this skill are managed by its provider.'
      : `Base directory for this skill: ${dir}`,
    'Resolve relative paths mentioned by this skill against the base directory before using them. Load referenced resources only as needed.',
    '</skill_resources>',
    '',
    '<skill_instructions>',
    body,
    '</skill_instructions>',
    '</skill_content>',
    '</system-reminder>',
  ].filter((line) => line !== '')
  return {
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text: lines.join('\n') }],
    source: { kind: 'skill-invocation', name, form: 'instructions' },
  }
}

/**
 * Load a skill through the harness skill service. This is how built-in and
 * provider-backed skills (the ones with no directory of their own) are mounted.
 * @returns {Promise<{name: string, dir: string, body: string, truncated: boolean} | null>}
 */
async function servicePayload(ctx, name, cwd, agent, signal) {
  const service = peek(ctx, 'skills')
  if (service === undefined || typeof service.get !== 'function') return null
  try {
    const definition = await service.get(name, { cwd, scope: agent, signal })
    if (definition === undefined || definition === null) return null
    const base = definition.resourceBase
    const dir = base?.kind === 'directory' && typeof base.path === 'string' ? base.path : ''
    const body = typeof definition.content === 'string' ? definition.content : ''
    if (body.trim() === '') return null
    const limit = 120000
    const truncated = body.length > limit
    return { name, dir, body: truncated ? `${body.slice(0, limit)}\n\n…（内容过长，已截断）` : body, truncated }
  } catch {
    return null
  }
}

/** List every skill the harness knows about, including built-ins. */
async function serviceCatalog(ctx) {
  const service = peek(ctx, 'skills')
  if (service === undefined || typeof service.snapshot !== 'function') return []
  try {
    const snapshot = await service.snapshot({})
    return Array.isArray(snapshot?.skills) ? snapshot.skills : []
  } catch {
    return []
  }
}

function escapeAttribute(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
}

const OFF_PREFIX = '[[dsh-skill-mount-off:'

/**
 * Fold the transcript into "which skill is currently mounted here".
 * Later messages win, so unmounting and re-mounting the same skill behaves
 * the way the picker reads.
 */
function mountTimeline(messages) {
  const state = new Map()
  for (const message of messages) {
    const content = message?.content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (part?.type !== 'text' || typeof part.text !== 'string') continue
      const offAt = part.text.indexOf(OFF_PREFIX)
      const onAt = offAt < 0 ? part.text.indexOf(MARKER_PREFIX) : -1
      const meta = offAt >= 0 ? { at: offAt, prefix: OFF_PREFIX, value: 'off' } : onAt >= 0 ? { at: onAt, prefix: MARKER_PREFIX, value: 'on' } : null
      if (meta === null) continue
      const start = meta.at + meta.prefix.length
      const end = part.text.indexOf(']]', start)
      if (end < 0) continue
      state.set(part.text.slice(start, end), meta.value)
    }
  }
  return state
}

/** One injected note telling the model a mounted skill stopped applying. */
function unmountMessage(name) {
  return {
    id: randomUUID(),
    role: 'user',
    content: [
      {
        type: 'text',
        text: [
          '<system-reminder>',
          `技能「${name}」已从本会话卸载，它先前的指令不再生效，也不要再调用 skill 工具加载它。`,
          `marker: ${OFF_PREFIX}${name}]]`,
          '</system-reminder>',
        ].join('\n'),
      },
    ],
    source: { kind: 'skill-invocation', name, form: 'instructions' },
  }
}

/**
 * Install the plugin.
 * @param {any} ctx - cordis context.
 * @param {Record<string, unknown>} [config]
 */
export function apply(ctx, config = {}) {
  const state = new MountState(stateFile())
  const workspaces = () => workspacesOf(ctx)
  const handler = createRouter({
    state,
    workspaces,
    serviceSkills: () => serviceCatalog(ctx),
  })

  ctx.effect(() => {
    const dispose = ctx.webServer.register({ kind: 'prefix', path: ROUTE_PREFIX, handler })
    return () => {
      try {
        dispose?.()
      } catch {
        /* ignore */
      }
      state.flush()
    }
  }, 'dsh-skill-mount: routes')

  ctx.on('agent/pre-step', async (session, next) => {
    const decision = await next()
    if (decision?.kind === 'reject' || !Array.isArray(decision?.messages)) return decision
    const agent = session?.agent
    const sessionId = String(agent?.session?.header?.id ?? '')
    const names = state.effective(sessionId)

    const timeline = mountTimeline(decision.messages)
    const pending = names.filter((name) => timeline.get(name) !== 'on')
    const retractions = [...timeline.entries()]
      .filter(([name, value]) => value === 'on' && !names.includes(name))
      .map(([name]) => name)
    if (pending.length === 0 && retractions.length === 0) return decision

    const cwd = agent?.session?.header?.cwd
    const injections = []
    for (const name of retractions) injections.push(unmountMessage(name))
    for (const skillName of pending) {
      try {
        const record = resolveRecord(skillName, cwd, workspaces())
        if (record !== null) {
          const { body, truncated } = readSkillBody(record)
          injections.push(mountMessage(record.name, record.dir, body, truncated))
          continue
        }
        const payload = await servicePayload(ctx, skillName, cwd, agent, session?.signal)
        if (payload !== null) injections.push(mountMessage(payload.name, payload.dir, payload.body, payload.truncated))
      } catch {
        // A single broken skill must not block the turn.
      }
    }
    if (injections.length === 0) return decision
    return { ...decision, messages: [...decision.messages, ...injections] }
  })

  try {
    const log = ctx.logger?.('dsh-skill-mount') ?? ctx.logger
    log?.info?.(`skill tray ready · home=${dshHome()} · state=${join(stateFile())}`)
  } catch {
    /* logging is optional */
  }
}

export default { name, inject, apply }
