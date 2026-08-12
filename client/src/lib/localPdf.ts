import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

/** DOMを画像として取り込み、端末内だけでA4 PDFを生成する。 */
export async function downloadElementAsPdf(element: HTMLElement, filename: string): Promise<void> {
  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: false,
    logging: false,
  });
  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4", compress: true });
  const pageWidth = 210;
  const pageHeight = 297;
  const imageWidth = pageWidth;
  const imageHeight = (canvas.height * imageWidth) / canvas.width;
  const image = canvas.toDataURL("image/png");

  if (imageHeight <= pageHeight) {
    pdf.addImage(image, "PNG", 0, 0, imageWidth, imageHeight, undefined, "FAST");
  } else {
    let renderedHeight = 0;
    while (renderedHeight < imageHeight) {
      if (renderedHeight > 0) pdf.addPage();
      pdf.addImage(image, "PNG", 0, -renderedHeight, imageWidth, imageHeight, undefined, "FAST");
      renderedHeight += pageHeight;
    }
  }
  pdf.save(filename);
}
