type PdfColor = [number, number, number];

type GuidePage = {
  title: string;
  subtitle: string;
  sections: Array<{
    heading: string;
    paragraphs?: string[];
    bullets?: string[];
    notice?: string;
  }>;
};

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 48;
const RED: PdfColor = [0.78, 0.06, 0.09];
const DARK: PdfColor = [0.12, 0.14, 0.18];
const GRAY: PdfColor = [0.38, 0.42, 0.48];
const LIGHT: PdfColor = [0.95, 0.95, 0.96];
const AMBER: PdfColor = [0.98, 0.93, 0.76];

const pages: GuidePage[] = [
  {
    title: "Comece pelo tipo de negócio",
    subtitle:
      "Use o filtro para reduzir a biblioteca e encontrar mais rápido os produtos que fazem sentido para a sua operação.",
    sections: [
      {
        heading: "Regra principal",
        notice:
          "O filtro não decide a tributação. Ele apenas organiza candidatos comuns por ramo. Composição, embalagem, origem e operação real podem mudar o código correto.",
      },
      {
        heading: "Tipos de negócio disponíveis",
        bullets: [
          "Pizzaria: pizzas, refeições, queijo, calabresa, bebidas e sobremesas.",
          "Hamburgueria: hambúrgueres, carnes, frango, batatas, bebidas e sobremesas.",
          "Restaurante: refeições, massas, sopas, carnes, peixes e acompanhamentos.",
          "Lanchonete: lanches, salgados, café, batatas, bebidas e doces.",
          "Cafeteria: café, padaria, biscoitos, waffles, chocolates e lácteos.",
          "Padaria e confeitaria: pães, bolos, salgados, biscoitos e doces.",
          "Açaíteria e sorveteria: açaí, sorvetes, coberturas, sucos e refrigerantes.",
          "Sushi e comida oriental: peixe, pratos compostos, sopas e bebidas.",
          "Bar e bebidas: água, refrigerante, suco, cerveja, chope, vinho e petiscos.",
          "Doceria: confeitaria, chocolate, sorvete, açaí, café e lácteos.",
        ],
      },
      {
        heading: "Fluxo recomendado",
        bullets: [
          "Selecione o tipo de negócio.",
          "Pesquise o produto e escolha o NCM candidato.",
          "Preencha os demais campos.",
          "Aplique em lote somente aos produtos equivalentes.",
          "Edite manualmente as exceções.",
          "Envie a relação ao contador para validação.",
        ],
      },
    ],
  },
  {
    title: "NCM e CEST",
    subtitle: "Os dois códigos descrevem o produto, mas têm funções diferentes.",
    sections: [
      {
        heading: "NCM - o que é",
        paragraphs: [
          "É a classificação fiscal nacional da mercadoria, normalmente com 8 dígitos.",
          "Escolha o candidato que mais corresponde ao produto real. Compare com XML anterior, ficha técnica, embalagem ou orientação do contador.",
          "Pizza ou hambúrguer completo pode não usar o mesmo NCM de um ingrediente vendido separadamente.",
        ],
      },
      {
        heading: "CEST - o que é",
        paragraphs: [
          "É usado em mercadorias sujeitas a substituição tributária. Nem todo produto possui CEST.",
          "Observe tipo do produto, embalagem, capacidade e legislação estadual. Refrigerante pode ter CEST diferente para lata, PET, vidro ou outra embalagem.",
        ],
        notice:
          "Não invente CEST para completar a tela. Quando não for aplicável ou ainda não estiver confirmado, deixe sem CEST e marque a pendência.",
      },
      {
        heading: "Onde confirmar",
        bullets: [
          "XML de compra do mesmo produto ou mercadoria equivalente.",
          "Sistema Classif e tabela NCM da Receita Federal.",
          "Convênio ICMS 142/18 e regras estaduais para CEST/ST.",
          "Contador responsável pela empresa.",
        ],
      },
    ],
  },
  {
    title: "CFOP, unidade e origem",
    subtitle:
      "Esses campos explicam a operação, a forma de comercialização e a procedência da mercadoria.",
    sections: [
      {
        heading: "CFOP",
        paragraphs: [
          "Identifica o tipo de saída realizada. Defina se é produção própria ou revenda, operação interna ou interestadual e se existe substituição tributária.",
          "Exemplo educativo: 5101 costuma representar venda interna de produção própria; 5102, venda interna de mercadoria de terceiros. Confirme antes de usar.",
        ],
      },
      {
        heading: "Unidade comercial",
        paragraphs: [
          "É a unidade usada para vender e informar quantidade na nota: UN, KG, G, L, ML, CX, PCT, FD ou outra aceita pelo provedor fiscal.",
          "Uma pizza inteira pode ser UN; queijo vendido por peso pode ser KG.",
        ],
      },
      {
        heading: "Origem da mercadoria",
        paragraphs: [
          "Indica se a mercadoria é nacional ou estrangeira e o nível de conteúdo importado.",
          "Use a informação do fornecedor ou do XML. Não escolha 0 - Nacional apenas por padrão quando o produto for importado.",
        ],
        notice:
          "Um restaurante pode produzir refeições e revender bebidas industrializadas. Os produtos podem exigir CFOP e tratamento diferentes na mesma venda.",
      },
    ],
  },
  {
    title: "CST ICMS ou CSOSN",
    subtitle: "O campo exibido depende do regime tributário configurado para a empresa.",
    sections: [
      {
        heading: "CST ICMS",
        paragraphs: [
          "É a situação tributária do ICMS usada normalmente por empresas do regime normal.",
          "Escolha conforme tributação integral, isenção, redução, substituição tributária, diferimento ou outra situação definida pelo contador.",
          "Exemplos educativos: 00 pode indicar tributação integral; 60, ICMS cobrado anteriormente por ST.",
        ],
      },
      {
        heading: "CSOSN",
        paragraphs: [
          "É a situação da operação no Simples Nacional.",
          "Escolha conforme crédito, isenção, substituição tributária, não tributação ou outro enquadramento.",
          "Exemplos educativos: 102 pode indicar operação sem permissão de crédito; 500, ICMS cobrado anteriormente por ST.",
        ],
      },
      {
        heading: "Pergunte ao contador",
        bullets: [
          "O produto é tributado normalmente ou está em substituição tributária?",
          "O ICMS já foi recolhido anteriormente pelo fornecedor?",
          "A empresa pode destacar crédito?",
          "Existe redução, isenção, imunidade ou benefício estadual?",
        ],
      },
    ],
  },
  {
    title: "CST PIS, CST COFINS e natureza da operação",
    subtitle: "Esses campos completam o tratamento das contribuições e a descrição da saída.",
    sections: [
      {
        heading: "CST PIS",
        paragraphs: [
          "Informa a situação tributária do PIS na saída.",
          "Escolha conforme operação tributável, monofásica, alíquota zero, isenta, sem incidência, suspensa ou outras operações.",
          "Exemplos educativos: 01 pode indicar alíquota básica; 04, revenda monofásica a alíquota zero; 49, outras saídas.",
        ],
      },
      {
        heading: "CST COFINS",
        paragraphs: [
          "É o código equivalente para a COFINS. Normalmente deve ser analisado junto com o PIS, mas não copie automaticamente sem confirmação.",
        ],
      },
      {
        heading: "Natureza da operação",
        paragraphs: [
          "É o texto que resume o que está sendo feito na nota. Use uma descrição clara e coerente com o CFOP.",
          "Exemplos: Venda de mercadoria; Venda de produção do estabelecimento; Venda de mercadoria sujeita à ST.",
        ],
        notice:
          "Bebidas e outros produtos podem ter tratamento monofásico ou alíquota zero. O nome comercial sozinho não basta para decidir.",
      },
    ],
  },
  {
    title: "Aplicação em lote e validação final",
    subtitle: "Ganhe velocidade sem perder o controle das exceções.",
    sections: [
      {
        heading: "Quando aplicar a mesma regra",
        bullets: [
          "Produtos equivalentes em composição, embalagem, origem e forma de venda.",
          "Variações que o contador confirmou usar a mesma regra.",
          "Itens da mesma família fiscal com os mesmos códigos e operação.",
        ],
      },
      {
        heading: "Quando preencher manualmente",
        bullets: [
          "Produto importado enquanto os demais são nacionais.",
          "Bebida com embalagem ou capacidade diferente.",
          "Item revendido enquanto os demais são produzidos pela loja.",
          "Produto com ST, tratamento monofásico ou benefício específico.",
          "Código fornecido pelo contador ou recuperado de XML anterior.",
        ],
      },
      {
        heading: "Checklist para o contador",
        bullets: [
          "Nome completo do produto e categoria.",
          "NCM e CEST, quando aplicável.",
          "CFOP, unidade comercial e origem.",
          "CST ICMS ou CSOSN.",
          "CST PIS e CST COFINS.",
          "Natureza da operação.",
          "Embalagem, volume, composição e fornecedor.",
        ],
        notice:
          "Toda regra salva no Gestor Max fica como Pendente de validação do contador. Isso não libera emissão em produção automaticamente.",
      },
    ],
  },
];

