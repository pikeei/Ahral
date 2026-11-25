/**
 * Draws the app icon (build/icon.png, 512×512). electron-builder turns it into
 * the Windows .ico for the exe, installer and shortcuts.
 *
 *   npm run icon
 *
 * Drawn in code so it can be changed without an image editor.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { createCanvas } from '@napi-rs/canvas'

const SIZE = 512
const canvas = createCanvas(SIZE, SIZE)
const ctx = canvas.getContext('2d')

function roundedRect(x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// Background: indigo tile, as in the app's buttons.
const background = ctx.createLinearGradient(0, 0, SIZE, SIZE)
background.addColorStop(0, '#6366f1')
background.addColorStop(1, '#4338ca')
roundedRect(16, 16, SIZE - 32, SIZE - 32, 104)
ctx.fillStyle = background
ctx.fill()

// A page with a folded corner.
const page = { x: 128, y: 92, w: 236, h: 300, fold: 64 }
ctx.beginPath()
ctx.moveTo(page.x, page.y + 20)
ctx.arcTo(page.x, page.y, page.x + 20, page.y, 20)
ctx.lineTo(page.x + page.w - page.fold, page.y)
ctx.lineTo(page.x + page.w, page.y + page.fold)
ctx.lineTo(page.x + page.w, page.y + page.h - 20)
ctx.arcTo(page.x + page.w, page.y + page.h, page.x + page.w - 20, page.y + page.h, 20)
ctx.lineTo(page.x + 20, page.y + page.h)
ctx.arcTo(page.x, page.y + page.h, page.x, page.y + page.h - 20, 20)
ctx.closePath()
ctx.fillStyle = '#ffffff'
ctx.fill()
ctx.beginPath()
ctx.moveTo(page.x + page.w - page.fold, page.y)
ctx.lineTo(page.x + page.w - page.fold, page.y + page.fold)
ctx.lineTo(page.x + page.w, page.y + page.fold)
ctx.closePath()
ctx.fillStyle = '#c7d2fe'
ctx.fill()

// Text lines, one of them a blank to fill in.
ctx.lineCap = 'round'
ctx.lineWidth = 18
ctx.strokeStyle = '#a5b4fc'
for (const [y, from, to] of [
  [190, 168, 324],
  [240, 168, 300],
  [290, 168, 250]
] as const) {
  ctx.beginPath()
  ctx.moveTo(from, y)
  ctx.lineTo(to, y)
  ctx.stroke()
}

// The check mark badge: the answer is right.
ctx.beginPath()
ctx.arc(354, 366, 86, 0, Math.PI * 2)
ctx.fillStyle = '#10b981'
ctx.fill()
ctx.lineWidth = 16
ctx.strokeStyle = '#4338ca'
ctx.stroke()
ctx.beginPath()
ctx.moveTo(312, 366)
ctx.lineTo(342, 396)
ctx.lineTo(398, 338)
ctx.lineWidth = 22
ctx.lineJoin = 'round'
ctx.strokeStyle = '#ffffff'
ctx.stroke()

mkdirSync('build', { recursive: true })
writeFileSync('build/icon.png', await canvas.encode('png'))
console.log('Wrote build/icon.png')
