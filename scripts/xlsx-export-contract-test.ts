import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { buildXlsxBlob, escapeCsvCell } from '../src/services/xlsxExport.ts';

const blob = await buildXlsxBlob([
  { Nome: 'João & Maria', CPF: '000.000.000-00', Nota: 92, PIN: '0012', Formula: '=1+1', Controle: '\u0001OK' },
], 'Participantes');
if (process.env.XLSX_TEST_OUTPUT) await writeFile(process.env.XLSX_TEST_OUTPUT, Buffer.from(await blob.arrayBuffer()));
const workbook = await JSZip.loadAsync(blob);
for (const path of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml',
  'xl/_rels/workbook.xml.rels', 'xl/worksheets/sheet1.xml']) {
  assert.ok(workbook.file(path), `arquivo XLSX ausente: ${path}`);
}
const workbookXml = await workbook.file('xl/workbook.xml')!.async('string');
const sheetXml = await workbook.file('xl/worksheets/sheet1.xml')!.async('string');
assert.match(workbookXml, /name="Participantes"/);
assert.match(sheetXml, /João &amp; Maria/);
assert.match(sheetXml, /000\.000\.000-00/);
assert.match(sheetXml, /<c r="C2"><v>92<\/v><\/c>/);
assert.match(sheetXml, /<c r="D2" t="inlineStr"><is><t xml:space="preserve">0012<\/t><\/is><\/c>/);
assert.match(sheetXml, /<c r="E2" t="inlineStr"><is><t xml:space="preserve">=1\+1<\/t><\/is><\/c>/);
assert.match(sheetXml, /<c r="F2" t="inlineStr"><is><t xml:space="preserve">OK<\/t><\/is><\/c>/);
assert.doesNotMatch(sheetXml, /<f(?:\s|>)/);
assert.equal(escapeCsvCell('=1+1'), `"'=1+1"`);
assert.equal(escapeCsvCell('0012'), `"'0012"`);
assert.equal(escapeCsvCell('João; "Maria"'), `"João; ""Maria"""`);
process.stdout.write('Exportação XLSX/CSV passou: estrutura OOXML, escape de texto, zeros à esquerda e proteção contra fórmulas.\n');
