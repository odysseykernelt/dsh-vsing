import fs from 'node:fs'
import path from 'node:path'

const asar = process.argv[2]
const outDir = process.argv[3]
const filter = process.argv[4] ? new RegExp(process.argv[4]) : null

const fd = fs.openSync(asar, 'r')
const head = Buffer.alloc(16)
fs.readSync(fd, head, 0, 16, 0)
const headerSize = head.readUInt32LE(12)
const jsonBuf = Buffer.alloc(headerSize)
fs.readSync(fd, jsonBuf, 0, headerSize, 16)
const header = JSON.parse(jsonBuf.toString('utf8').replace(/\0+$/, ''))
const baseOffset = 8 + headerSize

const results = []
function walk(node, prefix) {
  for (const [name, entry] of Object.entries(node.files || {})) {
    const p = prefix ? `${prefix}/${name}` : name
    if (entry.files) walk(entry, p)
    else results.push({ p, size: entry.size, offset: entry.offset, unpacked: entry.unpacked })
  }
}
walk(header, '')
console.log('entries:', results.length)

const picked = results.filter(r => !filter || filter.test(r.p)).filter(r => r.size != null && !r.unpacked)
console.log('picked:', picked.length)

for (const r of picked) {
  const target = path.join(outDir, r.p)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const buf = Buffer.alloc(Number(r.size))
  fs.readSync(fd, buf, 0, Number(r.size), baseOffset + Number(r.offset))
  fs.writeFileSync(target, buf)
}
fs.closeSync(fd)
console.log('written to', outDir)
