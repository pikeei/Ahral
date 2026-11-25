import { buildPdf, type PdfLine, textLines } from './pdf-builder'

/**
 * A small "review book" PDF that reproduces every real-world problem found so far:
 * - the letter f and the f-ligatures are missing from the text layer, leaving gaps
 *   ("of" -> "o", "specific" -> "speci c", "after" -> "a er");
 * - a broken word hyphenated across two lines ("femo-" / "ral" -> "emo-" / "ral");
 * - a running header and page-number footer on every page;
 * - a two-column page with a narrow gutter;
 * - a question with (A)-(D) options and an "Answers and Explanations" section;
 * - a glossary list with two deliberately similar definitions (ampoule / vial);
 * - a bold term followed by its definition.
 */

/** Simulates a font whose character map has no "f": ligatures leave a gap, a plain f vanishes. */
export function dropLetterF(text: string): string {
  return text.replace(/ffi|ffl|ff|fi|fl|ft/g, ' ').replace(/f/g, '')
}

const broken = (lines: PdfLine[]): PdfLine[] => lines.map((l) => ({ ...l, text: dropLetterF(l.text) }))

const pageChrome = (n: number): PdfLine[] => [
  { text: 'Radiography Review Notes', y: 760, size: 9 },
  { text: `Page ${n}`, x: 290, y: 30, size: 9 }
]

const page1: PdfLine[] = [
  ...pageChrome(1),
  { text: 'Chapter 1 Patient Care', y: 710, size: 18, bold: true },
  ...broken(
    textLines(
      [
        'The five most easily palpated pulse points are the radial, carotid, temporal, femo-',
        'ral, and popliteal pulses. The radial pulse is used most frequently in clinical',
        'practice. The apical pulse, at the apex of the heart, is the most accurate and can be',
        'determined with the use of a stethoscope.',
        'Infection control is a fundamental part of patient care in every imaging department.',
        'A reservoir is a site where an infectious organism can remain alive and from which',
        'transmission can occur. A vector is an animal host of an infectious organism that',
        'transmits the infection through a bite or sting. Contact precautions require gloves',
        'and gowns for anyone coming in direct contact with the infected patient.'
      ],
      680
    )
  ),
  { text: '1.1 Medication Containers', y: 540, size: 14, bold: true },
  ...broken(
    textLines(
      [
        '• Ampoule - a small sealed container that usually holds a single dose of medication.',
        '• Vial - a larger container that holds a number of doses of medication.',
        '• Carafe - a narrow-mouthed container that is not used for medical purposes.',
        '• Syringe - a device used to inject fluids into the body or withdraw them.',
        '• Catheter - a flexible tube inserted into the body to deliver or drain fluids.'
      ],
      510
    )
  )
]

const left = [
  'Radiation protection begins with time,',
  'distance and shielding. The inverse',
  'square law describes how intensity',
  'changes with distance from the source.',
  'Doubling the distance reduces the',
  'intensity to one fourth of its value.',
  'Personnel should stand as far from the',
  'patient as practical during exposure.'
]
const right = [
  'Lead aprons provide effective shielding',
  'for staff during fluoroscopy. The half',
  'value layer is the thickness of any',
  'absorber that reduces beam intensity to',
  'one half of its original value. Added',
  'filtration removes low energy photons',
  'and reduces the patient skin dose for',
  'every examination that is performed.'
]
const page2: PdfLine[] = [
  ...pageChrome(2),
  { text: 'Chapter 2 Radiation Protection', y: 710, size: 18, bold: true },
  ...broken(textLines(left, 670, { x: 72 })),
  ...broken(textLines(right, 670, { x: 318 }))
]

const page3: PdfLine[] = [
  ...pageChrome(3),
  { text: 'Questions', y: 710, size: 14, bold: true },
  ...broken(
    textLines(
      [
        'Which blood vessels are best suited for determination of pulse rate?',
        '(A) Superficial arteries',
        '(B) Deep arteries',
        '(C) Superficial veins',
        '(D) Deep veins'
      ],
      680
    )
  ),
  { text: 'Answers and Explanations', y: 590, size: 14, bold: true },
  ...broken(
    textLines(
      [
        '(A) Superficial arteries are best suited for determination of pulse rate. The femoral',
        'pulse is felt in the groin. Kilovoltage is the primary factor that controls beam',
        'quality, while milliamperage controls the quantity of photons produced.',
        '(D) The portal of entry is the pathway by which infectious organisms enter the body.',
        'Proper body mechanics help prevent back injury when moving patients from a stretcher.',
        'Hand hygiene is the single most effective way to prevent the spread of infection.',
        'Standard precautions apply to every patient regardless of the final diagnosis.'
      ],
      560
    )
  ),
  { text: 'Thoracentesis', y: 450, bold: true },
  {
    text: dropLetterF('is a procedure used to remove fluid from the pleural cavity of the chest.'),
    x: 152,
    y: 450
  }
]

export function buildGoldenPdf(): Promise<Uint8Array> {
  return buildPdf([page1, page2, page3])
}
