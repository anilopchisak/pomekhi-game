import type { GameSnapshot } from '../../../shared/protocol.js';

export function GameReferences({ references }: { references: GameSnapshot['references'] }) {
  return <>{references?.map(reference => <details key={reference.id}>
    <summary>{reference.title}</summary>
    {reference.sections.map(section => <section key={section.title}><h3>{section.title}</h3><p>{section.text}</p></section>)}
  </details>)}</>;
}
