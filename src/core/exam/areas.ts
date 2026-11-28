/*
 * The four content areas of the radiography board exam, the number of scored questions
 * each gets, and how a question is placed in one.
 *
 * Counts are from ARRT's Radiography Examination Content Specifications (arrt.org):
 * the version in force through February 28, 2027, and the one effective March 1, 2027.
 * Equipment operation and quality assurance belong to Image Production in both.
 */

export type ContentArea = 'patient-care' | 'safety' | 'image-production' | 'procedures'

export const CONTENT_AREAS: ContentArea[] = ['patient-care', 'safety', 'image-production', 'procedures']

export const AREA_LABELS: Record<ContentArea, string> = {
  'patient-care': 'Patient Care',
  safety: 'Safety',
  'image-production': 'Image Production',
  procedures: 'Procedures'
}

export type BlueprintId = '2022' | '2027'

export interface Blueprint {
  id: BlueprintId
  label: string
  /** Scored questions per area; they add up to 200. */
  counts: Record<ContentArea, number>
}

export const BLUEPRINTS: Record<BlueprintId, Blueprint> = {
  '2022': {
    id: '2022',
    label: 'Exams through February 28, 2027',
    counts: { 'patient-care': 33, safety: 50, 'image-production': 51, procedures: 66 }
  },
  '2027': {
    id: '2027',
    label: 'Exams from March 1, 2027',
    counts: { 'patient-care': 31, safety: 46, 'image-production': 51, procedures: 72 }
  }
}

/** Seats per area for an exam of `total` questions, in the blueprint's proportions (largest remainder). */
export function areaQuotas(blueprint: Blueprint, total: number): Record<ContentArea, number> {
  const sum = CONTENT_AREAS.reduce((s, a) => s + blueprint.counts[a], 0)
  const exact = CONTENT_AREAS.map((area) => ({ area, value: (blueprint.counts[area] / sum) * total }))
  const quotas = Object.fromEntries(exact.map((e) => [e.area, Math.floor(e.value)])) as Record<ContentArea, number>
  let left = total - CONTENT_AREAS.reduce((s, a) => s + quotas[a], 0)
  for (const e of [...exact].sort((a, b) => (b.value % 1) - (a.value % 1))) {
    if (left <= 0) break
    quotas[e.area]++
    left--
  }
  return quotas
}

/** Chapter and section titles: "Radiation Protection", "Imaging Procedures", "Chapter 1: Patient Care". */
const TITLE_RULES: [RegExp, ContentArea][] = [
  [/\bpatient\s+(?:care|interactions)\b|\bethic|\binfection control\b/i, 'patient-care'],
  [/\bradiation\s+(?:protection|physics|safety)\b|\bradiobiology\b|\bsafety\b/i, 'safety'],
  [
    /\bimage\s+(?:production|acquisition|evaluation)\b|\bequipment\s+operation\b|\bquality\s+(?:control|assurance)\b/i,
    'image-production'
  ],
  [/\bprocedures?\b|\bpositioning\b/i, 'procedures']
]

export function areaFromTitle(title: string): ContentArea | undefined {
  return TITLE_RULES.find(([pattern]) => pattern.test(title))?.[1]
}

/**
 * Topic words for questions whose section says nothing (a book's mixed practice tests).
 * Whole words or phrases, matched case-insensitively; acronyms case-sensitively.
 */
const TOPIC_WORDS: Record<ContentArea, string[]> = {
  'patient-care': [
    'patient',
    'infection',
    'isolation',
    'precautions',
    'consent',
    'ethical',
    'legal',
    'negligence',
    'vital signs',
    'blood pressure',
    'pulse',
    'respiration',
    'anaphylaxis',
    'medication',
    'injection',
    'needle',
    'catheter',
    'oxygen',
    'wheelchair',
    'stretcher',
    'transfer',
    'shock',
    'aseptic',
    'sterile',
    'contrast reaction',
    'allergic',
    'cardiac arrest',
    'communication',
    'confidentiality',
    'body mechanics',
    'restraint'
  ],
  safety: [
    'dose',
    'dosimeter',
    'mSv',
    'mGy',
    'sievert',
    'gray',
    'rem',
    'shielding',
    'lead apron',
    'ALARA',
    'radiosensitive',
    'radiosensitivity',
    'somatic',
    'genetic effects',
    'stochastic',
    'deterministic',
    'erythema',
    'LET',
    'RBE',
    'NCRP',
    'occupational exposure',
    'exposure rate',
    'inverse square',
    'protective barrier',
    'leakage radiation',
    'pregnant',
    'fetus',
    'embryo',
    'personnel monitoring',
    'Compton',
    'photoelectric',
    'biologic effect',
    'cell',
    'chromosome',
    'irradiation'
  ],
  'image-production': [
    'kVp',
    'mAs',
    'contrast',
    'density',
    'receptor',
    'grid',
    'focal spot',
    'OID',
    'SID',
    'recorded detail',
    'spatial resolution',
    'magnification',
    'distortion',
    'artifact',
    'processor',
    'film',
    'screen',
    'phosphor',
    'digital',
    'pixel',
    'matrix',
    'exposure indicator',
    'AEC',
    'automatic exposure',
    'quality control',
    'rectification',
    'transformer',
    'x-ray tube',
    'anode',
    'cathode',
    'filament',
    'image intensifier',
    'exposure latitude',
    'noise',
    'histogram',
    'windowing',
    'brightness',
    'heel effect'
  ],
  procedures: [
    'projection',
    'position',
    'oblique',
    'lateral',
    'axial',
    'central ray',
    'cephalad',
    'caudad',
    'angle',
    'vertebra',
    'vertebrae',
    'skull',
    'sinuses',
    'mandible',
    'humerus',
    'femur',
    'knee',
    'ankle',
    'wrist',
    'hand',
    'shoulder',
    'pelvis',
    'hip',
    'chest',
    'abdomen',
    'barium',
    'IVU',
    'myelography',
    'demonstrated',
    'visualized',
    'recumbent',
    'supine',
    'prone',
    'midsagittal',
    'scapula',
    'clavicle',
    'elbow',
    'foot',
    'ribs',
    'sternum'
  ]
}

const TOPIC_PATTERNS: [ContentArea, RegExp[]][] = CONTENT_AREAS.map((area) => [
  area,
  TOPIC_WORDS[area].map((word) => {
    const acronym = /^[A-Z]{2,}$/.test(word) || /^[a-z]+[A-Z]/.test(word)
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
    return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}s?(?![\\p{L}\\p{N}])`, acronym ? 'u' : 'iu')
  })
])

/** Matches needed, and how far ahead of the runner-up, before a text is placed in an area. */
const MIN_TOPIC_MATCHES = 2
const MIN_LEAD = 1.5

export function areaFromText(text: string): ContentArea | undefined {
  const scores = TOPIC_PATTERNS.map(([area, patterns]) => ({
    area,
    score: patterns.filter((p) => p.test(text)).length
  })).sort((a, b) => b.score - a.score)
  const [best, second] = scores
  if (!best || best.score < MIN_TOPIC_MATCHES) return undefined
  if (second && best.score < second.score * MIN_LEAD) return undefined
  return best.area
}
