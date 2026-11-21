import type { DiagramNotice } from '@archinsight/contracts';
import type { DiagramMode } from './workspace-types.js';

export function emptyDiagramNotice(
  mode: DiagramMode,
  queryDriven: boolean,
  environment?: string
): DiagramNotice {
  if (queryDriven) {
    return {
      kind: 'empty',
      title: 'Query result is empty',
      detail: 'The query completed successfully and returned no visible elements.'
    };
  }
  switch (mode) {
    case 'c1': return empty('C1 diagram is empty', 'The current context contains no system-level elements.');
    case 'c2': return empty('C2 diagram is empty', 'The current source contains no container-level elements.');
    case 'c3': return empty('C3 diagram is empty', 'The current source contains no component-level elements.');
    case 'c4': return empty('C4 diagram is empty', 'The current source contains no code-level elements.');
    case 'deployment-system': return empty('D1 diagram is empty', 'The current source contains no elements included in the system deployment view.');
    case 'deployment-container': return empty(
      'D2 diagram is empty',
      environment === undefined
        ? 'The current source contains no elements included in the container deployment view.'
        : `The ${environment} environment contains no deployment elements from the current source.`
    );
    case 'deployment': return empty('Deployment diagram is empty', 'The current source contains no visible deployment elements.');
    default: return empty('Diagram is empty', 'The current context contains no visible elements.');
  }
}

export function queryScopeNotice(): DiagramNotice {
  return {
    kind: 'waiting',
    title: 'Query scope is not defined',
    detail: 'This query requires a source or context.'
  };
}

export function deploymentEnvironmentNotice(): DiagramNotice {
  return {
    kind: 'empty',
    title: 'D2 diagram is empty',
    detail: 'No deployment environments are relevant to the current source.'
  };
}

export function coreSourceNotice(): DiagramNotice {
  return {
    kind: 'unavailable',
    title: 'Diagram is unavailable',
    detail: 'Framework definitions are not rendered.'
  };
}

export function linkerErrorNotice(): DiagramNotice {
  return {
    kind: 'unavailable',
    title: 'Diagram is unavailable',
    detail: 'The project contains linking errors.'
  };
}

export function queryErrorNotice(): DiagramNotice {
  return {
    kind: 'unavailable',
    title: 'Diagram is unavailable',
    detail: 'The query could not be evaluated.'
  };
}

export function renderErrorNotice(): DiagramNotice {
  return {
    kind: 'unavailable',
    title: 'Diagram is unavailable',
    detail: 'The diagram renderer did not produce a result.'
  };
}

export function emptyProjectionNotice(): DiagramNotice {
  return {
    kind: 'empty',
    title: 'Diagram is empty',
    detail: 'The selected projection contains no visible elements.'
  };
}

function empty(title: string, detail: string): DiagramNotice {
  return { kind: 'empty', title, detail };
}
