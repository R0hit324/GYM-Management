/**
 * Device PDF renderer (Production Readiness Stage 2B, WS-4).
 *
 * expo-print renders the receipt HTML to a PDF using the platform WebView,
 * so member names in any script render correctly (no hand-rolled font
 * encoding). `base64: true` returns the PDF bytes for a Storage upload.
 *
 * Kept out of the service barrel so tests can exercise the issuance
 * pipeline with an injected renderer and never load a native module.
 */
import * as Print from 'expo-print';

export interface RenderedReceiptPdf {
  base64: string;
  numberOfPages: number;
}

export async function renderReceiptPdf(html: string): Promise<RenderedReceiptPdf> {
  const result = await Print.printToFileAsync({
    html,
    base64: true,
    width: 595, // A4 at 72 PPI
    height: 842,
  });
  if (!result.base64) throw new Error('The PDF renderer returned no data.');
  return { base64: result.base64, numberOfPages: result.numberOfPages };
}
