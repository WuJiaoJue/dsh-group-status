#!/usr/bin/env tsx
/**
 * Check whether the upstream `@deepseek-ai/dsh-client-ui-workspace` package
 * has changed since we last vendored it.
 *
 * Usage:
 *   pnpm check-upstream          # compare vendored vs latest
 *   pnpm check-upstream --json   # machine-readable output
 *
 * Exit codes:
 *   0 — up to date (vendored matches latest)
 *   1 — upstream has changed (rebase needed)
 *   2 — error (network, registry, etc.)
 *
 * @module
 */
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const UPSTREAM_PACKAGE = '@deepseek-ai/dsh-client-ui-workspace'
const VENDOR_DIR = 'src/vendor'

interface CheckResult {
  upstreamVersion: string
  vendoredHash: string
  upstreamHash: string
  upToDate: boolean
  changedFiles: string[]
}

/**
 * Compute a deterministic hash of a directory's contents (sorted file paths + contents).
 */
function hashDirectory(dir: string): string {
  const hash = createHash('sha256')
  const files: string[] = []

  function walk(current: string) {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry)
      const stat = statSync(full)
      if (stat.isDirectory()) {
        walk(full)
      } else if (stat.isFile()) {
        files.push(relative(dir, full))
      }
    }
  }

  walk(dir)
  files.sort()

  for (const file of files) {
    hash.update(file)
    hash.update(readFileSync(join(dir, file)))
  }

  return hash.digest('hex')
}

/**
 * Fetch the latest version of the upstream package from npm.
 */
function fetchUpstreamVersion(): string {
  try {
    const output = execSync(`npm view ${UPSTREAM_PACKAGE} version`, { encoding: 'utf-8' })
    return output.trim()
  } catch (error) {
    console.error(`Failed to fetch upstream version: ${error}`)
    process.exit(2)
  }
}

/**
 * Download the upstream package to a temp directory and hash it.
 */
function fetchUpstreamHash(version: string): { hash: string; dir: string } {
  const tmpDir = `/tmp/dsh-upstream-${version}`
  try {
    execSync(`mkdir -p ${tmpDir} && cd ${tmpDir} && npm pack ${UPSTREAM_PACKAGE}@${version} && tar -xzf *.tgz --strip-components=1`, {
      encoding: 'utf-8',
      stdio: 'pipe',
    })
    // Hash only the src/ directory to match our vendored structure
    const srcDir = join(tmpDir, 'src')
    return { hash: hashDirectory(srcDir), dir: srcDir }
  } catch (error) {
    console.error(`Failed to download upstream package: ${error}`)
    process.exit(2)
  }
}

/**
 * Compare vendored files with upstream and list changed files.
 */
function diffVendored(upstreamDir: string): string[] {
  const changed: string[] = []
  const vendorSrc = join(VENDOR_DIR, 'src')

  function safeReaddirSync(dir: string): string[] {
    try { return readdirSync(dir) } catch { return [] }
  }

  function safeStatSync(path: string): ReturnType<typeof statSync> | null {
    try { return statSync(path) } catch { return null }
  }

  function walk(upstream: string, vendor: string, rel: string) {
    const upstreamEntries = safeReaddirSync(upstream)

    for (const entry of upstreamEntries) {
      const upstreamPath = join(upstream, entry)
      const vendorPath = join(vendor, entry)
      const relPath = join(rel, entry)

      const upstreamStat = statSync(upstreamPath)
      const vendorStat = safeStatSync(vendorPath)

      if (vendorStat === null) {
        changed.push(relPath)
        continue
      }

      if (upstreamStat.isDirectory() && vendorStat.isDirectory()) {
        walk(upstreamPath, vendorPath, relPath)
      } else if (upstreamStat.isFile() && vendorStat.isFile()) {
        const upstreamContent = readFileSync(upstreamPath)
        const vendorContent = readFileSync(vendorPath)
        if (!upstreamContent.equals(vendorContent)) {
          changed.push(relPath)
        }
      } else {
        changed.push(relPath)
      }
    }
  }

  walk(upstreamDir, vendorSrc, '')
  return changed.sort()
}

function main() {
  const jsonOutput = process.argv.includes('--json')

  console.log(`Checking upstream: ${UPSTREAM_PACKAGE}`)
  const upstreamVersion = fetchUpstreamVersion()
  console.log(`Latest upstream version: ${upstreamVersion}`)

  const vendoredHash = hashDirectory(join(VENDOR_DIR, 'src'))
  console.log(`Vendored hash: ${vendoredHash.slice(0, 16)}...`)

  const { hash: upstreamHash, dir: upstreamDir } = fetchUpstreamHash(upstreamVersion)
  console.log(`Upstream hash:   ${upstreamHash.slice(0, 16)}...`)

  const upToDate = vendoredHash === upstreamHash
  const changedFiles = upToDate ? [] : diffVendored(upstreamDir)

  const result: CheckResult = {
    upstreamVersion,
    vendoredHash,
    upstreamHash,
    upToDate,
    changedFiles,
  }

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    if (upToDate) {
      console.log('\n✓ Vendored code is up to date with upstream.')
    } else {
      console.log(`\n✗ Upstream has changed. ${changedFiles.length} file(s) differ:`)
      for (const file of changedFiles.slice(0, 20)) {
        console.log(`  - ${file}`)
      }
      if (changedFiles.length > 20) {
        console.log(`  ... and ${changedFiles.length - 20} more`)
      }
      console.log('\nRun the rebase procedure in docs/upgrading.md')
    }
  }

  process.exit(upToDate ? 0 : 1)
}

main()
