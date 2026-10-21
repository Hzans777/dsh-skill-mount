/**
 * HTTP surface of the skill tray: one prefix (`/skill-mount`) under the
 * harness web server, speaking JSON to the browser UI.
 *
 * Every mutating route is loopback + same-origin pinned, because installing or
 * uninstalling writes files with the host user's permissions.
 */
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import {
  MAX_ARCHIVE_BYTES,
  SkillFsError,
  installFromDirectory,
  installFromZip,
  listRoot,
  removeSkill,
  trashRoot,
  userSkillsRoot,
  workspaceSkillsRoot,
} from './skillfs.js'
import { GLOBAL_KEY } from './state.js'

export const ROUTE_PREFIX = '/skill-mount'

/** Write a JSON payload with no-store caching. */
function sendJson(response, status, payload) {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(payload))
}

/**
 * Same-origin check that tolerates a request with no Origin header: browsers
 * attach Origin to every cross-site POST, and a loopback socket plus a missing
 * Origin is the desktop renderer talking to its own server.
 */
function sameOrigin(request) {
  const origin = request.headers.origin
  const host = request.headers.host
  if (host === undefined) return false
  if (origin === undefined) return true
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

function isLoopback(request) {
  const address = request.socket?.remoteAddress ?? ''
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

/** Null when the request may mutate, else a human-readable reason. */
function assertLocalMutation(request) {
  if (!sameOrigin(request)) return '跨站请求已拒绝'
  if (!isLoopback(request)) return '只允许本机请求'
  return null
}

async function readBody(request, maxBytes = 1024 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > maxBytes) throw new SkillFsError('请求体过大')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

async function readJsonBody(request, maxBytes = 256 * 1024) {
  const raw = (await readBody(request, maxBytes)).toString('utf8').trim()
  if (raw === '') return {}
  try {
    return JSON.parse(raw)
  } catch {
    throw new SkillFsError('请求体不是合法 JSON')
  }
}

function asString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

/**
 * Build the router.
 * @param {{
 *   state: import('./state.js').MountState,
 *   workspaces: () => {id: string, path: string, title: string}[],
 *   serviceSkills?: () => Promise<{name: string, description?: string, provider?: string}[]>,
 * }} deps
 */
export function createRouter(deps) {
  const { state, workspaces, serviceSkills } = deps

  /** Every discovery root, user first. */
  const roots = () => {
    const list = [{ scope: 'user', path: userSkillsRoot(), workspace: null }]
    const seen = new Set([list[0].path.toLowerCase()])
    for (const workspace of workspaces()) {
      const path = workspaceSkillsRoot(workspace.path)
      if (seen.has(path.toLowerCase())) continue
      if (!existsSync(path)) continue
      seen.add(path.toLowerCase())
      list.push({ scope: 'workspace', path, workspace: workspace.path })
    }
    return list
  }

  /**
   * Flat catalog with notes merged in, first root wins per skill name.
   * Skills that only the harness skill service knows about (built-ins shipped
   * inside the app, preset skills) are appended read-only so the picker shows
   * everything the model could actually load.
   */
  const catalog = async () => {
    const notes = state.notes()
    const seen = new Set()
    const skills = []
    for (const root of roots()) {
      for (const record of listRoot(root.path, root.scope, root.workspace)) {
        if (seen.has(record.name)) continue
        seen.add(record.name)
        skills.push({
          name: record.name,
          dirName: record.dirName,
          note: notes[record.name] ?? '',
          description: record.description,
          scope: record.scope,
          workspace: record.workspace,
          dir: record.dir,
          flat: record.flat,
          uninstallable: true,
        })
      }
    }
    let extra = []
    try {
      extra = serviceSkills === undefined ? [] : await serviceSkills()
    } catch {
      extra = []
    }
    for (const summary of extra) {
      const name = asString(summary?.name)
      if (name === '' || seen.has(name)) continue
      seen.add(name)
      skills.push({
        name,
        dirName: '',
        note: notes[name] ?? '',
        description: asString(summary?.description),
        scope: 'builtin',
        workspace: null,
        dir: asString(summary?.path),
        flat: false,
        uninstallable: false,
      })
    }
    skills.sort((a, b) => (a.note || a.name).localeCompare(b.note || b.name, 'zh-Hans-CN'))
    return skills
  }

  const findRecord = (name) => {
    for (const root of roots()) {
      const record = listRoot(root.path, root.scope, root.workspace).find((item) => item.name === name)
      if (record !== undefined) return record
    }
    return null
  }

  const snapshot = async (sessionId) => {
    const id = asString(sessionId)
    return {
      ok: true,
      sessionId: id,
      mounts: state.effective(id),
      ownMounts: id === '' ? null : state.rawMounts(id),
      globalMounts: state.rawMounts(GLOBAL_KEY) ?? [],
      notes: state.notes(),
      skills: await catalog(),
      roots: {
        user: userSkillsRoot(),
        trash: trashRoot(),
        workspaces: roots().filter((root) => root.scope === 'workspace').map((root) => root.path),
      },
    }
  }

  const installTarget = (scope, workspacePath) => {
    if (scope === 'workspace') {
      if (workspacePath === '' || workspacePath === null || workspacePath === undefined) {
        throw new SkillFsError('工作区路径缺失')
      }
      return workspaceSkillsRoot(String(workspacePath))
    }
    return userSkillsRoot()
  }

  return async function handle(request, response) {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const sub = url.pathname.slice(ROUTE_PREFIX.length) || '/'
    try {
      if (request.method === 'GET' && (sub === '/state' || sub === '/')) {
        sendJson(response, 200, await snapshot(url.searchParams.get('sessionId') ?? ''))
        return
      }

      if (request.method === 'POST' && sub === '/toggle') {
        const denied = assertLocalMutation(request)
        if (denied !== null) return sendJson(response, 403, { ok: false, error: denied })
        const body = await readJsonBody(request)
        const name = asString(body.name)
        if (name === '') throw new SkillFsError('缺少技能名')
        const mounts = state.toggle(asString(body.sessionId), name, body.mounted === true)
        sendJson(response, 200, { ok: true, mounts, ...(await snapshot(asString(body.sessionId))) })
        return
      }

      if (request.method === 'POST' && sub === '/mounts') {
        const denied = assertLocalMutation(request)
        if (denied !== null) return sendJson(response, 403, { ok: false, error: denied })
        const body = await readJsonBody(request)
        const sessionId = asString(body.sessionId)
        const key = sessionId === '' ? GLOBAL_KEY : sessionId
        const mounts = state.setMounts(key, Array.isArray(body.names) ? body.names : [])
        sendJson(response, 200, { ok: true, mounts, ...(await snapshot(sessionId)) })
        return
      }

      if (request.method === 'POST' && sub === '/clear') {
        const denied = assertLocalMutation(request)
        if (denied !== null) return sendJson(response, 403, { ok: false, error: denied })
        const body = await readJsonBody(request)
        const sessionId = asString(body.sessionId)
        state.clear(sessionId)
        sendJson(response, 200, { ok: true, ...(await snapshot(sessionId)) })
        return
      }

      if (request.method === 'POST' && sub === '/note') {
        const denied = assertLocalMutation(request)
        if (denied !== null) return sendJson(response, 403, { ok: false, error: denied })
        const body = await readJsonBody(request)
        const name = asString(body.name)
        if (name === '') throw new SkillFsError('缺少技能名')
        const note = state.setNote(name, asString(body.note))
        sendJson(response, 200, { ok: true, name, note, ...(await snapshot(asString(body.sessionId))) })
        return
      }

      if (request.method === 'POST' && sub === '/remove') {
        const denied = assertLocalMutation(request)
        if (denied !== null) return sendJson(response, 403, { ok: false, error: denied })
        const body = await readJsonBody(request)
        const name = asString(body.name)
        if (name === '') throw new SkillFsError('缺少技能名')
        const record = findRecord(name)
        if (record === null) throw new SkillFsError(`没有找到技能「${name}」`)
        const moved = removeSkill(record)
        state.forget(name)
        sendJson(response, 200, { ok: true, name, trash: moved, ...(await snapshot(asString(body.sessionId))) })
        return
      }

      if (request.method === 'POST' && sub === '/install') {
        const denied = assertLocalMutation(request)
        if (denied !== null) return sendJson(response, 403, { ok: false, error: denied })
        const body = await readJsonBody(request)
        const source = asString(body.path).trim()
        if (source === '') throw new SkillFsError('请填写本地路径')
        const target = installTarget(asString(body.scope, 'user'), asString(body.workspace) || null)
        const installed = installFromDirectory(source, target)
        sendJson(response, 200, { ok: true, installed, target, ...(await snapshot(asString(body.sessionId))) })
        return
      }

      if (request.method === 'POST' && sub === '/install-zip') {
        const denied = assertLocalMutation(request)
        if (denied !== null) return sendJson(response, 403, { ok: false, error: denied })
        const bytes = await readBody(request, MAX_ARCHIVE_BYTES)
        const target = installTarget(
          url.searchParams.get('scope') ?? 'user',
          url.searchParams.get('workspace') ?? null,
        )
        const installed = installFromZip(bytes, target)
        sendJson(response, 200, { ok: true, installed, target, ...(await snapshot(url.searchParams.get('sessionId') ?? '')) })
        return
      }

      if (request.method === 'POST' && sub === '/reveal') {
        const denied = assertLocalMutation(request)
        if (denied !== null) return sendJson(response, 403, { ok: false, error: denied })
        const body = await readJsonBody(request)
        const which = asString(body.which, 'user')
        const target = which === 'trash' ? trashRoot() : userSkillsRoot()
        try {
          if (process.platform === 'win32') spawn('explorer.exe', [target], { detached: true, stdio: 'ignore' }).unref()
          else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [target], { detached: true, stdio: 'ignore' }).unref()
        } catch {
          /* opening a folder is a convenience, not a contract */
        }
        sendJson(response, 200, { ok: true, path: target })
        return
      }

      sendJson(response, 404, { ok: false, error: 'not found' })
    } catch (error) {
      const message = error instanceof Error ? error.message : '内部错误'
      const status = error instanceof SkillFsError ? 400 : 500
      sendJson(response, status, { ok: false, error: message })
    }
  }
}
