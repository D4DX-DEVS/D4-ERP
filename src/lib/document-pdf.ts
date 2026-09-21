// ==================== Shared document → PDF rendering ====================
// Pure DOM/PDF helpers used by both the invoice and quotation preview pages.
// Renders an on-screen preview element into a paginated A4 PDF Blob via
// html2canvas + jsPDF. Kept framework-agnostic so any page can reuse it.

/**
 * Clones a preview element with computed inline styles for off-screen rendering.
 *
 * Anything marked `data-pdf-hide` is dropped from the clone: a preview doubles
 * as the author's working view, so it carries notes meant for whoever is
 * assembling the document rather than for whoever receives it.
 */
function cloneForPdf(source: HTMLElement, targetDocument: Document): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  const sourceElements = [source, ...Array.from(source.querySelectorAll<HTMLElement>("*"))];
  const cloneElements = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>("*"))];

  sourceElements.forEach((sourceElement, index) => {
    const cloneElement = cloneElements[index];
    if (!cloneElement) return;

    cloneElement.className = "";

    const computedStyle = window.getComputedStyle(sourceElement);
    for (const property of Array.from(computedStyle)) {
      const value = computedStyle.getPropertyValue(property);
      if (!value || property.startsWith("--")) continue;
      // Skip modern color spaces html2canvas cannot parse.
      if (value.includes("lab(") || value.includes("oklab(") || value.includes("color-mix(")) continue;
      cloneElement.style.setProperty(property, value, computedStyle.getPropertyPriority(property));
    }

    cloneElement.style.setProperty("color-scheme", "light");
    cloneElement.style.setProperty("animation", "none");
    cloneElement.style.setProperty("transition", "none");
    cloneElement.style.setProperty("backdrop-filter", "none");
    cloneElement.style.setProperty("filter", "none");
  });

  // After the styles are copied, so the index pairing above stays aligned.
  clone.querySelectorAll("[data-pdf-hide]").forEach((node) => node.remove());

  clone.style.margin = "0";
  clone.style.width = `${Math.ceil(source.getBoundingClientRect().width)}px`;
  clone.style.maxWidth = "none";
  clone.style.background = "#ffffff";
  targetDocument.body.appendChild(clone);

  return clone;
}

/**
 * Copies the page's @font-face rules into the sandbox.
 *
 * The sandbox is written from scratch, so without this it has no webfonts at
 * all: the clone still asks for Poppins and Noto Sans Malayalam by name, gets a
 * system face with different metrics, and html2canvas lays the text out to the
 * wrong advances — which is what ran words together in the export
 * ("OrganizatiorReport", "DesignSquad(GraphicDesigning)").
 *
 * Only @font-face is copied. Pulling in the app's stylesheets would bring back
 * the oklch()/color-mix() values html2canvas cannot parse.
 */
function copyFontFaces(targetDocument: Document): void {
  const faces: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // A cross-origin stylesheet — nothing readable here.
    }
    // src: url(...) is written relative to the stylesheet, not to the page, so
    // each one is resolved against its own sheet before it is moved.
    const base = sheet.href ?? document.baseURI;
    for (const rule of Array.from(rules)) {
      if (rule.constructor.name !== "CSSFontFaceRule") continue;
      faces.push(
        rule.cssText.replace(/url\((['"]?)([^'")]+)\1\)/g, (match, quote, href) => {
          try {
            return `url(${quote}${new URL(href, base).href}${quote})`;
          } catch {
            return match;
          }
        })
      );
    }
  }
  if (faces.length === 0) return;
  const style = targetDocument.createElement("style");
  style.textContent = faces.join("\n");
  targetDocument.head.appendChild(style);
}

/** Waits for the sandbox's webfonts, so nothing is measured against a fallback. */
async function waitForFonts(targetDocument: Document): Promise<void> {
  const fonts = (targetDocument as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts) return;
  try {
    await Promise.race([fonts.ready, new Promise((resolve) => setTimeout(resolve, 3000))]);
  } catch {
    // A font that refuses to load is not a reason to refuse the PDF.
  }
}

/** Creates a hidden iframe sandbox so cloned styles don't affect the live page. */
function createPdfSandbox(title: string) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  document.body.appendChild(iframe);

  const sandboxDocument = iframe.contentDocument;
  if (!sandboxDocument) {
    iframe.remove();
    throw new Error("Failed to prepare PDF sandbox");
  }

  sandboxDocument.open();
  sandboxDocument.write(
    `<!doctype html><html><head><meta charset="utf-8" /><title>${title}</title><style>html,body{margin:0;padding:0;background:#fff}*,*::before,*::after{box-sizing:border-box}table{border-collapse:collapse}td,th{vertical-align:top}</style></head><body></body></html>`
  );
  sandboxDocument.close();
  copyFontFaces(sandboxDocument);

  return { iframe, sandboxDocument, cleanup: () => iframe.remove() };
}

/**
 * Renders a preview element into a multi-page A4 PDF and returns it as a Blob.
 * @param element The on-screen preview node to capture.
 * @param title   Document title used inside the sandbox.
 */