function rgb(color: PdfColor): string {
  return color.map((value) => value.toFixed(3)).join(" ");
}

function pdfLiteral(value: string): string {
  const bytes = Buffer.from(value, "latin1");
  let output = "(";
  for (const byte of bytes) {
    if (byte === 40 || byte === 41 || byte === 92) output += `\\${String.fromCharCode(byte)}`;
    else if (byte >= 32 && byte <= 126) output += String.fromCharCode(byte);
    else output += `\\${byte.toString(8).padStart(3, "0")}`;
  }
  return `${output})`;
}

function wrapText(value: string, maxCharacters: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharacters) current = candidate;
    else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

function textOperation(
  x: number,
  y: number,
  value: string,
  size: number,
  font: "F1" | "F2",
  color: PdfColor,
): string {
  return [
    `${rgb(color)} rg`,
    "BT",
    `/${font} ${size} Tf`,
    `1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm`,
    `${pdfLiteral(value)} Tj`,
    "ET",
  ].join("\n");
}

function pageContent(page: GuidePage, pageNumber: number): string {
  const operations: string[] = [];
  let y = PAGE_HEIGHT - 122;

  operations.push(`${rgb(RED)} rg\n0 ${PAGE_HEIGHT - 86} ${PAGE_WIDTH} 86 re f`);
  operations.push(textOperation(MARGIN, PAGE_HEIGHT - 50, "Gestor Max", 18, "F2", [1, 1, 1]));
  operations.push(
    textOperation(MARGIN, PAGE_HEIGHT - 72, "Guia de preenchimento fiscal", 10, "F1", [1, 1, 1]),
  );
  operations.push(
    textOperation(PAGE_WIDTH - 88, PAGE_HEIGHT - 62, `Página ${pageNumber}`, 9, "F1", [1, 1, 1]),
  );

  operations.push(textOperation(MARGIN, y, page.title, 20, "F2", DARK));
  y -= 25;
  for (const line of wrapText(page.subtitle, 85)) {
    operations.push(textOperation(MARGIN, y, line, 10, "F1", GRAY));
    y -= 14;
  }
  y -= 8;

  for (const section of page.sections) {
    operations.push(textOperation(MARGIN, y, section.heading, 13, "F2", RED));
    y -= 20;

    if (section.paragraphs) {
      for (const paragraph of section.paragraphs) {
        for (const line of wrapText(paragraph, 88)) {
          operations.push(textOperation(MARGIN, y, line, 9.3, "F1", DARK));
          y -= 13;
        }
        y -= 4;
      }
    }

    if (section.bullets) {
      for (const bullet of section.bullets) {
        const lines = wrapText(bullet, 82);
        operations.push(textOperation(MARGIN, y, "-", 10, "F2", RED));
        operations.push(textOperation(MARGIN + 13, y, lines[0], 9.3, "F1", DARK));
        y -= 13;
        for (const line of lines.slice(1)) {
          operations.push(textOperation(MARGIN + 13, y, line, 9.3, "F1", DARK));
          y -= 13;
        }
        y -= 2;
      }
    }

    if (section.notice) {
      const lines = wrapText(section.notice, 78);
      const height = 35 + lines.length * 13;
      operations.push(`${rgb(AMBER)} rg\n${MARGIN} ${y - height + 8} ${PAGE_WIDTH - MARGIN * 2} ${height} re f`);
      operations.push(`${rgb(RED)} rg\n${MARGIN} ${y - height + 8} 5 ${height} re f`);
      operations.push(textOperation(MARGIN + 16, y - 10, "Atenção", 10.5, "F2", DARK));
      let noticeY = y - 28;
      for (const line of lines) {
        operations.push(textOperation(MARGIN + 16, noticeY, line, 9.1, "F1", DARK));
        noticeY -= 13;
      }
      y -= height + 8;
    }

    y -= 8;
  }

  operations.push(`0.7 w\n${rgb(LIGHT)} RG\n${MARGIN} 34 m ${PAGE_WIDTH - MARGIN} 34 l S`);
  operations.push(
    textOperation(
      MARGIN,
      20,
      "Material educativo. Confirme os códigos com o contador antes da emissão em produção.",
      7.5,
      "F1",
      GRAY,
    ),
  );

  return `${operations.join("\n")}\n`;
}

