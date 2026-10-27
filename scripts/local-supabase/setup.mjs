#!/usr/bin/env node
// Brings the local Supabase stack up to date with one command, on Windows, macOS and Linux:
//
//   npm run db:setup                  asks where the data comes from
//   npm run db:setup -- --production  copies production now (asks for the connection string)
//   npm run db:setup -- --saved       reuses the production copy saved earlier
//   npm run db:setup -- --empty       empty database with the catalogs only
//   npm run db:setup -- --schema      maintainers: regenerates the schema baseline from production
//
// It checks Docker, starts the stack, applies the repo migrations, loads the data and writes
// .env.development.local. Plain Node and the Docker CLI only: no shell sits between the arguments,
// so passwords with `&`, `%` or `!` work the same everywhere. See supabase/README.md.
import { spawn, spawnSync } from "node:child_process"
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import readline from "node:readline"
import { fileURLToPath } from "node:url"

import {
  EXCLUDED_TABLES,
  dockerHelp,
  envFileContent,
  isConnectionString,
  parseArgs,
  parseStatusEnv,
  readProjectId,
  restoreObjectsSql,
  splitPassword,
  storagePath,
} from "./lib.mjs"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const PROD_API_URL = "https://uxwtxuoipvfuezpmfdcm.supabase.co"
const BUCKET = "reportes"
const LOCAL_DIR = path.join(ROOT, "supabase", ".local")
const DATA_FILE = path.join(LOCAL_DIR, "prod-data.sql")
const SEED_FILE = path.join(ROOT, "supabase", "seed.sql")
const BASELINE = path.join("supabase", "migrations", "20261020120050_remote_schema.sql")
const ENV_FILE = path.join(ROOT, ".env.development.local")
const SUPABASE_CLI = path.join(ROOT, "node_modules", "supabase", "dist", "supabase.js")
const DB_CONTAINER = `supabase_db_${readProjectId(readFileSync(path.join(ROOT, "supabase", "config.toml"), "utf8"))}`
const INTERACTIVE = Boolean(process.stdin.isTTY && process.stdout.isTTY)

const USAGE = `Usage: npm run db:setup [-- --production | --saved | --empty] [-- --schema]

Without options it asks where the data comes from. Set SUPABASE_DB_URL to skip the
connection string question.`

class SetupError extends Error {}

function fail(message) {
  throw new SetupError(message)
}

let stepNumber = 0
function step(title) {
  stepNumber += 1
  console.log(`\n[${stepNumber}/5] ${title}`)
}

function run(command, args, { capture = false, input, env } = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    env: env ? { ...process.env, ...env } : process.env,
    input,
    maxBuffer: 64 * 1024 * 1024,
    stdio: capture || input !== undefined ? "pipe" : "inherit",
  })
  if (result.error && result.error.code !== "ENOENT") throw result.error
  return result
}

/** The CLI's npm entry point picks the binary for this OS; running it with this Node needs no shell. */
function supabase(args, options) {
  return run(process.execPath, [SUPABASE_CLI, ...args], options)
}

/** `supabase db dump` against a remote database, with the password in PGPASSWORD instead of argv. */
function dumpRemote(connectionString, args) {
  const { url, password } = splitPassword(connectionString)
  return supabase(["db", "dump", "--db-url", url, ...args], { env: { PGPASSWORD: password } })
}

function localStatus() {
  const result = supabase(["status", "-o", "env"], { capture: true })
  return result.status === 0 ? parseStatusEnv(result.stdout) : null
}

/** Runs SQL in the local database as the admin role, which owns the auth and storage tables. */
function localSql(sql) {
  const result = run("docker", ["exec", "-i", DB_CONTAINER, "psql", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt"], { input: sql })
  if (result.status !== 0) fail(`SQL failed in the local database:\n${result.stderr}`)
  return result.stdout
}

/** Streams a SQL file into psql: COPY blocks need psql, and the file can be large. */
function loadSqlFile(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      ["exec", "-i", DB_CONTAINER, "psql", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "--single-transaction"],
      { stdio: ["pipe", "ignore", "inherit"] },
    )
    const source = createReadStream(file)
    source.on("error", (error) => {
      child.kill()
      reject(error)
    })
    // When psql exits early (a SQL error), writes fail with EPIPE; its exit code reports the failure.
    child.stdin.on("error", () => {})
    source.pipe(child.stdin)
    child.on("error", reject)
    child.on("close", (code) => (code === 0 ? resolve() : reject(new SetupError(`Loading ${path.relative(ROOT, file)} failed.`))))
  })
}

function prompt(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    let muted = false
    rl._writeToOutput = (text) => {
      if (!muted) rl.output.write(text)
    }
    rl.on("SIGINT", () => {
      rl.close()
      process.stdout.write("\n")
      process.exit(130)
    })
    rl.question(question, (answer) => {
      rl.close()
      if (hidden) process.stdout.write("\n")
      resolve(answer)
    })
    muted = hidden
  })
}

