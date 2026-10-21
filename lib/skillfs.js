/**
 * Skill filesystem layer: discovery roots, SKILL.md parsing, install from a
 * folder or a zip archive, and uninstall into a recoverable trash folder.
 *
 * Nothing here depends on the harness skill service, so the plugin keeps
 * working (listing + mounting) even when a given DSH build moves that service.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { ZipError, unzipEntries } from './zip.js'

/** Directory-name / skill-name shape accepted by the harness. */
export const SKILL_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/** Upper bound for one installed skill on disk (bytes). */
const MAX_SKILL_BYTES = 64 * 1024 * 1024

/** Upper bound for one zip archive (bytes). */
export const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024

export class SkillFsError extends Error {}

/** `$DSH_HOME` when set, else `~/.dsh`. */
export function dshHome() {
  const configured = process.env.DSH_HOME
  if (typeof configured === 'string' && configured.trim() !== '') return resolve(configured.trim())
  return join(homedir(), '.dsh')
}

/** Machine-global skill root. */
export function userSkillsRoot() {
  return join(dshHome(), 'skills')
}

/** Workspace-local skill root. */
export function workspaceSkillsRoot(workspacePath) {
  return join(workspacePath, '.dsh', 'skills')
}

/** Recoverable uninstall destination. */
export function trashRoot() {
  return join(dshHome(), 'skills-trash')
}

/** State file holding notes and per-session mounts. */
export function stateFile() {
  return join(dshHome(), 'skill-mount.json')
}

/**
 * Split a SKILL.md into frontmatter fields and body, tolerating the simple
 * `key: value` (plus indented continuation) subset that skills actually use.
 * @param {string} text - file contents.
 * @param {string} fallbackName - name to use when frontmatter has none.
 */
export function parseSkillFile(text, fallbackName) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
  if (match === null) return { name: fallbackName, description: '', whenToUse: '', body: text }

  const fields = {}
  let current = null
  for (const line of (match[1] ?? '').split(/\r?\n/)) {
    if (line.trim() === '') continue
    const pair = /^([A-Za-z0-9_.-]+):\s*(.*)$/.exec(line)
    if (pair !== null) {
      current = pair[1]
      fields[current] = pair[2] ?? ''
      continue
    }
    if (current !== null && /^\s+\S/.test(line)) {
      fields[current] = `${fields[current]} ${line.trim()}`.trim()
    }
  }

  const clean = (value) => (typeof value === 'string'
    ? value.replace(/^["']/, '').replace(/["']$/, '').replace(/\s+/g, ' ').trim()
    : '')
  return {
    name: clean(fields.name) || fallbackName,
    description: clean(fields.description),
    whenToUse: clean(fields.whenToUse ?? fields['when-to-use']),
    body: match[2] ?? '',
  }
}

/**
 * List skill bundles under one root.
 * @param {string} root - absolute skills directory.
 * @param {'user'|'workspace'} scope
 * @param {string} [workspacePath]
 */
export function listRoot(root, scope, workspacePath) {
  if (!existsSync(root)) return []
  const found = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const absolute = join(root, entry.name)
    if (entry.isDirectory()) {
      const file = join(absolute, 'SKILL.md')
      if (!existsSync(file)) continue
      const parsed = parseSkillFile(readFileSync(file, 'utf8'), entry.name)
      found.push({
        name: parsed.name,
        dirName: entry.name,
        description: parsed.description,
        scope,
        workspace: workspacePath ?? null,
        dir: absolute,
        file,
        flat: false,
      })
      continue
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      const parsed = parseSkillFile(readFileSync(absolute, 'utf8'), entry.name.slice(0, -3))
      found.push({
        name: parsed.name,
        dirName: entry.name,
        description: parsed.description,
        scope,
        workspace: workspacePath ?? null,
        dir: root,
        file: absolute,
        flat: true,
      })
    }
  }
  return found
}

/**
 * Read one skill body (frontmatter stripped), truncated to a context-safe size.
 * @param {{file: string, name: string}} record
 * @param {number} [maxChars]
 */
