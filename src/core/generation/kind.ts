/*
 * What kind of thing a defined term is: a condition, a procedure, a device, a substance,
 * a measure, an effect, a part of the anatomy, or a principle. Multiple-choice questions
 * only offer wrong options of the same kind as the answer; otherwise the answer is the only
 * disease among chemicals and can be spotted without knowing the subject.
 *
 * The kind comes from how the definition starts ("Condition of ...", "Device used to ...",
 * "Ratio of ..."), the usual shape of a definition: the general class first, then what sets
 * this one apart. When the start says nothing, the term's ending can ("-itis", "-graphy",
 * "-meter"). When neither does, the kind is unknown and no question is made from it.
 */

export type Kind = 'condition' | 'procedure' | 'device' | 'substance' | 'measure' | 'effect' | 'anatomy' | 'principle'

const KIND_WORDS: Record<Kind, string[]> = {
  condition: [
    'condition',
    'disease',
    'disorder',
    'infection',
    'inflammation',
    'syndrome',
    'injury',
    'fracture',
    'defect',
    'deficiency',
    'illness',
    'reaction',
    'abnormality',
    'tumor',
    'tumour',
    'cancer',
    'malignancy',
    'dislocation',
    'displacement',
    'collapse',
    'narrowing',
    'enlargement',
    'obstruction',
    'complication',
    'symptom',
    'sign',
    'state'
  ],
  procedure: [
    'procedure',
    'method',
    'technique',
    'process',
    'examination',
    'exam',
    'test',
    'study',
    'projection',
    'position',
    'view',
    'treatment',
    'therapy',
    'administration',
    'approach',
    'way',
    'operation',
    'maneuver',
    'manoeuvre',
    'surgery',
    'measurement',
    'monitoring',
    'evaluation',
    'assessment',
    'practice',
    'precaution',
    'program',
    'programme'
  ],
  device: [
    'device',
    'instrument',
    'apparatus',
    'tool',
    'machine',
    'equipment',
    'component',
    'filter',
    'grid',
    'screen',
    'tube',
    'detector',
    'dosimeter',
    'meter',
    'container',
    'catheter',
    'needle',
    'roller',
    'system',
    'chamber',
    'plate',
    'cassette',
    'receptor',
    'framework',
    'library',
    'software',
    'application',
    'circuit',
    'transformer',
    'motor',
    'disk',
    'disc',
    'backing',
    'layer',
    'coating',
    'electrode',
    'housing'
  ],
  substance: [
    'substance',
    'agent',
    'material',
    'medication',
    'medicine',
    'drug',
    'chemical',
    'metal',
    'solution',
    'compound',
    'element',
    'fluid',
    'medium',
    'media',
    'hardener',
    'phosphor',
    'phosphors',
    'crystal',
    'crystals',
    'gas',
    'salt',
    'preservative',
    'reducer',
    'activator',
    'antibiotic',
    'anticoagulant',
    'diuretic',
    'sedative',
    'analgesic'
  ],
  measure: [
    'measure',
    'ratio',
    'amount',
    'number',
    'degree',
    'thickness',
    'distance',
    'rate',
    'value',
    'factor',
    'quantity',
    'percentage',
    'level',
    'range',
    'dose',
    'intensity',
    'size',
    'length',
    'time',
    'speed',
    'frequency',
    'unit',
    'margin',
    'limit',
    'difference',
    'potential',
    'capacity',
    'efficiency',
    'index',
    'scale'
  ],
  effect: [
    'effect',
    'appearance',
    'result',
    'artifact',
    'artefact',
    'image',
    'change',
    'blur',
    'blurriness',
    'fog',
    'phenomenon',
    'response',
    'emission',
    'production',
    'reduction',
    'increase',
    'decrease',
    'interaction',
    'loss',
    'damage',
    'distortion',
    'magnification',
    'shadow',
    'mark',
    'marks'
  ],
  anatomy: [
    'bone',
    'joint',
    'articulation',
    'organ',
    'vessel',
    'artery',
    'vein',
    'muscle',
    'gland',
    'membrane',
    'socket',
    'cavity',
    'sinus',
    'duct',
    'nerve',
    'tissue',
    'cell',
    'cells',
    'ligament',
    'tendon',
    'cartilage',
    'valve',
    'chamber',
    'lobe',
    'canal',
    'foramen',
    'process',
    'eminence',
    'tubercle',
    'tuberosity',
    'border',
    'surface'
  ],
  principle: [
    'principle',
    'doctrine',
    'law',
    'rule',
    'right',
    'concept',
    'theory',
    // Not "term": "Ultrasonography term for ..." and "the term bolus" say nothing about the kind.
    'circumstance',
    'consent',
    'standard',
    'policy',
    'act',
    'duty',
    'obligation',
    'responsibility'
  ]
}

/** First matching kind wins, so a word listed twice ("chamber") goes to the earlier kind. */
const KIND_OF_WORD = new Map<string, Kind>()
for (const [kind, words] of Object.entries(KIND_WORDS) as [Kind, string[]][]) {
  for (const word of words) if (!KIND_OF_WORD.has(word)) KIND_OF_WORD.set(word, kind)
}

/** Term endings that name a kind on their own: "Osteoporosis", "Sensitometry", "Densitometer". */
const KIND_BY_ENDING: [RegExp, Kind][] = [
  [
    /(?:osis|itis|emia|aemia|pathy|ectasis|ptosis|plasia|trophy|rrhea|rrhoea|rrhage|stenosis|emesis|algia|oma)$/,
    'condition'
  ],
  [/(?:graphy|scopy|ectomy|otomy|ostomy|plasty|centesis|metry)$/, 'procedure'],
  [/(?:meter|scope)$/, 'device']
]

/** Words that can come before the class word: "Small container", "Grainy appearance", "Long-term effect". */
const MAX_WORDS_BEFORE_CLASS = 3
const LEADING_FILLER = new Set(['a', 'an', 'the', 'any', 'one', 'type', 'kind', 'form', 'sort'])

export function kindOf(term: string, definition: string): Kind | undefined {
  const words = definition
    .toLowerCase()
    .split(/[^\p{L}-]+/u)
    .filter((w) => w !== '' && !LEADING_FILLER.has(w))
  for (const word of words.slice(0, MAX_WORDS_BEFORE_CLASS + 1)) {
    const kind = KIND_OF_WORD.get(word)
    if (kind) return kind
    // "of", "that", "used", ...: the class word would have come before these.
    if (/^(?:of|that|which|who|used|in|for|to|by|with|and|or|is|are|how|what|when|where|why|you|it|they)$/.test(word))
      break
  }
  const lastWord = term.toLowerCase().split(/\s+/).at(-1) ?? ''
  const fromTermWord = KIND_OF_WORD.get(lastWord)
  if (fromTermWord) return fromTermWord
  return KIND_BY_ENDING.find(([ending]) => ending.test(lastWord))?.[1]
}

/**
 * Sentences that look like definitions but say nothing about what the term is:
 * "Important consideration when ...", "Problem, especially in cool, dry weather",
 * "Key step if you want to ...", "Quick, easy solution".
 */
const VAGUE_START =
  /^(?:an?\s+|the\s+)?(?:important|key|major|common|frequent|quick|easy|good|useful|helpful|problem|example|consideration|concern|issue|thing|something|our|this|these|within|one\s+of)\b/i

export function isVagueDefinition(definition: string): boolean {
  return VAGUE_START.test(definition.trim())
}
