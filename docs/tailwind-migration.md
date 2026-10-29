# Migración del CSS a Tailwind

Propuesta para pasar de `src/app/globals.css` (≈1700 líneas de clases propias, usadas en ≈50
componentes) a Tailwind v4, que ya está instalado. No es un plan para hacerlo de una vez:
es gradual, vista por vista.

## Por qué

- **Choques de nombres.** Las clases son globales; dos vistas que definen `.issue-title`
  se pisan sin aviso (pasó al agregar issues: el bloque de la lista sobrescribía el título
  del detalle).
- **Estilos lejos del componente.** Cambiar una vista obliga a buscar en un archivo de
  1700 líneas sin saber qué más usa esa clase.
- **CSS muerto y duplicado.** No hay forma barata de saber qué clase sigue en uso, y hay
  duplicados (`.filter-select` está definido dos veces).
- **Estilos inline sueltos** (`style={{ fontSize: 12 }}`, `marginLeft: "auto"`…) que no
  siguen ninguna escala.

## Qué se queda como CSS

No todo se puede ni conviene pasar a utilidades:

- **Tokens y modo oscuro**: las variables (`--accent`, `--text-1…3`, `--surface`,
  `--surface-2`, `--border`, `--border-dash`, `--badge-*`, `--series-1…6`, `--comment-hl`)
  y su redefinición en dark. Siguen siendo la fuente de verdad; Tailwind las consume.
- **`.md`**: el Markdown renderizado por `react-markdown` no admite clases por elemento.
- **`::highlight()`**: ya vive en un `<style precedence>` en `DocEditorView` porque el parser
  de Turbopack no lo reconoce; no cambia.
- **Resets, `@font-face`/variables de fuentes y animaciones.**

## Paso 1: exponer los tokens en `@theme`

Mapear las variables existentes, sin cambiar sus valores, para que haya utilidades con los
nombres del proyecto:

```css
@theme inline {
  --color-accent: var(--accent);
  --color-text-1: var(--text-1);
  --color-text-2: var(--text-2);
  --color-text-3: var(--text-3);
  --color-surface: var(--surface);
  --color-surface-2: var(--surface-2);
  --color-border: var(--border);
  --color-border-dash: var(--border-dash);

  --font-sans: var(--font-barlow), sans-serif;
  --font-condensed: var(--font-barlow-condensed), sans-serif;
  --font-mono: var(--font-space-mono), monospace;
}
```

`inline` hace que la utilidad lea la variable en tiempo de ejecución, así el modo oscuro
sigue funcionando sin duplicar nada.

## Paso 2: escala tipográfica y de espaciado

El diseño usa muchos tamaños finos (8.5, 9, 9.5, 10, 11, 11.5, 12, 12.5, 13, 13.5, 15, 18,
22 px). Pasarlos como valores arbitrarios (`text-[9.5px]`) quita el beneficio de la migración.
Propuesta: consolidarlos en una escala con nombre, aceptando redondear los casi iguales.

```css
@theme {
  --text-micro: 9px;    /* etiquetas mono: ids, contadores, .ds-lbl */
  --text-tiny: 10px;    /* metadatos mono */
  --text-xs: 11px;
  --text-sm: 12px;
  --text-base: 13px;    /* cuerpo de la app */
  --text-md: 13.5px;    /* .md */
  --text-lg: 15px;
  --text-xl: 18px;
  --text-2xl: 22px;     /* títulos de página/documento */
}
```

Antes de fijarla, inventariar los `font-size` reales de `globals.css` y de los `style` inline
y decidir a qué paso va cada uno. Lo mismo para radios (4, 6 y 8 px) y para los espaciados
más repetidos.

## Paso 3: piezas repetidas → componentes, no cadenas largas

Cuando una combinación de utilidades se repite en muchas vistas, no se copia la cadena:

1. **Preferir un componente en `src/components/ui/`** cuando la pieza tiene estructura o
   variantes: `Button` (`primary`, `ghost`, `danger`, `xs`), `Field` (label + control +
   hint + error), `Card`, `SidePanel` (`.doc-sc` + `.ds-lbl`), `MetaRow` (`.ds-row`),
   `FilterSelect`, `ListRow` (feat-row / task-row / issue-row). Ya existen `Badge`,
   `Modal`, `Avatar`, `Markdown`, `MarkdownToolbar`; se siguen sumando ahí.
2. **`@utility`** para una clase de una sola pieza sin estructura que se usa en muchos
   lugares y no merece componente (por ejemplo una etiqueta mono en mayúsculas):

   ```css
   @utility label-mono {
     font-family: var(--font-mono);
     font-size: var(--text-micro);
     text-transform: uppercase;
     letter-spacing: 0.07em;
     color: var(--color-text-3);
   }
   ```

3. **`@apply` solo como puente**, mientras una clase vieja de `globals.css` sigue en uso por
   vistas no migradas. No se crean clases nuevas con `@apply`: eso reproduce el problema de
   los nombres globales.

## Paso 4: migración gradual

- **Todo lo nuevo se escribe en Tailwind.** No se agregan clases a `globals.css` salvo lo que
  esté en "Qué se queda como CSS".
- **Una vista se migra cuando se toca por otro motivo**, o en un PR dedicado por vista.
- **Al migrar una vista se borran sus clases de `globals.css` en el mismo PR**, después de
  verificar con búsqueda que nadie más las usa.
- **Revisión visual de cada vista migrada en claro y oscuro**: no hay tests visuales.
- Orden sugerido, de menos a más riesgo: modales simples → Tiempo/StandUp → Miembros →
  detalle de issue → detalle de proyecto (tabs, kanban con drag & drop) → editor de
  documentos (preview, comentarios con highlight).

## Al terminar o al empezar

Actualizar `CLAUDE.md` en la sección de Stack: hoy dice que la UI es casi toda CSS escrita a
mano en `globals.css`. Desde el primer PR de migración tiene que decir que lo nuevo va en
Tailwind con los tokens de `@theme`, y que `globals.css` queda para tokens, `.md`, resets y
animaciones. Si no, los agentes seguirán agregando clases globales.
