/**
 * Minimal ZIP reader (stored + deflate entries), dependency free.
 *
 * Only what skill installation needs: walk the central directory, then read
 * each local header to locate its payload. ZIP64 archives are rejected with a
 * readable message instead of silently mis-parsing.
 */
import { inflateRawSync } from 'node:zlib'

const EOCD_SIG = 0x06054b50
const CD_SIG = 0x02014b50
const LFH_SIG = 0x04034b50

export class ZipError extends Error {}

/**
 * Read every file entry of a zip archive.
 * @param {Buffer|Uint8Array} input - archive bytes.
 * @returns {{name: string, data: Buffer}[]} entries with `/`-separated names.
 */
export function unzipEntries(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input)
  if (buffer.length < 22) throw new ZipError('不是有效的 zip 文件（文件太小）')

  const eocd = findEndOfCentralDirectory(buffer)
  if (eocd < 0) throw new ZipError('不是有效的 zip 文件（找不到中央目录）')

  const total = buffer.readUInt16LE(eocd + 10)
  const cdOffset = buffer.readUInt32LE(eocd + 16)
  if (total === 0xffff || cdOffset === 0xffffffff) {
    throw new ZipError('不支持 zip64 归档：请先解压，再用「文件夹」方式安装')
  }

  const entries = []
  let offset = cdOffset
  for (let index = 0; index < total; index += 1) {
    if (offset + 46 > buffer.length) throw new ZipError('zip 中央目录被截断')
    if (buffer.readUInt32LE(offset) !== CD_SIG) throw new ZipError('zip 中央目录损坏')

    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength)

    offset += 46 + nameLength + extraLength + commentLength
    if (name.endsWith('/') || name.endsWith('\\')) continue

    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== LFH_SIG) {
      throw new ZipError(`zip 条目损坏：${name}`)
    }
    const localNameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const raw = buffer.subarray(dataStart, dataStart + compressedSize)

    let data
    if (method === 0) {
      data = Buffer.from(raw)
    } else if (method === 8) {
      try {
        data = inflateRawSync(raw)
      } catch (error) {
        throw new ZipError(`解压失败：${name}（${error instanceof Error ? error.message : String(error)}）`)
      }
    } else {
      throw new ZipError(`不支持的压缩方式 ${method}：${name}`)
    }
    entries.push({ name: name.replaceAll('\\', '/'), data })
  }
  return entries
}

/** Locate the End Of Central Directory record, tolerating an archive comment. */
function findEndOfCentralDirectory(buffer) {
  const floor = Math.max(0, buffer.length - 66000)
  for (let index = buffer.length - 22; index >= floor; index -= 1) {
    if (buffer.readUInt32LE(index) === EOCD_SIG) return index
  }
  return -1
}
