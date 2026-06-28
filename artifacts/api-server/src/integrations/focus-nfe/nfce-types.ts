export type NfceLocalStatus = "draft"|"submitting"|"processing"|"authorized"|"rejected"|"error"|"sync_pending"|"cancelled";
export type FiscalMode = "simplified"|"complete";
export const NFCE_ERROR_CODES = {
  FISCAL_SETUP_NOT_READY: 400, ORDER_NOT_FOUND: 404, ORDER_NOT_PAID: 409, ORDER_HAS_NO_ITEMS: 409,
  ORDER_TOTAL_MISMATCH: 409, PAYMENT_METHOD_UNSUPPORTED: 400, PRODUCT_FISCAL_RULE_MISSING: 409,
  FISCAL_GROUP_RULE_MISSING: 409, EXTERNAL_ITEM_FISCAL_MAPPING_REQUIRED: 409, DELIVERY_FEE_FISCAL_MAPPING_REQUIRED: 409, NFCE_ALREADY_AUTHORIZED: 409,
  NFCE_PROCESSING: 409, NFCE_REJECTED: 409, FOCUS_NFCE_TIMEOUT: 504, FOCUS_NFCE_UNAVAILABLE: 503,
  FOCUS_NFCE_VALIDATION_ERROR: 422, FISCAL_DOCUMENT_SYNC_PENDING: 202,
} as const;
export type NfceErrorCode = keyof typeof NFCE_ERROR_CODES;
export class NfceServiceError extends Error { constructor(readonly code:NfceErrorCode, message:string, readonly status=NFCE_ERROR_CODES[code]){super(message);this.name="NfceServiceError";} }
export type SafeNfceDocument = { id:number; orderId:number; environment:string; status:string; series:number; number:number; accessKey:string|null; protocol:string|null; xmlAvailable:boolean; danfceAvailable:boolean; rejectionCode:string|null; rejectionMessage:string|null; authorizedAt:Date|null; lastCheckedAt:Date|null };
export type FocusNfceResponse = Record<string, unknown>;