export async function generateDocumentPdfBlob(element: HTMLElement, title = "Document"): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const { sandboxDocument, cleanup } = createPdfSandbox(title);

  try {
    const sandboxNode = cloneForPdf(element, sandboxDocument);
    await waitForFonts(sandboxDocument);
    const canvas = await html2canvas(sandboxNode, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
      windowWidth: sandboxNode.scrollWidth,
      windowHeight: sandboxNode.scrollHeight,
    });

    const pdf = new jsPDF({ format: "a4", orientation: "portrait", unit: "pt" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 24;
    const usableWidth = pageWidth - margin * 2;
    const usableHeight = pageHeight - margin * 2;

    const pageCanvasHeight = Math.max(1, Math.floor((canvas.width / usableWidth) * usableHeight));

    let renderedHeight = 0;
    let pageIndex = 0;

    while (renderedHeight < canvas.height) {
      const sliceHeight = Math.min(pageCanvasHeight, canvas.height - renderedHeight);

      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeight;

      const context = pageCanvas.getContext("2d");
      if (!context) throw new Error("Failed to prepare PDF page");

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      context.drawImage(canvas, 0, renderedHeight, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

      const sliceData = pageCanvas.toDataURL("image/png");
      const sliceImageHeight = (sliceHeight * usableWidth) / canvas.width;

      if (pageIndex > 0) pdf.addPage();
      pdf.addImage(sliceData, "PNG", margin, margin, usableWidth, sliceImageHeight, undefined, "FAST");

      renderedHeight += sliceHeight;
      pageIndex += 1;
    }

    return pdf.output("blob");
  } finally {
    cleanup();
  }
}

export interface PaginatedPdfOptions {
  /** Shown bottom-left on every page, e.g. "Confidential · D4Media". */
  footerLeft?: string;
  /** Shown top-left from page 2 on, e.g. the report title and period. */
  runningHeader?: string;
  title?: string;
}

/**
 * Renders a long document element into a paginated A4 PDF with a running
 * header and "Page x of y" on every page.
 *
 * The body is rasterised by the browser rather than typeset by jsPDF, because
 * these reports are written in Malayalam: jsPDF cannot shape Indic scripts
 * (conjuncts and reordered vowel signs come out mangled), while the browser
 * already shaped the text correctly on screen. The furniture — header, footer,
 * page numbers — is drawn as real PDF text on top.
 */
export async function generatePaginatedPdfBlob(
  element: HTMLElement,
  options: PaginatedPdfOptions = {}
): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const { sandboxDocument, cleanup } = createPdfSandbox(options.title ?? "Document");

  try {
    const sandboxNode = cloneForPdf(element, sandboxDocument);
    await waitForFonts(sandboxDocument);
    const canvas = await html2canvas(sandboxNode, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
      windowWidth: sandboxNode.scrollWidth,
      windowHeight: sandboxNode.scrollHeight,
    });

    const pdf = new jsPDF({ format: "a4", orientation: "portrait", unit: "pt" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 28;
    // Room reserved top and bottom so the furniture never sits on the content.
    const headerSpace = options.runningHeader ? 26 : 12;
    const footerSpace = 26;
    const usableWidth = pageWidth - margin * 2;
    const usableHeight = pageHeight - margin * 2 - headerSpace - footerSpace;

    const pageCanvasHeight = Math.max(1, Math.floor((canvas.width / usableWidth) * usableHeight));

    let renderedHeight = 0;
    let pageIndex = 0;

    while (renderedHeight < canvas.height) {
      const sliceHeight = Math.min(pageCanvasHeight, canvas.height - renderedHeight);

      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeight;

      const context = pageCanvas.getContext("2d");
      if (!context) throw new Error("Failed to prepare PDF page");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      context.drawImage(canvas, 0, renderedHeight, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

      if (pageIndex > 0) pdf.addPage();
      pdf.addImage(
        pageCanvas.toDataURL("image/png"),
        "PNG",
        margin,
        margin + headerSpace,
        usableWidth,
        (sliceHeight * usableWidth) / canvas.width,
        undefined,
        "FAST"
      );

      renderedHeight += sliceHeight;
      pageIndex += 1;
    }

    const pages = pdf.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
      pdf.setPage(page);
      pdf.setFontSize(8);
      pdf.setTextColor(120, 128, 140);
      if (options.runningHeader && page > 1) {
        pdf.text(options.runningHeader, margin, margin + 4, { maxWidth: usableWidth - 60 });
      }
      if (options.footerLeft) pdf.text(options.footerLeft, margin, pageHeight - 18);
      pdf.text(`Page ${page} of ${pages}`, pageWidth - margin, pageHeight - 18, { align: "right" });
    }

    return pdf.output("blob");
  } finally {
    cleanup();
  }
}

/** Triggers a browser download for a PDF blob. */
export function downloadPdfBlob(blob: Blob, fileName: string): void {
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

/** Opens the browser print dialog for a PDF blob via a hidden iframe. */
export function printPdfBlob(blob: Blob): void {
  const blobUrl = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.src = blobUrl;
  document.body.appendChild(iframe);

  iframe.onload = () => {
    window.setTimeout(() => {
      const printWindow = iframe.contentWindow;
      if (!printWindow) {
        window.open(blobUrl, "_blank", "noopener,noreferrer");
        return;
      }
      printWindow.focus();
      printWindow.print();
      window.setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
        iframe.remove();
      }, 60000);
    }, 350);
  };
}
