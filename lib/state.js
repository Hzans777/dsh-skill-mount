/**
 * Persisted mount state: per-skill notes (备注名) and per-session mount lists,
 * stored as one small JSON document next to the skills root.
 *
 * Shape: { version: 1, notes: { [skill]: string }, mounts: { [sessionId|'*']: string[] } }
 * The `*` bucket is the global list used by sessions that have no own list —
 * and by the settings page's "全局挂载" switch.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { mkdirSync } from 'node:fs'

export const GLOBAL_KEY = '*'

export class MountState {
  /** @param {string} file - absolute state file path. */
  constructor(file) {
    this.file = file
    this.data = { version: 1, notes: {}, mounts: {} }
    this.timer = null
    this.load()
  }

  load() {
    try {
      if (!existsSync(this.file)) return this
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'))
      if (parsed !== null && typeof parsed === 'object') {
        this.data = {
          version: 1,
          notes: isPlainObject(parsed.notes) ? { ...parsed.notes } : {},
          mounts: isPlainObject(parsed.mounts) ? { ...parsed.mounts } : {},
        }
        for (const [key, value] of Object.entries(this.data.mounts)) {
          if (!Array.isArray(value)) delete this.data.mounts[key]
          else this.data.mounts[key] = value.filter((name) => typeof name === 'string' && name !== '')
        }
      }
    } catch {
      // A corrupt file must never take the host down: start from empty state.
    }
    return this
  }

  /** Debounced atomic persist. */
  save() {
    if (this.timer !== null) return
    this.timer = setTimeout(() => {
      this.timer = null
      try {
        mkdirSync(dirname(this.file), { recursive: true })
        const temporary = `${this.file}.tmp-${process.pid}`
        writeFileSync(temporary, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8')
        renameSync(temporary, this.file)
      } catch {
        /* state is best-effort; never throw into a pre-step hook */
      }
    }, 250)
    if (typeof this.timer.unref === 'function') this.timer.unref()
  }

  /** Flush synchronously (used on plugin dispose). */
  flush() {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      writeFileSync(this.file, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8')
    } catch {
      /* ignore */
    }
  }

  notes() {
    return { ...this.data.notes }
  }

  /** Set or clear one skill's display note. */
  setNote(name, note) {
    const text = typeof note === 'string' ? note.trim() : ''
    if (text === '') delete this.data.notes[name]
    else this.data.notes[name] = text.slice(0, 80)
    this.save()
    return text
  }

  /** Raw list for one bucket (`*` for global), without fallback. */
  rawMounts(key) {
    const list = this.data.mounts[key]
    return Array.isArray(list) ? [...list] : null
  }

  /** Effective mounts for a session: its own list, else the global list. */
  effective(sessionId) {
    const own = sessionId ? this.rawMounts(sessionId) : null
    if (own !== null) return own
    return this.rawMounts(GLOBAL_KEY) ?? []
  }

  /** Replace one bucket entirely. */
  setMounts(key, names) {
    const unique = [...new Set((Array.isArray(names) ? names : []).filter((name) => typeof name === 'string' && name !== ''))]
    if (unique.length === 0) delete this.data.mounts[key]
    else this.data.mounts[key] = unique
    this.save()
    return unique
  }

  /**
   * Toggle one skill for a session, seeding the session list from the current
   * effective list so the first toggle does not drop the inherited mounts.
   */
  toggle(sessionId, name, mounted) {
    const key = sessionId && sessionId !== '' ? sessionId : GLOBAL_KEY
    const current = this.rawMounts(key) ?? this.effective(sessionId)
    const next = mounted
      ? [...current, name]
      : current.filter((item) => item !== name)
    return this.setMounts(key, next)
  }

  /** Drop every mount of one session (and its key). */
  clear(sessionId) {
    const key = sessionId && sessionId !== '' ? sessionId : GLOBAL_KEY
    delete this.data.mounts[key]
    this.save()
    return []
  }

  /** Forget notes/entries of an uninstalled skill. */
  forget(name) {
    delete this.data.notes[name]
    for (const [key, list] of Object.entries(this.data.mounts)) {
      const next = list.filter((item) => item !== name)
      if (next.length === 0) delete this.data.mounts[key]
      else this.data.mounts[key] = next
    }
    this.save()
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
