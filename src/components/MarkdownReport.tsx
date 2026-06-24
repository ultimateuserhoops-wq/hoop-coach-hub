import { useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Copy, Printer } from "lucide-react";
import { toast } from "sonner";

// Styled renderers so the AI markdown (headings, tables, lists) looks like a
// real training document instead of raw text.
const mdComponents = {
  h1: (p: any) => <h1 className="font-display text-2xl text-foreground mt-1 mb-3" {...p} />,
  h2: (p: any) => <h2 className="font-display text-xl text-foreground mt-6 mb-2 border-b border-border pb-1" {...p} />,
  h3: (p: any) => <h3 className="font-semibold text-base text-foreground mt-4 mb-1" {...p} />,
  p: (p: any) => <p className="my-2 leading-relaxed text-sm text-foreground/90" {...p} />,
  ul: (p: any) => <ul className="list-disc pl-5 my-2 space-y-1 text-sm text-foreground/90" {...p} />,
  ol: (p: any) => <ol className="list-decimal pl-5 my-2 space-y-1 text-sm text-foreground/90" {...p} />,
  li: (p: any) => <li {...p} />,
  strong: (p: any) => <strong className="font-semibold text-foreground" {...p} />,
  hr: () => <hr className="my-4 border-border" />,
  blockquote: (p: any) => <blockquote className="border-l-4 border-primary/40 pl-3 italic my-2 text-foreground/80" {...p} />,
  code: (p: any) => <code className="bg-muted px-1 py-0.5 rounded text-xs" {...p} />,
  table: (p: any) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...p} />
    </div>
  ),
  thead: (p: any) => <thead className="bg-accent" {...p} />,
  th: (p: any) => <th className="border border-border px-3 py-2 text-left font-semibold" {...p} />,
  td: (p: any) => <td className="border border-border px-3 py-2 align-top" {...p} />,
};

const PRINT_CSS = `
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #111; font-size: 12px; line-height: 1.55; margin: 0; }
  .doc-head { border-bottom: 3px solid #F97316; padding-bottom: 8px; margin-bottom: 18px; display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .brand { font-weight: 800; font-size: 16px; letter-spacing: 1px; color: #0A0A0A; }
  .meta { font-size: 11px; color: #666; white-space: nowrap; }
  h1 { font-size: 18px; margin: 6px 0; }
  h2 { font-size: 15px; margin: 14px 0 6px; border-bottom: 1px solid #e2e2e2; padding-bottom: 3px; }
  h3 { font-size: 13px; margin: 10px 0 4px; }
  p { margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 11px; }
  th, td { border: 1px solid #c9c9c9; padding: 5px 7px; text-align: left; vertical-align: top; }
  thead th { background: #FFF1E6; }
  ul, ol { margin: 6px 0; padding-left: 18px; }
  li { margin: 2px 0; }
  hr { border: none; border-top: 1px solid #eee; margin: 10px 0; }
  tr, li { page-break-inside: avoid; }
  h1, h2, h3 { page-break-after: avoid; }
`;

function printReport(html: string, title: string) {
  const w = window.open("", "_blank", "width=900,height=1200");
  if (!w) {
    toast.error("Trình duyệt đã chặn cửa sổ in. Vui lòng cho phép pop-up.");
    return;
  }
  const today = new Date().toLocaleDateString("vi-VN");
  const safeTitle = title.replace(/</g, "&lt;");
  w.document.write(
    `<!doctype html><html lang="vi"><head><meta charset="utf-8" />` +
      `<title>${safeTitle}</title><style>${PRINT_CSS}</style></head><body>` +
      `<header class="doc-head"><div class="brand">BDC BASKETBALL CENTRE</div>` +
      `<div class="meta">${safeTitle} · Ngày in: ${today}</div></header>` +
      `<main>${html}</main>` +
      `<script>window.onload=function(){window.focus();window.print();}</script>` +
      `</body></html>`,
  );
  w.document.close();
}

export function MarkdownReport({ title, content }: { title: string; content: string }) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div>
      <div className="flex flex-wrap gap-2 justify-end mb-3">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            navigator.clipboard.writeText(content);
            toast.success("Đã sao chép");
          }}
        >
          <Copy className="size-4" /> Sao chép
        </Button>
        <Button size="sm" onClick={() => printReport(ref.current?.innerHTML ?? "", title)}>
          <Printer className="size-4" /> In / Lưu PDF
        </Button>
      </div>
      <div
        ref={ref}
        className="markdown-report max-h-[70vh] overflow-auto bg-card border border-border rounded-lg p-5"
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
