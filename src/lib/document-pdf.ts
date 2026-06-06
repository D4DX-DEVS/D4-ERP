// ==================== Shared document → PDF rendering ====================
// Pure DOM/PDF helpers used by both the invoice and quotation preview pages.
// Renders an on-screen preview element into a paginated A4 PDF Blob via
// html2canvas + jsPDF. Kept framework-agnostic so any page can reuse it.

/** Clones a preview element with computed inline styles for off-screen rendering. */
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

  clone.style.margin = "0";
  clone.style.width = `${Math.ceil(source.getBoundingClientRect().width)}px`;
  clone.style.maxWidth = "none";
  clone.style.background = "#ffffff";
  targetDocument.body.appendChild(clone);

  return clone;
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
