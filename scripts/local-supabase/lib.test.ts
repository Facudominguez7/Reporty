import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { execFileSync } from "node:child_process"

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

// Fake connection strings are assembled at runtime: written out whole, secret scanners report them as leaked credentials.
const SAMPLE_SECRET = "fake@pw&1"
const POOLER_HOST = "aws-0-us-east-2.pooler.supabase.com:5432/postgres"
const poolerUrl = (userInfo: string, scheme = "postgresql") => `${scheme}://${userInfo}@${POOLER_HOST}`

describe("parseArgs", () => {
  it("asks for the data source when run without options", () => {
    expect(parseArgs([])).toEqual({ source: "ask", schema: false, help: false })
  })

  it.each([
    ["--production", "production"],
    ["--saved", "saved"],
    ["--empty", "empty"],
  ])("%s skips the question", (flag, source) => {
    expect(parseArgs([flag])).toMatchObject({ source })
  })

  it("supports the schema and help modes", () => {
    expect(parseArgs(["--schema"])).toMatchObject({ schema: true })
    expect(parseArgs(["-h"])).toMatchObject({ help: true })
  })

  it("rejects unknown options and conflicting sources", () => {
    expect(() => parseArgs(["--prod"])).toThrow("Unknown option: --prod")
    expect(() => parseArgs(["--saved", "--empty"])).toThrow("Choose only one of --production, --saved or --empty.")
  })

  it("rejects a data source next to --schema instead of ignoring it", () => {
    expect(() => parseArgs(["--schema", "--empty"])).toThrow("--schema only regenerates the baseline; it takes no data option.")
  })
})

describe("isConnectionString", () => {
  it("accepts the Supabase session pooler string with a password", () => {
    expect(isConnectionString(poolerUrl(`postgres.ref:${encodeURIComponent(SAMPLE_SECRET)}`))).toBe(true)
    expect(isConnectionString(poolerUrl(`postgres:${encodeURIComponent(SAMPLE_SECRET)}`, "postgres"))).toBe(true)
  })

  it.each([
    ["the placeholder", poolerUrl("postgres.ref:[YOUR-PASSWORD]")],
    ["no password", poolerUrl("postgres.ref")],
    ["an API URL", "https://ref.supabase.co"],
    ["an empty answer", "  "],
  ])("rejects %s", (_case, value) => {
    expect(isConnectionString(value)).toBe(false)
  })
})

describe("splitPassword", () => {
  // The password goes to the CLI through PGPASSWORD, so it never shows up in the process list.
  it("moves the password out of the URL, decoded", () => {
    expect(splitPassword(poolerUrl(`postgres.ref:${encodeURIComponent(SAMPLE_SECRET)}`))).toEqual({
      url: poolerUrl("postgres.ref"),
      password: SAMPLE_SECRET,
    })
  })
})

describe("parseStatusEnv", () => {
  it("reads the KEY=\"value\" lines of `supabase status -o env` without evaluating them", () => {
    const output = 'API_URL="http://127.0.0.1:54321"\nANON_KEY="eyJ.a.b"\nWARN: something\nSERVICE_ROLE_KEY="eyJ.c.d"\n'

    expect(parseStatusEnv(output)).toEqual({
      API_URL: "http://127.0.0.1:54321",
      ANON_KEY: "eyJ.a.b",
      SERVICE_ROLE_KEY: "eyJ.c.d",
    })
  })
})

describe("readProjectId", () => {
  it("reads project_id from config.toml", () => {
    expect(readProjectId('# comment\nproject_id = "JackeMate"\n\n[api]\n')).toBe("JackeMate")
  })

  it("fails when it is missing", () => {
    expect(() => readProjectId("[api]\n")).toThrow("project_id not found in supabase/config.toml")
  })
})

describe("local database container names", () => {
  it("uses the Reporty project id", () => {
    expect(readProjectId(readFileSync("supabase/config.toml", "utf8"))).toBe("Reporty")
  })

  it.each([
    ["scripts/local-supabase/test-report-vote-exclusivo.sh", "contenedor"],
    ["scripts/local-supabase/test-report-vote-races.sh", "contenedor"],
    ["scripts/local-supabase/test-report-vote-concurrency.sh", "container"],
  ])("defaults and honors the existing override in %s", (path, variable) => {
    const source = readFileSync(path, "utf8")
    const assignment = source.split(/\r?\n/).find(line => line.startsWith(`${variable}=`))
    expect(assignment).toBeDefined()
    expect(source).toContain(`"$${variable}"`)
    const resolve = (override: string) => execFileSync("bash", ["-c", `${assignment}\nprintf '%s' "$${variable}"`], {
      encoding: "utf8", env: { NODE_ENV: "test", SUPABASE_DB_CONTAINER: override },
    })
    expect(resolve("")).toBe("supabase_db_Reporty")
    expect(resolve("custom_container")).toBe("custom_container")
  })

  it("uses the Reporty container in the moderation runner", () => {
    expect(readFileSync("scripts/moderacion/verificar-retiro.mjs", "utf8")).toContain("const container = 'supabase_db_Reporty';")
  })
})

describe("envFileContent", () => {
  const status = { API_URL: "http://127.0.0.1:54321", ANON_KEY: "anon", SERVICE_ROLE_KEY: "service" }

  it("points the app at the local stack and turns off production-only services", () => {
    const content = envFileContent(status)

    expect(content).toContain("NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\n")
    expect(content).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY=anon\n")
    expect(content).toContain("SUPABASE_SERVICE_ROLE_KEY=service\n")
    expect(content).toContain("NEXT_PUBLIC_APP_URL=http://localhost:3000\n")
    expect(content).toContain("NEXT_PUBLIC_TURNSTILE_SITE_KEY=\n")
    expect(content).toContain("RESEND_API_KEY=\n")
  })

  it("refuses to write a file without the local keys", () => {
    expect(() => envFileContent({ ...status, ANON_KEY: "" })).toThrow("ANON_KEY missing from supabase status")
  })
})

describe("storagePath", () => {
  it("encodes each segment and keeps the slashes", () => {
    expect(storagePath("67/thumbnails/foto con espacio#1.webp")).toBe("67/thumbnails/foto%20con%20espacio%231.webp")
  })
})

describe("restoreObjectsSql", () => {
  it("restores owners and timestamps from a dollar-quoted JSON list", () => {
    const sql = restoreObjectsSql("reportes", [
      { name: "a$json$b.webp", owner: null, owner_id: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z" },
    ])

    expect(sql).toContain("json_to_recordset(")
    expect(sql).toContain("where o.bucket_id = 'reportes' and o.name = r.name")
    // The quote tag never appears inside the data, so a name cannot close the literal.
    const tag = sql.match(/(\$\w*\$)\[/)?.[1]
    expect(tag).toBeDefined()
    expect(sql.split(tag!).length).toBe(3)
  })
})

describe("dockerHelp", () => {
  it.each([
    ["win32", "Docker Desktop"],
    ["darwin", "Docker Desktop"],
    ["linux", "Docker Engine"],
  ])("explains how to get Docker on %s", (platform, product) => {
    expect(dockerHelp(platform as NodeJS.Platform)).toContain(product)
  })
})

describe("EXCLUDED_TABLES", () => {
  it("keeps live Auth credentials out of the production copy", () => {
    expect(EXCLUDED_TABLES).toEqual(expect.arrayContaining(["auth.sessions", "auth.refresh_tokens", "auth.one_time_tokens"]))
    expect(EXCLUDED_TABLES).not.toContain("auth.users")
  })
})
