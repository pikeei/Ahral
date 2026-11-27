// PDF.js ships its worker without type declarations; Ahral only hands the module to PDF.js.
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown
}
