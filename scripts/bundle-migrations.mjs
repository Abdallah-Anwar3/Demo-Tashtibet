#!/usr/bin/env node
// Bundle every migration into one SQL file for a fresh Supabase project.
//   node scripts/bundle-migrations.mjs --ref <PROJECT_REF> [--out demo/01-all-migrations.sql]
// 007, 008 and 016 contain our own project ref in cron/http URLs; --ref swaps in the target project's ref.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const get = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d }
const ref = get('ref')
if (!ref || !/^[a-z0-9_]{6,40}$/i.test(ref)) { console.error('Usage: --ref <PROJECT_REF> (Supabase → Project Settings → General → Reference ID)'); process.exit(1) }
const out = resolve(root, get('out', 'demo/01-all-migrations.sql'))
const dir = join(root, 'supabase/migrations')
const files = readdirSync(dir).filter((f) => /^\d+.*\.sql$/.test(f)).sort()
const sql = files.map((f) => `-- ===== ${f} =====\n${readFileSync(join(dir, f), 'utf8')}`).join('\n\n').replaceAll('rragdyhfitbckoznomxm', ref)
writeFileSync(out, sql)
console.log(`${files.length} migrations → ${out}`)