async function ensureDocker() {
  for (;;) {
    const version = run("docker", ["--version"], { capture: true })
    let problem
    if (version.error || version.status !== 0) {
      problem = "Docker is not installed, or `docker` is not in your PATH."
    } else {
      const info = run("docker", ["info"], { capture: true })
      if (info.status === 0) {
        console.log(`  ${version.stdout.trim()}, running.`)
        return
      }
      const reason = info.stderr.trim().split(/\r?\n/).pop()
      problem = `Docker is installed but not reachable${reason ? `: ${reason}` : "."}`
    }

    console.log(`\n  ${problem}\n\n${dockerHelp(process.platform).replace(/^/gm, "  ")}\n`)
    if (!INTERACTIVE) fail("Docker is required.")
    await prompt("  Press Enter when Docker is running, or Ctrl+C to quit. ")
  }
}

function ensureStack() {
  if (localStatus()) {
    console.log("  Already running.")
    return
  }
  console.log("  Starting it. The first time downloads about 7 GB of Docker images, so it can take a while.")
  if (supabase(["start"]).status !== 0) fail("`supabase start` failed. Read the error above, then run `npm run db:setup` again.")
}

async function chooseSource(requested) {
  const saved = existsSync(DATA_FILE) ? statSync(DATA_FILE).mtime : null
  if (requested === "saved" && !saved) fail("There is no saved production copy yet. Run `npm run db:setup -- --production`.")
  if (requested !== "ask") return requested
  if (!INTERACTIVE) fail("No terminal to ask in. Choose the data with --production, --saved or --empty.")

  const choices = [
    ["production", "Copy production now (asks for the database connection string)"],
    ...(saved ? [["saved", `Reuse the production copy saved on ${saved.toLocaleString()}`]] : []),
    ["empty", "Empty database with the catalogs only (no production access needed)"],
  ]
  console.log("\n  Where should the local data come from?")
  choices.forEach(([, label], index) => console.log(`    ${index + 1}. ${label}`))

  for (;;) {
    const answer = Number((await prompt(`  Choose 1-${choices.length}: `)).trim())
    if (Number.isInteger(answer) && answer >= 1 && answer <= choices.length) return choices[answer - 1][0]
    console.log("  Type the number of an option.")
  }
}

async function askConnectionString(retry) {
  const fromEnv = process.env.SUPABASE_DB_URL
  if (fromEnv && !retry) {
    if (!isConnectionString(fromEnv)) fail("SUPABASE_DB_URL is not a Postgres connection string with a password.")
    return fromEnv.trim()
  }
  if (!INTERACTIVE) fail("Set SUPABASE_DB_URL to the production connection string.")

  console.log(
    [
      "",
      "  The production connection string is in Supabase Dashboard → Connect → Direct → Session pooler.",
      "  Copy the URI and put the database password in place of [YOUR-PASSWORD].",
      "  It is used for this run only and never saved. The typing stays hidden.",
    ].join("\n"),
  )
  for (let attempt = 0; attempt < 3; attempt++) {
    const value = await prompt("  Connection string: ", { hidden: true })
    if (isConnectionString(value)) return value.trim()
    console.log("  That is not a postgresql:// connection string with a password. Try again.")
  }
  fail("No valid connection string.")
}

async function pullProduction() {
  mkdirSync(LOCAL_DIR, { recursive: true })
  const partial = `${DATA_FILE}.partial`

  for (let attempt = 0; attempt < 3; attempt++) {
    const url = await askConnectionString(attempt > 0)
    console.log("  Dumping production data (live sessions and tokens are left out)...")
    const result = dumpRemote(url, ["--data-only", "--use-copy", "-x", EXCLUDED_TABLES.join(","), "-f", partial])
    if (result.status === 0) {
      // Written aside first, so a failed dump keeps the previous copy.
      renameSync(partial, DATA_FILE)
      return
    }
    rmSync(partial, { force: true })
    if (!INTERACTIVE || process.env.SUPABASE_DB_URL) fail("The production dump failed. Check the connection string and your network.")
    console.log("  The dump failed: usually a wrong password, or the direct connection instead of the session pooler.")
  }
  fail("The production dump failed three times.")
}

/**
 * Files uploaded before the bucket got its current size limit can be heavier than it. Production
 * keeps them, so the copy lifts the limit while it uploads and puts it back afterwards.
 */
async function withoutBucketSizeLimit(run) {
  const limit = localSql(`select coalesce(file_size_limit::text, 'null') from storage.buckets where id = '${BUCKET}';`).trim()
  if (!limit) return run()

  localSql(`update storage.buckets set file_size_limit = null where id = '${BUCKET}';`)
  try {
    return await run()
  } finally {
    localSql(`update storage.buckets set file_size_limit = ${limit} where id = '${BUCKET}';`)
  }
}

