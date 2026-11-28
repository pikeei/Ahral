import { describe, expect, it } from 'vitest'
import { areaFromText, areaFromTitle, areaQuotas, BLUEPRINTS, CONTENT_AREAS } from './areas'
import { assignAreas } from './assign-areas'
import { question } from './test-helpers'

describe('blueprints', () => {
  it.each(Object.values(BLUEPRINTS))('$label adds up to 200 scored questions', (blueprint) => {
    expect(CONTENT_AREAS.reduce((sum, area) => sum + blueprint.counts[area], 0)).toBe(200)
  })

  it('gives a full mock exam exactly the official counts', () => {
    expect(areaQuotas(BLUEPRINTS['2022'], 200)).toEqual({
      'patient-care': 33,
      safety: 50,
      'image-production': 51,
      procedures: 66
    })
  })

  it('scales a shorter exam in the same proportions, adding up exactly', () => {
    const quotas = areaQuotas(BLUEPRINTS['2027'], 50)
    expect(Object.values(quotas).reduce((a, b) => a + b, 0)).toBe(50)
    expect(quotas).toEqual({ 'patient-care': 8, safety: 11, 'image-production': 13, procedures: 18 })
  })
})

describe('areaFromTitle', () => {
  it.each([
    ['Chapter 1: Patient Care (150 Q & Ans.)', 'patient-care'],
    ['Patient Care and Education', 'patient-care'],
    ['Chapter 3: Radiation Protection', 'safety'],
    ['Image Acquisition and Evaluation', 'image-production'],
    ['Equipment Operation and Quality Control', 'image-production'],
    ['Chapter 5 Equipment Operation and Maintenance', 'image-production'],
    ['Imaging Procedures', 'procedures'],
    ['Chapter 2 Radiographic Procedures', 'procedures']
  ])('%s -> %s', (title, area) => {
    expect(areaFromTitle(title)).toBe(area)
  })

  it('places nothing for an unrelated title', () => {
    expect(areaFromTitle('Practice Test 1 › Questions')).toBeUndefined()
  })
})

describe('areaFromText', () => {
  it('places a question by its topic words', () => {
    expect(areaFromText('The annual occupational dose limit, measured with a dosimeter, is 50 mSv')).toBe('safety')
    expect(areaFromText('For a lateral projection of the knee, the central ray is angled 5 degrees cephalad')).toBe(
      'procedures'
    )
  })

  it('places nothing when the clues are few or split', () => {
    expect(areaFromText('Which of the following is correct?')).toBeUndefined()
    expect(areaFromText('The patient dose and the grid')).toBeUndefined()
  })
})

describe('assignAreas', () => {
  const block = (text: string) => ({
    id: 1,
    kind: 'paragraph' as const,
    text,
    page: 1,
    pageBreaks: [],
    fontSize: 11,
    boldRuns: [],
    sectionId: 1
  })
  const sections = [
    { id: 1, title: 'Radiation Protection', level: 1, parentId: null, pageStart: 1, pageEnd: 5 },
    { id: 2, title: 'Questions', level: 2, parentId: 1, pageStart: 2, pageEnd: 5 },
    { id: 3, title: 'Practice Test 1', level: 1, parentId: null, pageStart: 6, pageEnd: 9 }
  ]

  it('takes the area of the section or an enclosing one, else the topic words', () => {
    const [inChapter, inPractice, unclear] = assignAreas({ sections, blocks: [block('Review book')] }, [
      question('a', { sectionId: 2 }),
      question('b', { sectionId: 3, prompt: 'The central ray for a lateral projection of the hip is angled cephalad' }),
      question('c', { sectionId: 3, prompt: 'Which is true?' })
    ])
    expect(inChapter?.area).toBe('safety')
    expect(inPractice?.area).toBe('procedures')
    expect(unclear?.area).toBeUndefined()
  })

  it('takes the document title when sections have none', () => {
    const [q] = assignAreas({ sections: [], blocks: [block('Chapter 1: Patient Care (150 Q & Ans.)')] }, [
      question('a', { sectionId: 1 })
    ])
    expect(q?.area).toBe('patient-care')
  })
})
