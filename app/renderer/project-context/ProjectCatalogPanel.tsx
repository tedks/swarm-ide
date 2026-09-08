import type { ProjectCatalog } from "../../../protocol/project-context";

const familyNames = { node: "Node.js", python: "Python", hugo: "Hugo", move: "Move", ocaml: "OCaml", bazel: "Bazel" };

/** A manifest describes intended structure, independently of process availability. */
export function ProjectCatalogPanel({ catalog }: { catalog?: ProjectCatalog }) {
  if (!catalog || (!catalog.components.length && !catalog.relationships.length && !catalog.sites.length)) return null;
  const names = new Map(catalog.components.map((component) => [component.id, component.name]));
  return <div className="project-catalog">
    {catalog.scan.retained && catalog.scan.observedAt ? <small title={new Date(catalog.scan.observedAt).toLocaleString()}>Last read {new Date(catalog.scan.observedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small> : null}
    {catalog.components.length ? <details className="project-catalog-group" open>
      <summary>Components <small>{catalog.components.length}</small></summary>
      {catalog.components.map((component) => <article key={component.id} title={`Declared in ${component.evidence}`}>
        <div className="project-runtime-name"><strong>{component.name}</strong><small>{component.frameworks.includes("Electron") ? "Electron" : familyNames[component.family]}</small></div>
        {component.directory !== "." ? <small className="project-component-path">{component.directory}</small> : null}
        {component.frameworks.length ? <div className="project-component-tags">{component.frameworks.map((name) => <span key={name}>{name}</span>)}</div> : null}
        {component.workflows.length ? <div className="project-component-workflows" aria-label={`Workflows for ${component.name}`}>
          {component.workflows.map((workflow) => <span key={workflow.name} title={`${workflow.kind} · ${component.evidence}`}>{workflow.name}</span>)}
        </div> : null}
      </article>)}
    </details> : null}
    {catalog.relationships.length ? <details className="project-catalog-group">
      <summary>Connections <small>{catalog.relationships.length}</small></summary>
      {catalog.relationships.map((edge, index) => <div className="project-connection" key={`${edge.from}:${edge.to}:${index}`} title={`Declared in ${edge.evidence}`}>
        <strong>{names.get(edge.from) ?? edge.from}</strong><small>{edge.kind === "depends-on" ? "depends on" : edge.kind === "proxy" ? "proxies to" : edge.kind === "contains" ? "contains" : "shares source with"}</small><span>{names.get(edge.to) ?? edge.to}</span>
      </div>)}
    </details> : null}
    {catalog.sites.length ? <details className="project-catalog-group" open>
      <summary>Sites <small>Configured</small></summary>
      {catalog.sites.map((site) => <article key={`${site.evidence}:${site.url}`}>
        <strong>{site.name}</strong>
        <div className="project-endpoints"><a href={site.url} target="_blank" rel="noreferrer" title={`Configured in ${site.evidence}`}>{site.url}</a></div>
      </article>)}
    </details> : null}
    {catalog.scan.status === "partial" ? <small title={catalog.scan.message}>Showing the components found so far</small> : null}
  </div>;
}