export function readSkillBody(record, maxChars = 120000) {
  const text = readFileSync(record.file, 'utf8')
  const parsed = parseSkillFile(text, record.name)
  const body = parsed.body.trim()
  if (body.length <= maxChars) return { body, truncated: false, description: parsed.description }
  return { body: `${body.slice(0, maxChars)}\n\n…（内容过长，已截断）`, truncated: true, description: parsed.description }
}

/**
 * Move one skill into the trash folder instead of deleting it.
 * @param {{dirName: string, dir: string, file: string, flat: boolean}} record
 * @returns {string} trash destination
 */
export function removeSkill(record) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const target = join(trashRoot(), `${stamp}-${record.dirName.replace(/\.md$/i, '')}`)
  mkdirSync(trashRoot(), { recursive: true })
  const source = record.flat ? record.file : record.dir
  try {
    renameSync(source, target)
  } catch {
    // Cross-device move or a locked file: copy then drop the original.
    cpSync(source, target, { recursive: true, force: true })
    try {
      renameSync(source, `${source}.deleted-${Date.now()}`)
    } catch {
      /* leave the original in place; the copy still landed */
    }
  }
  return target
}

/** Reject names that could escape the target root. */
function safeName(value) {
  const name = String(value ?? '').trim()
  if (!SKILL_NAME_RE.test(name)) throw new SkillFsError(`技能名不合法：${name || '(空)'}`)
  return name
}

/** Copy one bundle directory into a root, refusing to overwrite. */
function copyBundle(sourceDir, targetRoot) {
  const parsed = parseSkillFile(readFileSync(join(sourceDir, 'SKILL.md'), 'utf8'), basename(sourceDir))
  const name = safeName(SKILL_NAME_RE.test(parsed.name) ? parsed.name : basename(sourceDir))
  const destination = join(targetRoot, name)
  if (existsSync(destination)) throw new SkillFsError(`技能「${name}」已存在，请先卸载旧版本`)
  mkdirSync(targetRoot, { recursive: true })
  cpSync(sourceDir, destination, { recursive: true })
  return name
}

/** True when `path` is a directory holding a SKILL.md. */
function isBundle(path) {
  try {
    return existsSync(join(path, 'SKILL.md'))
  } catch {
    return false
  }
}

/**
 * Install from a local folder. Accepts either a bundle directory itself or a
 * container folder holding one or more bundle directories.
 * @param {string} sourcePath
 * @param {string} targetRoot
 * @returns {string[]} installed skill names
 */
export function installFromDirectory(sourcePath, targetRoot) {
  const source = resolve(sourcePath)
  if (!existsSync(source)) throw new SkillFsError(`路径不存在：${source}`)
  if (!statSync(source).isDirectory()) throw new SkillFsError('请选择文件夹，或改用 zip 安装')

  if (isBundle(source)) return [copyBundle(source, targetRoot)]

  const installed = []
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('.')) continue
    const child = join(source, entry.name)
    if (isBundle(child)) {
      installed.push(copyBundle(child, targetRoot))
      continue
    }
    // One wrapper level: `container/skill-name/SKILL.md`.
    const inner = readdirSync(child, { withFileTypes: true }).filter((item) => item.isDirectory() && !item.name.startsWith('.'))
    if (inner.length === 1) {
      const nested = join(child, inner[0].name)
      if (isBundle(nested)) installed.push(copyBundle(nested, targetRoot))
    }
  }
  if (installed.length === 0) throw new SkillFsError('文件夹里没有找到 SKILL.md')
  return installed
}

/** Normalize one zip entry path into safe parts, or null when unusable. */
function entryParts(name) {
  const normalized = String(name ?? '').replaceAll('\\', '/')
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) return null
  const parts = normalized.split('/').filter((part) => part !== '')
  if (parts.length === 0) return null
  if (parts.some((part) => part === '..' || part === '.')) return null
  return parts
}

/**
 * Install skills from zip bytes.
 * @param {Buffer} bytes
 * @param {string} targetRoot
 * @returns {string[]} installed skill names
 */
