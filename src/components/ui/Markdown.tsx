import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// remark-gfm trae listas de tareas y no permite apagarlas por separado. Se muestran como
// el texto que se escribió (`[ ]`, `[x]`) para que no parezcan las tareas del proyecto.
// react-markdown ignora el HTML crudo y filtra URLs como `javascript:`, así que el
// contenido de un documento no puede inyectar nada.
const components: Components = {
  input: ({ type, checked }) => (type === "checkbox" ? <>{checked ? "[x] " : "[ ] "}</> : null),
  a: ({ href, title, children }) => (
    <a href={href} title={title} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
