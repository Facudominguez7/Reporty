import "server-only"

import { AllProfanity } from "allprofanity"

const ARGENTINE_BLOCKING_WORDS = [
  "boludo",
  "boluda",
  "boludos",
  "boludas",
  "pelotudo",
  "pelotuda",
  "pelotudos",
  "pelotudas",
  "forro",
  "forra",
  "gil",
  "gila",
  "tarado",
  "tarada",
  "idiota",
  "estupido",
  "estupida",
  "imbecil",
  "imbecila",
  "salame",
  "nabo",
  "naba",
  "pajero",
  "pajera",
  "pajeros",
  "pajeras",
  "choto",
  "chota",
  "chotos",
  "chotas",
  "conchudo",
  "conchuda",
  "sorete",
  "putos",
  "putas",
  "hijo de puta",
  "hija de puta",
  "la concha de tu madre",
  "la concha de tu hermana",
] as const

const filter = new AllProfanity({
  languages: ["spanish"],
  enableLeetSpeak: true,
  caseSensitive: false,
  strictMode: true,
  detectPartialWords: false,
  silent: true,
  algorithm: { matching: "aho-corasick" },
  ahoCorasick: { enabled: true, prebuild: true },
  contextAnalysis: { enabled: false },
  evasionProtection: {
    unicode: true,
    repeatedCharacters: true,
    maskedCharacters: true,
    separatedLetters: true,
  },
})

// AllProfanity loads English and Hindi by default; clear them to keep this module Spanish-only.
filter.clearList()
filter.loadLanguage("spanish")
filter.loadCustomDictionary("argentina", [...ARGENTINE_BLOCKING_WORDS])

export type TextModerationResult =
  | { allowed: true }
  | { allowed: false; message: string }

export const BLOCKED_TEXT_MESSAGE = "El texto contiene lenguaje ofensivo. Corregilo antes de publicar."

const normalizeRepeatedLetters = (value: string) => value.replace(/([a-záéíóúüñ])\1{2,}/giu, "$1")

export function moderateText(value: string): TextModerationResult {
  const result = filter.detect(value)
  const repeatedLettersResult = result.hasProfanity ? result : filter.detect(normalizeRepeatedLetters(value))
  return repeatedLettersResult.hasProfanity
    ? { allowed: false, message: BLOCKED_TEXT_MESSAGE }
    : { allowed: true }
}

export function validateModeratedText(value: string) {
  const result = moderateText(value)
  if (!result.allowed) throw new Error(result.message)
}

export function moderateReportText(titulo: string, descripcion: string) {
  return moderateText(titulo).allowed && moderateText(descripcion).allowed
    ? null
    : BLOCKED_TEXT_MESSAGE
}

export function moderatePetText(descripcion: string) {
  return moderateText(descripcion).allowed ? null : BLOCKED_TEXT_MESSAGE
}

export const deterministicTextModerationConfig = {
  languages: ["spanish"],
  algorithm: "aho-corasick" as const,
  customDictionary: "argentina",
}
