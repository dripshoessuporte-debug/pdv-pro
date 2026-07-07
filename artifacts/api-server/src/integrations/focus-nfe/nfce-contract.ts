export const FOCUS_NFCE_ENDPOINTS = {
  createPath: "/v2/nfce",
  createMethod: "POST",
  createRefQueryParam: "ref",
  consultPath: (referencia: string) => `/v2/nfce/${encodeURIComponent(referencia)}`,
  consultMethod: "GET",
  cancelPath: (referencia: string) => `/v2/nfce/${encodeURIComponent(referencia)}`,
  cancelMethod: "DELETE",
  inutilizationPath: "/v2/nfce/inutilizacao",
  inutilizationMethod: "POST",
} as const;

export const FOCUS_NFCE_REF_MAX_LENGTH = 60;
export const FOCUS_NFCE_REF_PATTERN = /^[A-Za-z0-9._:-]{1,60}$/;

export const FOCUS_NFCE_PAYMENT_CODES = {
  cash: "01",
  credit_card: "03",
  debit_card: "04",
  voucher: "10",
  pix: "17",
  other: "99",
} as const;

export const FOCUS_NFCE_REQUIRED_ISSUER_FIELDS = [
  "cnpj",
  "stateRegistration",
] as const;

export type FocusNfceNormalizedStatus = {
  status: "authorized" | "rejected" | "cancelled" | "processing" | "error";
  providerStatus: string | null;
  accessKey: string | null;
  protocol: string | null;
  xmlUrl: string | null;
  danfceUrl: string | null;
  rejectionCode: string | null;
  rejectionMessage: string | null;
};

function getStr(o: Record<string, unknown>, keys: string[]) {
  for (const k of keys) if (typeof o[k] === "string" && o[k]) return o[k] as string;
  return null;
}

export function normalizeFocusNfceStatus(data: Record<string, unknown>): FocusNfceNormalizedStatus {
  const providerStatus = getStr(data, ["status"]);
  const statusSefaz = getStr(data, ["status_sefaz"]);
  const accessKey = getStr(data, ["chave_nfe"]);
  const protocol = getStr(data, ["protocolo", "numero_protocolo"]);
  const xmlUrl = getStr(data, ["caminho_xml_nota_fiscal", "url_xml_nota_fiscal"]);
  const danfceUrl = getStr(data, ["caminho_danfe", "caminho_danfce", "url_danfe", "url_danfce"]);
  const rejectionCode = getStr(data, ["codigo_rejeicao", "status_sefaz"]);
  const rejectionMessage = getStr(data, ["mensagem_sefaz", "mensagem_rejeicao", "mensagem"]);

  if (providerStatus === "autorizado" && statusSefaz === "100" && accessKey && protocol && (xmlUrl || danfceUrl)) {
    return { status: "authorized", providerStatus, accessKey, protocol, xmlUrl, danfceUrl, rejectionCode: null, rejectionMessage: null };
  }
  if (providerStatus === "cancelado") {
    return { status: "cancelled", providerStatus, accessKey, protocol, xmlUrl, danfceUrl, rejectionCode: null, rejectionMessage: null };
  }
  if (["erro_autorizacao", "denegado", "rejeitado"].includes(providerStatus ?? "")) {
    return { status: "rejected", providerStatus, accessKey, protocol, xmlUrl, danfceUrl, rejectionCode, rejectionMessage };
  }
  if (providerStatus === "erro") {
    return { status: "error", providerStatus, accessKey, protocol, xmlUrl, danfceUrl, rejectionCode, rejectionMessage };
  }
  return { status: "processing", providerStatus, accessKey, protocol, xmlUrl, danfceUrl, rejectionCode: null, rejectionMessage: null };
}
