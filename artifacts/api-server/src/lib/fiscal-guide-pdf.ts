type PdfColor = [number, number, number];

type GuideSection = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  notice?: string;
};

type GuidePage = {
  title: string;
  subtitle: string;
  sections: GuideSection[];
};

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 48;
const RED: PdfColor = [0.78, 0.06, 0.09];
const DARK: PdfColor = [0.12, 0.14, 0.18];
const GRAY: PdfColor = [0.38, 0.42, 0.48];
const LIGHT: PdfColor = [0.95, 0.95, 0.96];
const AMBER: PdfColor = [0.99, 0.95, 0.8];

const pages: GuidePage[] = [
  {
    title: "Manual fácil da nota fiscal",
    subtitle:
      "Um passo a passo simples para preencher o Fiscal do Gestor Max sem se perder.",
    sections: [
      {
        heading: "Antes de começar",
        bullets: [
          "Pegue o cartão do CNPJ da empresa.",
          "Pegue a Inscrição Estadual.",
          "Separe uma nota ou XML antigo da empresa, se existir.",
          "Tenha o contato do contador por perto.",
        ],
      },
      {
        heading: "Regra de ouro",
        notice:
          "Não chute nenhum código. Quando não souber, pare e pergunte ao contador. É melhor esperar do que emitir uma nota errada.",
      },
      {
        heading: "Como usar este manual",
        bullets: [
          "Abra o menu Fiscal.",
          "Leia uma página deste manual.",
          "Preencha somente aquela parte no sistema.",
          "Revise antes de passar para a próxima etapa.",
        ],
      },
    ],
  },
  {
    title: "Passo 1 - escolha o modelo fiscal",
    subtitle: "O modelo diz como os produtos vão aparecer na nota.",
    sections: [
      {
        heading: "Simplificado",
        paragraphs: [
          "Use quando a loja quer praticidade. Produtos parecidos podem ser organizados em grupos fiscais, desde que o contador aprove.",
        ],
        bullets: [
          "Bom para operações menores.",
          "Mais fácil de manter.",
          "Precisa ser validado pelo contador antes da produção.",
        ],
      },
      {
        heading: "Completo",
        paragraphs: [
          "Use quando cada produto precisa sair separado e com sua própria regra fiscal.",
        ],
        bullets: [
          "Mostra mais detalhes.",
          "Dá mais trabalho para configurar.",
          "É indicado quando a operação precisa controlar cada item.",
        ],
      },
      {
        heading: "O que escolher?",
        notice:
          "Escolha junto com o contador. O Gestor Max organiza a informação, mas não decide a tributação da empresa.",
      },
    ],
  },
  {
    title: "Passo 2 - dados da empresa",
    subtitle: "Copie os dados exatamente como aparecem nos documentos oficiais.",
    sections: [
      {
        heading: "Razão social",
        paragraphs: [
          "É o nome oficial da empresa no CNPJ. Não use apelido e não invente abreviação.",
        ],
      },
      {
        heading: "Nome fantasia",
        paragraphs: [
          "É o nome que os clientes conhecem. Exemplo: Pizzaria do João. Ele pode ser diferente da razão social.",
        ],
      },
      {
        heading: "CNPJ",
        paragraphs: ["Digite os 14 números do CNPJ. Confira duas vezes antes de salvar."],
      },
      {
        heading: "Inscrição Estadual",
        paragraphs: [
          "Digite a inscrição estadual da empresa. Se o documento disser ISENTO, escreva ISENTO.",
        ],
      },
      {
        heading: "Regime tributário",
        bullets: [
          "Simples Nacional.",
          "Simples Nacional com excesso de sublimite.",
          "Regime normal.",
        ],
        notice:
          "Não escolha pelo tamanho da empresa. Pergunte ao contador qual opção está correta.",
      },
    ],
  },
  {
    title: "Passo 3 - endereço fiscal",
    subtitle: "Use o endereço que está ligado ao CNPJ da empresa.",
    sections: [
      {
        heading: "Preencha cada campo",
        bullets: [
          "Estado: escolha a sigla, como PR, SP ou GO.",
          "Cidade: escreva o nome completo da cidade.",
          "Código IBGE: use os 7 números da cidade.",
          "CEP: digite os 8 números.",
          "Rua: escreva o nome da rua ou avenida.",
          "Número: informe o número do endereço.",
          "Bairro: escreva o bairro.",
          "Complemento: sala, bloco ou referência, quando existir.",
        ],
      },
      {
        heading: "Como conferir",
        notice:
          "Compare com o cartão do CNPJ, cadastro estadual ou documento enviado pelo contador. O código IBGE não é o CEP.",
      },
    ],
  },
  {
    title: "Passo 4 - dados da emissão",
    subtitle: "Esses números ajudam a organizar a sequência das notas.",
    sections: [
      {
        heading: "Série",
        paragraphs: [
          "É como uma pasta que organiza as notas. Muitas empresas começam com série 1, mas você deve confirmar com o contador ou com o sistema usado antes.",
        ],
      },
      {
        heading: "Próximo número",
        paragraphs: [
          "É o número que a próxima NFC-e vai usar. Se a empresa já emitiu notas, não volte para 1. Continue a sequência correta.",
        ],
      },
      {
        heading: "Natureza da operação",
        paragraphs: [
          "É uma frase curta que explica o que a nota representa. Exemplo: Venda de mercadoria.",
        ],
      },
      {
        heading: "Cuidado",
        notice:
          "Série e numeração erradas podem causar rejeição ou duplicidade. Confirme antes de emitir em produção.",
      },
    ],
  },
  {
    title: "Passo 5 - escolha os produtos",
    subtitle: "Agora você vai ligar os produtos do cardápio às regras fiscais.",
    sections: [
      {
        heading: "Use o tipo de negócio",
        bullets: [
          "Escolha pizzaria, hamburgueria, restaurante, lanchonete ou outra opção parecida.",
          "O filtro só ajuda a encontrar opções. Ele não escolhe o código sozinho.",
        ],
      },
      {
        heading: "Aplicar em vários produtos",
        bullets: [
          "Marque juntos somente produtos realmente parecidos.",
          "Exemplo: vários sabores de refrigerante da mesma embalagem podem usar a mesma regra, se o contador confirmar.",
          "Não misture comida produzida pela loja com bebida comprada pronta.",
        ],
      },
      {
        heading: "Quando separar",
        notice:
          "Separe produtos com embalagem, origem, composição ou forma de venda diferente.",
      },
    ],
  },
  {
    title: "Passo 6 - NCM e CEST",
    subtitle: "Pense nesses códigos como documentos do produto.",
    sections: [
      {
        heading: "NCM",
        paragraphs: [
          "É como o RG fiscal do produto. Normalmente possui 8 números.",
          "Procure pelo produto real, não apenas pelo nome do cardápio. Um ingrediente e um prato pronto podem ter códigos diferentes.",
        ],
      },
      {
        heading: "CEST",
        paragraphs: [
          "É uma etiqueta extra usada em alguns produtos com substituição tributária. Nem todo produto tem CEST.",
        ],
      },
      {
        heading: "Onde confirmar",
        bullets: [
          "XML de compra do mesmo produto.",
          "Embalagem ou ficha do fornecedor.",
          "Orientação do contador.",
        ],
      },
      {
        heading: "Cuidado",
        notice:
          "Nunca coloque um CEST só para preencher o campo. Deixe vazio quando não for aplicável ou ainda não estiver confirmado.",
      },
    ],
  },
  {
    title: "Passo 7 - CFOP, unidade e origem",
    subtitle: "Esses campos explicam o tipo de venda e de onde veio o produto.",
    sections: [
      {
        heading: "CFOP",
        paragraphs: [
          "É o código que explica a operação. Ele muda conforme produção própria, revenda, estado e substituição tributária.",
        ],
        bullets: [
          "5101 pode ser usado em venda interna de produção própria.",
          "5102 pode ser usado em venda interna de mercadoria comprada para revenda.",
          "5405 pode aparecer em vendas de mercadoria sujeita à substituição tributária.",
        ],
      },
      {
        heading: "Unidade comercial",
        bullets: [
          "UN: unidade.",
          "KG: quilograma.",
          "L: litro.",
          "CX: caixa.",
          "PCT: pacote.",
        ],
      },
      {
        heading: "Origem",
        paragraphs: [
          "Mostra se o produto é nacional ou importado. Use a informação do fornecedor ou do XML.",
        ],
        notice:
          "Os exemplos de CFOP são educativos. Confirme o código correto com o contador.",
      },
    ],
  },
  {
    title: "Passo 8 - ICMS, PIS e COFINS",
    subtitle: "Aqui você informa como os impostos tratam aquele produto.",
    sections: [
      {
        heading: "CST ICMS ou CSOSN",
        paragraphs: [
          "O sistema mostra CST ICMS para alguns regimes e CSOSN para empresas do Simples Nacional.",
        ],
        bullets: [
          "Não escolha o código pelo nome do produto.",
          "Veja se existe tributação normal, isenção ou substituição tributária.",
          "Use o código passado pelo contador.",
        ],
      },
      {
        heading: "CST PIS e CST COFINS",
        paragraphs: [
          "Esses dois códigos explicam como PIS e COFINS funcionam na venda. Alguns produtos podem ter alíquota zero ou tratamento monofásico.",
        ],
      },
      {
        heading: "Regra simples",
        notice:
          "Se você não souber explicar por que escolheu o código, ainda não é hora de salvar. Pergunte ao contador.",
      },
    ],
  },
  {
    title: "Passo 9 - revisão final",
    subtitle: "Revise tudo antes de permitir emissão de nota de verdade.",
    sections: [
      {
        heading: "Confira a empresa",
        bullets: [
          "Razão social e CNPJ.",
          "Inscrição Estadual.",
          "Regime tributário.",
          "Endereço e código IBGE.",
        ],
      },
      {
        heading: "Confira a emissão",
        bullets: ["Série.", "Próximo número.", "Natureza da operação."],
      },
      {
        heading: "Confira os produtos",
        bullets: [
          "NCM e CEST.",
          "CFOP, unidade e origem.",
          "CST ICMS ou CSOSN.",
          "CST PIS e CST COFINS.",
        ],
      },
      {
        heading: "Teste primeiro",
        notice:
          "Comece no ambiente de homologação. Só mude para produção depois de o contador revisar e a emissão de teste funcionar sem rejeição.",
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
    if (byte === 40 || byte === 41 || byte === 92) {
      output += `\\${String.fromCharCode(byte)}`;
    } else if (byte >= 32 && byte <= 126) {
      output += String.fromCharCode(byte);
    } else {
      output += `\\${byte.toString(8).padStart(3, "0")}`;
    }
  }
  return `${output})`;
}

function wrapText(value: string, maxCharacters: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharacters) {
      current = candidate;
    } else {
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
  let y = PAGE_HEIGHT - 130;

  operations.push(`${rgb(RED)} rg\n0 ${PAGE_HEIGHT - 92} ${PAGE_WIDTH} 92 re f`);
  operations.push(
    textOperation(MARGIN, PAGE_HEIGHT - 48, "Gestor Max", 20, "F2", [1, 1, 1]),
  );
  operations.push(
    textOperation(
      MARGIN,
      PAGE_HEIGHT - 72,
      "Manual fácil da nota fiscal",
      11,
      "F1",
      [1, 1, 1],
    ),
  );
  operations.push(
    textOperation(
      PAGE_WIDTH - 92,
      PAGE_HEIGHT - 62,
      `Página ${pageNumber}`,
      9,
      "F1",
      [1, 1, 1],
    ),
  );

  operations.push(textOperation(MARGIN, y, page.title, 21, "F2", DARK));
  y -= 28;
  for (const line of wrapText(page.subtitle, 78)) {
    operations.push(textOperation(MARGIN, y, line, 11, "F1", GRAY));
    y -= 16;
  }
  y -= 12;

  for (const section of page.sections) {
    operations.push(textOperation(MARGIN, y, section.heading, 14, "F2", RED));
    y -= 22;

    if (section.paragraphs) {
      for (const paragraph of section.paragraphs) {
        for (const line of wrapText(paragraph, 76)) {
          operations.push(textOperation(MARGIN, y, line, 11, "F1", DARK));
          y -= 16;
        }
        y -= 5;
      }
    }

    if (section.bullets) {
      for (const bullet of section.bullets) {
        const lines = wrapText(bullet, 70);
        operations.push(textOperation(MARGIN, y, "-", 11, "F2", RED));
        operations.push(textOperation(MARGIN + 16, y, lines[0], 11, "F1", DARK));
        y -= 16;
        for (const line of lines.slice(1)) {
          operations.push(textOperation(MARGIN + 16, y, line, 11, "F1", DARK));
          y -= 16;
        }
        y -= 2;
      }
    }

    if (section.notice) {
      const lines = wrapText(section.notice, 68);
      const height = 42 + lines.length * 16;
      operations.push(
        `${rgb(AMBER)} rg\n${MARGIN} ${y - height + 10} ${PAGE_WIDTH - MARGIN * 2} ${height} re f`,
      );
      operations.push(`${rgb(RED)} rg\n${MARGIN} ${y - height + 10} 5 ${height} re f`);
      operations.push(textOperation(MARGIN + 18, y - 8, "Atenção", 11, "F2", DARK));
      let noticeY = y - 30;
      for (const line of lines) {
        operations.push(textOperation(MARGIN + 18, noticeY, line, 10.5, "F1", DARK));
        noticeY -= 15;
      }
      y -= height + 8;
    }

    y -= 10;
  }

  operations.push(
    `0.7 w\n${rgb(LIGHT)} RG\n${MARGIN} 34 m ${PAGE_WIDTH - MARGIN} 34 l S`,
  );
  operations.push(
    textOperation(
      MARGIN,
      20,
      "Material educativo. Confirme tudo com o contador antes de emitir em produção.",
      8,
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
    `<< /Title ${pdfLiteral("Manual Fácil da Nota Fiscal - Gestor Max")} /Author ${pdfLiteral("Gestor Max")} >>`,
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
