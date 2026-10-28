import { describe, expect, it } from "vitest";
import { applyFormat, continueList, type MarkdownFormat, type TextSelection } from "@/lib/markdown";

// La selección se escribe en el texto con ‹ y ›; ‹› juntos es el cursor sin selección.
function parse(text: string): TextSelection {
  const start = text.indexOf("‹");
  const end = text.indexOf("›") - 1;
  return { value: text.replace("‹", "").replace("›", ""), start, end };
}

function show({ value, start, end }: TextSelection): string {
  return value.slice(0, start) + "‹" + value.slice(start, end) + "›" + value.slice(end);
}

const apply = (text: string, format: MarkdownFormat) => show(applyFormat(parse(text), format));

describe("negrita y cursiva", () => {
  it("envuelve la selección y la mantiene seleccionada", () => {
    expect(apply("hola ‹mundo›", "bold")).toBe("hola **‹mundo›**");
    expect(apply("hola ‹mundo›", "italic")).toBe("hola *‹mundo›*");
  });

  it("sin selección deja el cursor entre los marcadores", () => {
    expect(apply("hola ‹›", "bold")).toBe("hola **‹›**");
  });

  it("deja fuera los espacios de los bordes de la selección", () => {
    expect(apply("‹hola ›mundo", "bold")).toBe("**‹hola›** mundo");
  });

  it("aplicarlo de nuevo lo quita", () => {
    expect(apply("hola **‹mundo›**", "bold")).toBe("hola ‹mundo›");
    expect(apply("hola *‹mundo›*", "italic")).toBe("hola ‹mundo›");
    expect(apply("**‹›**", "bold")).toBe("‹›");
  });

  it("distingue negrita de cursiva", () => {
    expect(apply("**‹a›**", "italic")).toBe("***‹a›***");
    expect(apply("*‹a›*", "bold")).toBe("***‹a›***");
    expect(apply("***‹a›***", "italic")).toBe("**‹a›**");
    expect(apply("***‹a›***", "bold")).toBe("*‹a›*");
  });
});

describe("encabezados", () => {
  it("agrega el prefijo a la línea del cursor sin mover el cursor del texto", () => {
    expect(apply("uno\ndo‹›s\ntres", "h1")).toBe("uno\n# do‹›s\ntres");
  });

  it("reemplaza otro nivel en vez de acumular", () => {
    expect(apply("## tít‹›ulo", "h1")).toBe("# tít‹›ulo");
  });

  it("aplicarlo de nuevo lo quita", () => {
    expect(apply("## tít‹›ulo", "h2")).toBe("tít‹›ulo");
  });

  it("al quitarlo no deja el cursor antes del inicio de la línea", () => {
    expect(apply("a\n‹›# b", "h1")).toBe("a\n‹›b");
  });

  it("funciona en la primera línea aunque el texto empiece con un salto", () => {
    expect(apply("‹›\nfoo", "h1")).toBe("# ‹›\nfoo");
    expect(apply("‹›x\nfoo", "h1")).toBe("# ‹›x\nfoo");
  });
});

describe("listas", () => {
  it("convierte cada línea seleccionada, salvo las vacías, y las selecciona", () => {
    expect(apply("‹uno\n\ndos›", "list")).toBe("‹- uno\n\n- dos›");
  });

  it("en una línea vacía empieza la lista con el cursor después del guion", () => {
    expect(apply("‹›", "list")).toBe("- ‹›");
    expect(apply("item\n‹›", "list")).toBe("item\n- ‹›");
  });

  it("aplicarlo sobre un ítem vacío lo quita", () => {
    expect(apply("item\n- ‹›", "list")).toBe("item\n‹›");
  });

  it("si todas ya son lista, las quita", () => {
    expect(apply("‹- uno\n- dos›", "list")).toBe("‹uno\ndos›");
  });

  it("si solo algunas lo son, completa el resto", () => {
    expect(apply("‹- uno\ndos›", "list")).toBe("‹- uno\n- dos›");
  });

  it("no incluye la línea siguiente cuando la selección termina en el salto", () => {
    expect(apply("‹uno\n›dos", "list")).toBe("‹- uno›\ndos");
  });
});

describe("Enter en una lista", () => {
  const enter = (text: string) => {
    const next = continueList(parse(text));
    return next && show(next);
  };

  it("abre el siguiente ítem", () => {
    expect(enter("- uno‹›")).toBe("- uno\n- ‹›");
    expect(enter("- u‹›no")).toBe("- u\n- ‹›no");
  });

  it("en un ítem vacío termina la lista", () => {
    expect(enter("- uno\n- ‹›")).toBe("- uno\n‹›");
  });

  it("fuera de una lista, o con selección, deja el Enter normal", () => {
    expect(enter("uno‹›")).toBeNull();
    expect(enter("‹›- uno")).toBeNull();
    expect(enter("- ‹uno›")).toBeNull();
  });
});

describe("tabla", () => {
  it("se inserta como bloque separado y selecciona el primer encabezado", () => {
    expect(apply("texto‹›", "table")).toBe(
      "texto\n\n| ‹Columna 1› | Columna 2 |\n| --- | --- |\n|  |  |",
    );
  });

  it("en un documento vacío no agrega líneas en blanco", () => {
    expect(apply("‹›", "table")).toBe("| ‹Columna 1› | Columna 2 |\n| --- | --- |\n|  |  |");
  });

  it("separa también del texto que sigue y no borra la selección", () => {
    expect(apply("‹a›\nb", "table")).toBe(
      "a\n\n| ‹Columna 1› | Columna 2 |\n| --- | --- |\n|  |  |\n\nb",
    );
  });
});

describe("código", () => {
  it("dentro de una línea es código en línea", () => {
    expect(apply("usa ‹pnpm dev›", "code")).toBe("usa `‹pnpm dev›`");
    expect(apply("usa `‹pnpm dev›`", "code")).toBe("usa ‹pnpm dev›");
  });

  it("varias líneas se vuelven un bloque con sus líneas completas", () => {
    expect(apply("intro\nco‹nst a = 1;\nconst› b = 2;", "code")).toBe(
      "intro\n\n```\n‹const a = 1;\nconst b = 2;›\n```",
    );
  });

  it("en una línea vacía abre un bloque con el cursor adentro", () => {
    expect(apply("intro\n‹›", "code")).toBe("intro\n\n```\n‹›\n```");
  });
});
