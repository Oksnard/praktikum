"""Regenerate deterministic real UTF-8/CP1251/UTF16, OOXML and PDF fixtures (stdlib only)."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from xml.sax.saxutils import escape
root=Path(__file__).parent
text='Перед встречей сотрудник изучает запрос клиента. После встречи он записывает договорённости в систему и назначает следующий шаг.'
(root/'russian.txt').write_text(text,encoding='utf-8')
(root/'russian-cp1251.txt').write_bytes(text.encode('cp1251'))
(root/'russian-utf16.txt').write_bytes(text.encode('utf-16'))
with ZipFile(root/'russian.docx','w',ZIP_DEFLATED) as z:
 z.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
 z.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>'+escape(text)+'</w:t></w:r></w:p></w:body></w:document>')
with ZipFile(root/'bomb.docx','w',ZIP_DEFLATED) as z:
 z.writestr('word/document.xml','A'*6000000)
def pdf(path,content):
 chars=sorted(set(text)); cmap='\n'.join(f'<{ord(c):04X}> <{ord(c):04X}>' for c in chars)
 mapping=f'/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Test def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n{len(chars)} beginbfchar\n{cmap}\nendbfchar\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend'.encode()
 stream=content.encode()
 objs=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',f'<< /Length {len(stream)} >>\nstream\n'.encode()+stream+b'\nendstream',b'<< /Type /Font /Subtype /Type0 /BaseFont /Arial /Encoding /Identity-H /DescendantFonts [6 0 R] /ToUnicode 7 0 R >>',b'<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Arial /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /DW 500 >>',f'<< /Length {len(mapping)} >>\nstream\n'.encode()+mapping+b'\nendstream']
 data=b'%PDF-1.4\n';offsets=[0]
 for n,obj in enumerate(objs,1):
  offsets.append(len(data));data+=f'{n} 0 obj\n'.encode()+obj+b'\nendobj\n'
 offset=len(data);data+=f'xref\n0 {len(objs)+1}\n0000000000 65535 f \n'.encode()
 data+=b''.join(f'{o:010} 00000 n \n'.encode() for o in offsets[1:])
 data+=f'trailer\n<< /Size {len(objs)+1} /Root 1 0 R >>\nstartxref\n{offset}\n%%EOF\n'.encode()
 path.write_bytes(data)
pdf(root/'russian.pdf','BT /F1 12 Tf 30 700 Td <'+text.encode('utf-16-be').hex()+'> Tj ET')
pdf(root/'scan.pdf','0.7 g 20 20 100 100 re f')
