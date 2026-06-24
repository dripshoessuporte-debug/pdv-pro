import { fiscalGuidePdfPart01 } from "./fiscal-guide-pdf-data/part-01";
import { fiscalGuidePdfPart02 } from "./fiscal-guide-pdf-data/part-02";
import { fiscalGuidePdfPart03 } from "./fiscal-guide-pdf-data/part-03";
import { fiscalGuidePdfPart04A } from "./fiscal-guide-pdf-data/part-04a";
import { fiscalGuidePdfPart04B } from "./fiscal-guide-pdf-data/part-04b";
import { fiscalGuidePdfPart04C } from "./fiscal-guide-pdf-data/part-04c";
import { fiscalGuidePdfPart04D } from "./fiscal-guide-pdf-data/part-04d";
import { fiscalGuidePdfPart04E } from "./fiscal-guide-pdf-data/part-04e";
import { fiscalGuidePdfPart05 } from "./fiscal-guide-pdf-data/part-05";
import { fiscalGuidePdfPart06 } from "./fiscal-guide-pdf-data/part-06";
import { fiscalGuidePdfPart07 } from "./fiscal-guide-pdf-data/part-07";
import { fiscalGuidePdfPart08 } from "./fiscal-guide-pdf-data/part-08";

const approvedFiscalGuidePdfBase64 = [
  fiscalGuidePdfPart01,
  fiscalGuidePdfPart02,
  fiscalGuidePdfPart03,
  fiscalGuidePdfPart04A,
  fiscalGuidePdfPart04B,
  fiscalGuidePdfPart04C,
  fiscalGuidePdfPart04D,
  fiscalGuidePdfPart04E,
  fiscalGuidePdfPart05,
  fiscalGuidePdfPart06,
  fiscalGuidePdfPart07,
  fiscalGuidePdfPart08,
].join("");

export function buildFiscalGuidePdf(): Buffer {
  return Buffer.from(approvedFiscalGuidePdfBase64, "base64");
}
