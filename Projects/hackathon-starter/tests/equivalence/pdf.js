// A three-page PDF made on the fly (page 2 has two lines, page 3 has no text), for the RAG ingestion scenarios.
'use strict'
module.exports = function samplePdf() {
  const objs = []
  const page = (content) => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${content} 0 R /Resources << /Font << /F1 9 0 R >> >> >>`
  const stream = (s) => `<< /Length ${s.length} >>\nstream\n${s}\nendstream`
  objs.push('<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 >>')
  objs.push(page(4), stream('BT /F1 24 Tf 72 700 Td (Hello TL) Tj ET'))
  objs.push(page(6), stream('BT /F1 12 Tf 72 700 Td (Line one) Tj 0 -20 Td (Line two) Tj 100 0 Td (same line) Tj ET'))
  objs.push(page(8), stream(''))
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  let out = '%PDF-1.4\n'
  const offsets = []
  objs.forEach((body, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${body}\nendobj\n` })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info << /Title (T) >> >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}
