import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export interface DocumentInput {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}
const formats: Record<string, { mime: string; signature?: Buffer }> = {
  ".txt": { mime: "text/plain" },
  ".pdf": { mime: "application/pdf", signature: Buffer.from("%PDF-") },
  ".doc": {
    mime: "application/msword",
    signature: Buffer.from("d0cf11e0a1b11ae1", "hex"),
  },
  ".docx": {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    signature: Buffer.from("504b0304", "hex"),
  },
};
// No extraction to disk, no entity expansion, and ZIP metadata checked before any read.
const PYTHON_LIMITS = String.raw`
import resource, sys
resource.setrlimit(resource.RLIMIT_CPU, (8, 8))
if sys.platform != "darwin": resource.setrlimit(resource.RLIMIT_AS, (512*1024*1024, 512*1024*1024))
`;
const PDF =
  PYTHON_LIMITS +
  String.raw`
import sys
try:
 from pypdf import PdfReader, filters
except ImportError:
 sys.exit(78)
filters.ZLIB_MAX_OUTPUT_LENGTH=20*1024*1024
r=PdfReader(sys.argv[1], strict=True)
if r.is_encrypted or len(r.pages)>200: raise ValueError()
parts=[]
for p in r.pages:
 c=p.get_contents()
 if c is not None and len(c.get_data())>2*1024*1024: raise ValueError()
 parts.append(p.extract_text() or "")
 if sum(len(s) for s in parts)>12000: sys.exit(79)
print("\n".join(parts))
`;
const DOCX =
  PYTHON_LIMITS +
  String.raw`
import sys, zipfile, xml.etree.ElementTree as E
with zipfile.ZipFile(sys.argv[1]) as z:
 infos=z.infolist()
 if len(infos)>500 or len({i.filename for i in infos})!=len(infos): raise ValueError()
 if sum(i.file_size for i in infos)>20*1024*1024: raise ValueError()
 for i in infos:
  if i.flag_bits&1 or i.file_size>5*1024*1024 or i.file_size>max(i.compress_size,1)*100: raise ValueError()
  if i.filename.startswith('/') or '..' in i.filename.split('/'): raise ValueError()
 if '[Content_Types].xml' not in z.namelist() or 'word/document.xml' not in z.namelist(): raise ValueError()
 types=z.read('[Content_Types].xml')
 if b'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml' not in types: raise ValueError()
 ns='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
 data=z.read('word/document.xml')
 if b'\x00' in data or b'<!DOCTYPE' in data or b'<!ENTITY' in data: raise ValueError()
 root=E.fromstring(data)
 if root.tag!=ns+'document': raise ValueError()
 paragraphs=[]
 for p in root.iter(ns+'p'):
  paragraphs.append(''.join((n.text or '') if n.tag==ns+'t' else ('\t' if n.tag==ns+'tab' else '\n') for n in p.iter() if n.tag in (ns+'t',ns+'tab',ns+'br')))
 print('\n'.join(paragraphs))
`;
export function runDocumentCommand(
  command: string,
  args: string[],
  limits: { timeoutMs?: number; rssKiB?: number } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let settled = false;
    let output = Buffer.alloc(0);
    let bytes = 0;
    let polling = false;
    const fail = () =>
      new BadRequestException(
        "Не удалось прочитать документ: он повреждён, защищён паролем или превышает лимиты обработки",
      );
    const killGroup = () => {
      if (child.pid) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          /* Already gone. */
        }
      }
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      clearInterval(watchdog);
      killGroup(); // Also remove descendants left by a converter that exited successfully.
      child.stdout.destroy();
      child.stderr.destroy();
      if (error) reject(error);
      else resolve(output.toString("utf8"));
    };
    const deadline = setTimeout(
      () => finish(fail()),
      limits.timeoutMs ?? 10000,
    );
    const watchdog = setInterval(() => {
      if (polling || settled || !child.pid) return;
      polling = true;
      execFile(
        "ps",
        ["-axo", "pgid=,rss="],
        { timeout: 500, killSignal: "SIGKILL", maxBuffer: 512 * 1024 },
        (error, stdout) => {
          polling = false;
          if (settled) return;
          if (error) {
            finish(fail());
            return;
          } // Fail closed when resource monitoring is unavailable.
          const rss = stdout.split("\n").reduce((sum, line) => {
            const [group, memory] = line.trim().split(/\s+/).map(Number);
            return group === child.pid ? sum + memory : sum;
          }, 0);
          if (rss > (limits.rssKiB ?? 256 * 1024)) finish(fail());
        },
      );
    }, 100);
    const consume = (data: Buffer, capture: boolean) => {
      bytes += data.length;
      if (bytes > 1024 * 1024) {
        finish(fail());
        return;
      }
      if (capture) output = Buffer.concat([output, data]);
    };
    child.stdout.on("data", (data: Buffer) => consume(data, true));
    child.stderr.on("data", (data: Buffer) => consume(data, false));
    child.on("error", (error: NodeJS.ErrnoException) =>
      finish(
        error.code === "ENOENT"
          ? new ServiceUnavailableException(
              "Обработка документов не настроена на сервере",
            )
          : fail(),
      ),
    );
    child.on("exit", () => killGroup());
    child.on("close", (code) =>
      finish(
        code === 0
          ? undefined
          : code === 78
            ? new ServiceUnavailableException(
                "Обработка документов не настроена на сервере",
              )
            : code === 79
              ? new BadRequestException(
                  "В документе больше 12 000 символов. Разделите его на несколько материалов; текст не был обрезан",
                )
              : fail(),
      ),
    );
  });
}
function decodeText(buffer: Buffer): string {
  let encoding = "utf-8";
  if (buffer.subarray(0, 2).equals(Buffer.from([255, 254])))
    encoding = "utf-16le";
  else if (buffer.subarray(0, 2).equals(Buffer.from([254, 255])))
    encoding = "utf-16be";
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(buffer);
  } catch {
    if (encoding !== "utf-8")
      throw new BadRequestException("Некорректная кодировка TXT");
    return new TextDecoder("windows-1251", { fatal: true }).decode(buffer);
  }
}
@Injectable()
export class DocumentParser {
  async extract(file: DocumentInput) {
    const extension = extname(file.originalname).toLowerCase();
    const format = formats[extension];
    if (
      !format ||
      (file.mimetype !== format.mime &&
        file.mimetype !== "application/octet-stream")
    )
      throw new BadRequestException(
        "Выберите Word (.docx, .doc), PDF или TXT с соответствующим типом файла",
      );
    if (!file.buffer.length || file.buffer.length > MAX_FILE_BYTES)
      throw new BadRequestException("Размер файла: от 1 байта до 5 МиБ");
    if (
      format.signature &&
      !file.buffer.subarray(0, format.signature.length).equals(format.signature)
    )
      throw new BadRequestException(
        "Содержимое файла не соответствует расширению",
      );
    if (
      extension === ".doc" &&
      !file.buffer.includes(Buffer.from("WordDocument", "utf16le"))
    )
      throw new BadRequestException("Файл не является документом Word 97–2003");
    let text: string;
    if (extension === ".txt") {
      if (
        Object.values(formats).some(
          (f) =>
            f.signature &&
            file.buffer.subarray(0, f.signature.length).equals(f.signature),
        )
      )
        throw new BadRequestException(
          "Двоичный документ нельзя загрузить как TXT",
        );
      text = decodeText(file.buffer);
    } else {
      const dir = await mkdtemp(join(tmpdir(), "praktikum-document-"));
      try {
        const path = join(dir, `input${extension}`);
        await writeFile(path, file.buffer, { mode: 0o600 });
        text =
          extension === ".docx"
            ? await runDocumentCommand("python3", ["-c", DOCX, path])
            : extension === ".pdf"
              ? await runDocumentCommand("python3", ["-c", PDF, path])
              : process.platform === "darwin"
                ? await runDocumentCommand("/usr/bin/textutil", [
                    "-convert",
                    "txt",
                    "-encoding",
                    "UTF-8",
                    "-stdout",
                    path,
                  ])
                : await runDocumentCommand("antiword", [
                    "-m",
                    "UTF-8.txt",
                    "-w",
                    "0",
                    path,
                  ]);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }
    text = text.replace(/\r\n?/g, "\n").replace(/\f/g, "\n").trim();
    if (/[\x00-\x08\x0b\x0e-\x1f\x7f]/.test(text) || text.includes("\ufffd"))
      throw new BadRequestException(
        "Файл содержит двоичные данные или некорректный текст",
      );
    if (text.length < 60)
      throw new BadRequestException(
        "Нужно не менее 60 символов текста. Для PDF-скана сначала выполните OCR; здесь распознавания изображений нет",
      );
    if (text.length > 12000)
      throw new BadRequestException(
        "В документе больше 12 000 символов. Разделите его на несколько материалов; текст не был обрезан",
      );
    return { text, mime: format.mime };
  }
}