export function buildFiscalGuidePdf(): Buffer {
  const objects: string[] = [];
  const addObject = (content: string): number => {
    objects.push(content);
    return objects.length;
  };

  const fontRegular = addObject(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  );
  const fontBold = addObject(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  );

  const contentReferences = pages.map((page, index) => {
    const stream = pageContent(page, index + 1);
    return addObject(
      `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}endstream`,
    );
  });

  const pagesReference = addObject("PAGES_PLACEHOLDER");
  const pageReferences = contentReferences.map((contentReference) =>
    addObject(
      `<< /Type /Page /Parent ${pagesReference} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentReference} 0 R >>`,
    ),
  );
  objects[pagesReference - 1] =
    `<< /Type /Pages /Kids [${pageReferences.map((reference) => `${reference} 0 R`).join(" ")}] /Count ${pageReferences.length} >>`;

  const catalogReference = addObject(`<< /Type /Catalog /Pages ${pagesReference} 0 R >>`);
  const infoReference = addObject(
    `<< /Title ${pdfLiteral("Guia de Preenchimento Fiscal - Gestor Max")} /Author ${pdfLiteral("Gestor Max")} >>`,
  );

  let output = "%PDF-1.4\n%PDFASCII\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output, "ascii"));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(output, "ascii");
  output += `xref\n0 ${objects.length + 1}\n`;
  output += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    output += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }
  output +=
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalogReference} 0 R /Info ${infoReference} 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(output, "ascii");
}