async function syncStorage(status) {
  const objects = JSON.parse(
    localSql(
      `select coalesce(json_agg(json_build_object('name', name, 'mime', coalesce(metadata->>'mimetype', 'application/octet-stream'), 'owner', owner, 'owner_id', owner_id, 'created_at', created_at, 'updated_at', updated_at)), '[]') from storage.objects where bucket_id = '${BUCKET}';`,
    ).trim(),
  )

  const failed = []
  for (const [index, object] of objects.entries()) {
    const objectPath = storagePath(object.name)
    try {
      const download = await fetch(`${PROD_API_URL}/storage/v1/object/public/${BUCKET}/${objectPath}`)
      if (!download.ok) throw new Error(`download ${download.status}`)
      const upload = await fetch(`${status.API_URL}/storage/v1/object/${BUCKET}/${objectPath}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`, "x-upsert": "true", "Content-Type": object.mime },
        body: Buffer.from(await download.arrayBuffer()),
      })
      if (!upload.ok) throw new Error(`upload ${upload.status}`)
    } catch (error) {
      failed.push(`${object.name} (${error.message})`)
    }
    if (process.stdout.isTTY) process.stdout.write(`\r  Bucket files: ${index + 1}/${objects.length}`)
  }
  if (process.stdout.isTTY) process.stdout.write("\n")
  console.log(`  Bucket files copied: ${objects.length - failed.length}/${objects.length}.`)

  // The uploads rewrote owners and timestamps; put back the copied values, even after failures.
  if (objects.length > 0) localSql(restoreObjectsSql(BUCKET, objects.map(({ mime: _mime, ...row }) => row)))

  if (failed.length > 0) {
    console.log(`  ${failed.length} files could not be copied; those images will not load locally:`)
    failed.slice(0, 5).forEach((line) => console.log(`    ${line}`))
    console.log("  Run `npm run db:setup -- --saved` later to retry.")
  }
}

function ensureReportBucket() {
  localSql(`
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('reportes', 'reportes', true, 102400, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set public = true, file_size_limit = 102400,
      allowed_mime_types = excluded.allowed_mime_types;
  `)
}

function writeEnvFile(status) {
  const partial = `${ENV_FILE}.partial`
  writeFileSync(partial, envFileContent(status))
  renameSync(partial, ENV_FILE)
}

async function regenerateSchema() {
  console.log("\nRegenerating the schema baseline from production.")
  const url = await askConnectionString(false)
  if (dumpRemote(url, ["-f", BASELINE]).status !== 0) fail("The schema dump failed.")
  console.log(`\nSchema written to ${BASELINE}. Review the diff before committing it.`)
}

async function main() {
  let options
  try {
    options = parseArgs(process.argv.slice(2))
  } catch (error) {
    throw new SetupError(`${error.message}\n\n${USAGE}`)
  }
  if (options.help) {
    console.log(USAGE)
    return
  }
  if (!existsSync(SUPABASE_CLI)) fail("The Supabase CLI is not installed. Run `npm install` first.")

  console.log("Reporty · local Supabase setup")
  step("Docker")
  await ensureDocker()

  if (options.schema) {
    await regenerateSchema()
    return
  }

  step("Local Supabase stack")
  ensureStack()
  const source = await chooseSource(options.source)
  if (source === "production") await pullProduction()

  step("Database schema (repo migrations)")
  if (supabase(["db", "reset"]).status !== 0) fail("`supabase db reset` failed: a migration has an error, see above.")

  const status = localStatus()
  if (!status) fail("The local stack stopped unexpectedly. Run `npm run db:setup` again.")

  ensureReportBucket()

  step("Data")
  if (source === "empty") {
    await loadSqlFile(SEED_FILE)
    console.log("  Catalogs loaded. Sign up in the app to create users; the emails land in Mailpit.")
  } else {
    await loadSqlFile(DATA_FILE)
    console.log(`  Production copy from ${statSync(DATA_FILE).mtime.toLocaleString()} loaded.`)
    await withoutBucketSizeLimit(() => syncStorage(status))
  }

  step("App environment")
  writeEnvFile(status)
  console.log(`  Wrote ${path.relative(ROOT, ENV_FILE)}: \`npm run dev\` now uses the local stack.`)

  console.log(
    [
      "",
      "Done. Next: `npm run dev` (restart it if it was running).",
      `  Studio:  ${status.STUDIO_URL ?? "http://127.0.0.1:54323"}`,
      `  Mailpit: ${status.MAILPIT_URL ?? status.INBUCKET_URL ?? "http://127.0.0.1:54324"}`,
      "  Stop the stack with `npm run db:stop`; the data stays.",
    ].join("\n"),
  )
}

main().catch((error) => {
  if (error instanceof SetupError) {
    console.error(`\n${error.message}`)
  } else {
    console.error(error)
  }
  process.exit(1)
})
