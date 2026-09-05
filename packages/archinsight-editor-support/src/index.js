const completionBuckets = Object.freeze({
  KEYWORD: '0',
  CONSTRUCTOR: '1',
  OPERATOR: '2',
  ATTRIBUTE: '3',
  IDENTIFIER: '4',
  ENUM_VALUE: '5',
  TYPE: '6',
  ANNOTATION: '7',
  NEWLINE: '8'
});

export function completionDetail(item) {
  return item.kind === 'IDENTIFIER' && item.imported === true ? 'imported identifier' : item.kind;
}

export function completionDisplayLabel(item) {
  return { label: item.label, description: completionDetail(item) };
}

export function completionSortBucket(kind) {
  return completionBuckets[kind];
}

export function completionSortText(item) {
  return `${completionSortBucket(item.kind)}:${item.label}`;
}

export function completionDocumentationMarkdown(documentation) {
  if (documentation === undefined) {
    return undefined;
  }
  const sections = [];
  if (documentation.header !== undefined) {
    sections.push(`**${markdownText(documentation.header)}**`);
  }
  if (documentation.subtitle !== undefined) {
    sections.push(markdownText(documentation.subtitle));
  }
  if (documentation.body !== undefined) {
    sections.push(markdownText(documentation.body));
  }
  if (documentation.type !== undefined) {
    const typeDescription = documentation.type.abstract ? 'Abstract type' : 'Type';
    sections.push(documentation.type.baseType === undefined
      ? `_${typeDescription}_`
      : `_${typeDescription} · extends \`${documentation.type.baseType}\`_`);
    sections.push('**Available constructors**');
    sections.push(documentation.type.constructors.length === 0
      ? 'No compatible constructors.'
      : documentation.type.constructors
        .map((constructor) => `- \`${constructor.spelling}\` → \`${constructor.ownerType}\``)
        .join('\n'));
  }
  return sections.length === 0 ? undefined : sections.join('\n\n');
}

function markdownText(value) {
  return value
    .replace(/([\\`*_{}\[\]<>#+\-.!|>])/g, '\\$1')
    .replace(/\r?\n/g, '  \n');
}

export function semanticTokenModifierBits(modifiers, vocabulary) {
  let bits = 0;
  for (const modifier of modifiers ?? []) {
    const index = vocabulary.indexOf(modifier);
    if (index >= 0) {
      bits |= 1 << index;
    }
  }
  return bits;
}

export function filterTreeByQuery(nodes, query, searchText) {
  const normalized = query.trim().toLocaleLowerCase();
  if (normalized.length === 0) {
    return [...nodes];
  }
  return nodes.flatMap((node) => filterTreeNode(node, normalized, searchText));
}

function filterTreeNode(node, query, searchText) {
  if (searchText(node).toLocaleLowerCase().includes(query)) {
    return [node];
  }
  const children = node.children.flatMap((child) => filterTreeNode(child, query, searchText));
  return children.length === 0 ? [] : [{ ...node, children }];
}

export function diagnosticIdentity(diagnostic) {
  return [
    diagnostic.source,
    diagnostic.level ?? '',
    diagnostic.code,
    diagnostic.message,
    diagnostic.line ?? '',
    diagnostic.column ?? '',
    diagnostic.endLine ?? '',
    diagnostic.endColumn ?? ''
  ].join('\u0000');
}
