import { Router, type IRouter } from "express";
import { buildFiscalGuidePdf } from "../lib/fiscal-guide-pdf";
import { requireStoreFeature } from "../lib/store-features";
import { requireRole } from "../middleware/rbac";

const router: IRouter = Router();

router.use(requireRole("max_control"));
router.use(requireStoreFeature("fiscal"));

router.get("/fiscal/guide.pdf", (_req, res): void => {
  const pdf = buildFiscalGuidePdf();
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="Guia_Preenchimento_Fiscal_Gestor_Max.pdf"',
  );
  res.setHeader("Content-Length", pdf.length.toString());
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.send(pdf);
});

export default router;