export function installFromZip(bytes, targetRoot) {
  if (bytes.length > MAX_ARCHIVE_BYTES) throw new SkillFsError('压缩包超过 64 MB 上限')
  let entries
  try {
    entries = unzipEntries(bytes)
  } catch (error) {
    if (error instanceof ZipError) throw new SkillFsError(error.message)
    throw error
  }

  const usable = []
  for (const entry of entries) {
    const parts = entryParts(entry.name)
    if (parts === null) continue
    if (parts[0].startsWith('.') || parts[0] === '__MACOSX') continue
    usable.push({ parts, data: entry.data })
  }
  if (usable.length === 0) throw new SkillFsError('压缩包里没有可用文件')

  const groups = new Map()
  for (const item of usable) {
    const key = item.parts[0]
    const list = groups.get(key) ?? []
    list.push(item)
    groups.set(key, list)
  }

  // Flat `<name>.md` archives: every top entry is a markdown file.
  const flatOnly = [...groups.keys()].every((key) => key.toLowerCase().endsWith('.md')
    && (groups.get(key) ?? []).every((item) => item.parts.length === 1))
  if (flatOnly) {
    const installed = []
    for (const [key, list] of groups) {
      const name = safeName(key.slice(0, -3))
      const destination = join(targetRoot, name)
      if (existsSync(destination)) throw new SkillFsError(`技能「${name}」已存在，请先卸载旧版本`)
      mkdirSync(destination, { recursive: true })
      writeFileSync(join(destination, 'SKILL.md'), list[0].data)
      installed.push(name)
    }
    return installed
  }

  // A single wrapper folder: strip it when the bundles live one level deeper.
  let effective = usable
  if (groups.size === 1) {
    const [key, list] = [...groups.entries()][0]
    if (!key.toLowerCase().endsWith('.md')) {
      const hasTopSkillFile = list.some((item) => item.parts.length === 2 && item.parts[1] === 'SKILL.md')
      if (!hasTopSkillFile) {
        effective = list
          .filter((item) => item.parts.length > 1)
          .map((item) => ({ parts: item.parts.slice(1), data: item.data }))
      }
    }
  }

  const bundles = new Map()
  for (const item of effective) {
    const [head, ...rest] = item.parts
    const bundle = bundles.get(head) ?? []
    bundle.push({ parts: rest, data: item.data })
    bundles.set(head, bundle)
  }

  const installed = []
  for (const [head, files] of bundles) {
    if (head.toLowerCase().endsWith('.md') && files.length === 1 && files[0].parts.length === 0) {
      const name = safeName(head.slice(0, -3))
      writeBundle(targetRoot, name, [{ parts: ['SKILL.md'], data: files[0].data }])
      installed.push(name)
      continue
    }
    const skillFile = files.find((item) => item.parts.length === 1 && item.parts[0] === 'SKILL.md')
    if (skillFile === undefined) continue
    const parsed = parseSkillFile(String(skillFile.data.toString('utf8')), head)
    const name = safeName(SKILL_NAME_RE.test(parsed.name) ? parsed.name : head)
    writeBundle(targetRoot, name, files)
    installed.push(name)
  }
  if (installed.length === 0) throw new SkillFsError('压缩包里没有找到 SKILL.md')
  return installed
}

/** Write one bundle (relative path parts + bytes) under `<root>/<name>/`. */
function writeBundle(targetRoot, name, files) {
  const destination = join(targetRoot, name)
  if (existsSync(destination)) throw new SkillFsError(`技能「${name}」已存在，请先卸载旧版本`)
  let total = 0
  for (const file of files) {
    const relative = file.parts.join('/')
    const absolute = join(destination, relative)
    const rootPrefix = resolve(destination)
    if (!resolve(absolute).startsWith(rootPrefix)) throw new SkillFsError(`压缩包条目越界：${relative}`)
    total += file.data.length
    if (total > MAX_SKILL_BYTES) throw new SkillFsError('技能体积超过 64 MB 上限')
    mkdirSync(join(absolute, '..'), { recursive: true })
    writeFileSync(absolute, file.data)
  }
}
