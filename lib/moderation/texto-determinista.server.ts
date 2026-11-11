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

// AllProfanity includes animal words that can be insults, but they are legitimate when the
// text clearly describes a pet. Keep the base detector strict outside that context.
const DOMAIN_CONTEXT = /\b(?:perdid[oa]s?|encontrad[oa]s?|mascota|animal|collar|correa|jaula|pelaje|raza|color|señas?|tama(?:ño|no)|gato|gata|gatos|gatas|perro|perra|perros|perras|cerdo|cerda|cerdos|cerdas|marrano|marrana|marranos|marranas|puerco|puerca|puercos|puercas|calle|vereda|plaza|avenida|barrio|contenedor|basura|esquina|escuela|calzada|terreno|puente|domicilio|zona|cloaca|luminaria|cable|árbol|camino|arroyo|tránsito|transito|rata|ratas|sapo|sapos|agua|caño|desagüe|desague|cuneta|asfalto|residuo|limpieza|olor|vapor|parada|colectivo|transporte)\b/iu
const SAFE_DOMAIN_DESCRIPTORS = /\b(?:gato|gata|gatos|gatas|perro|perra|perros|perras|rata|ratas|sapo|sapos|cerdo|cerda|cerdos|cerdas|marrano|marrana|marranos|marranas|puerco|puerca|puercos|puercas|negr(?:o|a|os|as)|caliente|paja|moco|meo|pedo|corrida|cagar|mear)\b/giu

const removeSafeDescriptiveWords = (value: string) => DOMAIN_CONTEXT.test(value) ? value.replace(SAFE_DOMAIN_DESCRIPTORS, " ") : value

function detectText(value: string, sanitize: (text: string) => string = (text) => text): TextModerationResult {
  const result = filter.detect(sanitize(value))
  const repeatedLettersResult = result.hasProfanity
    ? result
    : filter.detect(sanitize(normalizeRepeatedLetters(value)))
  return repeatedLettersResult.hasProfanity
    ? { allowed: false, message: BLOCKED_TEXT_MESSAGE }
    : { allowed: true }
}

export function moderateText(value: string): TextModerationResult {
  return detectText(value)
}

function moderateDescriptiveText(value: string): TextModerationResult {
  return detectText(value, removeSafeDescriptiveWords)
}

export function validateModeratedText(value: string) {
  const result = moderateText(value)
  if (!result.allowed) throw new Error(result.message)
}

export function moderateReportText(titulo: string, descripcion: string) {
  return moderateDescriptiveText(`${titulo}\n${descripcion}`).allowed ? null : BLOCKED_TEXT_MESSAGE
}

export function moderatePetText(descripcion: string) {
  return moderateDescriptiveText(descripcion).allowed ? null : BLOCKED_TEXT_MESSAGE
}

export const deterministicTextModerationConfig = {
  languages: ["spanish"],
  algorithm: "aho-corasick" as const,
  customDictionary: "argentina",
}
