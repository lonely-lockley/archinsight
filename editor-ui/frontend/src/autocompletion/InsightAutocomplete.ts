import { editor, languages } from 'monaco-editor';
import * as monaco from 'monaco-editor-core';
import { Token, BufferedTokenStream, CharStream, CommonTokenStream } from 'antlr4ng';
import { InsightLexer } from '../../generated/insight-lang/InsightLexer';
import { InsightParser } from '../../generated/insight-lang/InsightParser';
import { CodeCompletionCore } from 'antlr4-c3'

import EOF = Token.EOF;
import IToken = languages.IToken;

import ITextModel = editor.ITextModel;
import IWordAtPosition = editor.IWordAtPosition;

import Position = monaco.Position;
import CancellationToken = monaco.CancellationToken;
import IRange = monaco.IRange;

import CompletionItemProvider = languages.CompletionItemProvider;
import CompletionContext = languages.CompletionContext
import CompletionList = languages.CompletionList;

export class InsightAutocomplete implements CompletionItemProvider {

  private suggest(source: string, line: number, col: number, range: IRange, endOfLine: boolean): CompletionList | undefined {
    const inputStream = CharStream.fromString(source);
    const lexer = new InsightLexer(inputStream);
    lexer.removeErrorListeners();
    const parser = new InsightParser(new CommonTokenStream(lexer));
    parser.insight();
    var core = new CodeCompletionCore(parser);
    console.log("================================================");
    console.log(core.collectCandidates(2));
    console.log("================================================");
    return undefined;
  }

  private items(range: IRange, endOfLine: boolean): CompletionList {
      return {
        suggestions: [
            {
                label: "@attribute",
                kind: monaco.languages.CompletionItemKind.Event,
                insertText: endOfLine ? "attribute(${1:parameters})" : "attribute",
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                filterText: "@attribute",
                range: range,
            },
            {
                label: "@deprecated",
                kind: monaco.languages.CompletionItemKind.Event,
                insertText: "deprecated",
                filterText: "@deprecated",
                range: range,
            },
            {
                label: "@planned",
                kind: monaco.languages.CompletionItemKind.Event,
                insertText: "planned",
                filterText: "@planned",
                range: range,
            },
            {
                label: "context",
                kind: monaco.languages.CompletionItemKind.Class,
                insertText: endOfLine ? "context " : "context",
                range: range,
            },
            {
                label: "container",
                kind: monaco.languages.CompletionItemKind.Class,
                insertText: endOfLine ? "container " : "container",
                range: range,
            },
            {
                label: "ext",
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: endOfLine ? "ext " : "ext",
                range: range,
            },
            {
                label: "external",
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: endOfLine ? "external " : "external",
                range: range,
            },
            {
                label: "as",
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: endOfLine ? "as " : "as",
                range: range,
            },
            {
                label: "from",
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: endOfLine ? "from " : "from",
                range: range,
            },
            {
                label: "name",
                kind: monaco.languages.CompletionItemKind.Property,
                insertText: "name = ",
                range: range,
            },
            {
                label: "desc",
                kind: monaco.languages.CompletionItemKind.Property,
                insertText: "desc = ",
                range: range,
            },
            {
                label: "description",
                kind: monaco.languages.CompletionItemKind.Property,
                insertText: "description = ",
                range: range,
            },
            {
                label: "tech",
                kind: monaco.languages.CompletionItemKind.Property,
                insertText: "tech = ",
                range: range,
            },
            {
                label: "technology",
                kind: monaco.languages.CompletionItemKind.Property,
                insertText: "technology = ",
                range: range,
            },
            {
                label: "links",
                kind: monaco.languages.CompletionItemKind.Property,
                insertText: "links:\n    ",
                range: range,
            },
            {
                label: "sync",
                kind: monaco.languages.CompletionItemKind.Operator,
                insertText: endOfLine ? "-> " : "->",
                range: range,
            },
            {
                label: "async",
                kind: monaco.languages.CompletionItemKind.Operator,
                insertText: endOfLine ? "~> " : "~>",
                range: range,
            },
            {
                label: "system",
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: endOfLine ? "system " : "system",
                filterText: "system",
                sortText: "system",
                range: range,
            },
            {
                label: "system name",
                kind: monaco.languages.CompletionItemKind.Struct,
                insertText: "system ${1:id}\n    name = ${2:name}",
                filterText: "system",
                sortText: "systema",
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                range: range,
            },
            {
                label: "system name tech desc",
                kind: monaco.languages.CompletionItemKind.Struct,
                insertText: "system ${1:id}\n    name = ${2:name}\n    tech = ${3:technology}\n    desc = ${4:description}",
                filterText: "system",
                sortText: "systemb",
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                range: range,
            },
            {
                label: "person",
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: endOfLine ? "person " : "person",
                filterText: "person",
                sortText: "person",
                range: range,
            },
            {
                label: "person name",
                kind: monaco.languages.CompletionItemKind.Struct,
                insertText: "person ${1:id}\n    name = ${2:name}",
                filterText: "person",
                sortText: "persona",
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                range: range,
            },
            {
                label: "person name desc",
                kind: monaco.languages.CompletionItemKind.Struct,
                insertText: "person ${1:id}\n    name = ${2:name}\n    desc = ${3:description}",
                filterText: "person",
                sortText: "personb",
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                range: range,
            },
            {
                label: "actor",
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: endOfLine ? "actor " : "actor",
                filterText: "actor",
                sortText: "actor",
                range: range,
            },
            {
                label: "actor name",
                kind: monaco.languages.CompletionItemKind.Struct,
                insertText: "actor ${1:id}\n    name = ${2:name}",
                filterText: "actor",
                sortText: "actora",
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                range: range,
            },
            {
                label: "actor name desc",
                kind: monaco.languages.CompletionItemKind.Struct,
                insertText: "actor ${1:id}\n    name = ${2:name}\n    desc = ${3:description}",
                filterText: "actor",
                sortText: "actorb",
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                range: range,
            },
            {
                label: "service",
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: endOfLine ? "service " : "service",
                filterText: "service",
                sortText: "service",
                range: range,
            },
            {
                label: "service name",
                kind: monaco.languages.CompletionItemKind.Struct,
                insertText: "service ${1:id}\n    name = ${2:name}",
                filterText: "service",
                sortText: "servicea",
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                range: range,
            },
            {
                label: "service name tech desc",
                kind: monaco.languages.CompletionItemKind.Struct,
                insertText: "service ${1:id}\n    name = ${2:name}\n    tech = ${3:technology}\n    desc = ${4:description}",
                filterText: "service",
                sortText: "serviceb",
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                range: range,
            },
            {
                label: "storage",
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: endOfLine ? "storage " : "storage",
                filterText: "storage",
                sortText: "storage",
                range: range,
            },
            {
                label: "storage name",
                kind: monaco.languages.CompletionItemKind.Struct,
                insertText: "storage ${1:id}\n    name = ${2:name}",
                filterText: "storage",
                sortText: "storagea",
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                range: range,
            },
            {
                label: "storage name tech desc",
                kind: monaco.languages.CompletionItemKind.Struct,
                insertText: "storage ${1:id}\n    name = ${2:name}\n    tech = ${3:technology}\n    desc = ${4:description}",
                filterText: "storage",
                sortText: "storageb",
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                range: range,
            },
            {
                label: "boundary",
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: endOfLine ? "boundary " : "boundary",
                filterText: "boundary",
                sortText: "boundary",
                range: range,
            },
            {
                label: "boundary name",
                kind: monaco.languages.CompletionItemKind.Struct,
                insertText: "boundary ${1:id}\n    name = ${2:name}",
                filterText: "boundary",
                sortText: "boundarya",
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                range: range,
            },
            {
                label: "import",
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: endOfLine ? "import " : "import",
                filterText: "import",
                sortText: "import",
                range: range,
            },
            {
                label: "import what from level namespace",
                kind: monaco.languages.CompletionItemKind.Struct,
                insertText: "import ${1:id} from ${2:level} ${3:sourceNamespace}",
                filterText: "import",
                sortText: "importa",
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                range: range,
            },
            {
                label: "import type what from level namespace",
                kind: monaco.languages.CompletionItemKind.Struct,
                insertText: "import ${1:type} ${2:id} from ${3:level} ${4:sourceNamespace}",
                filterText: "import",
                sortText: "importb",
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                range: range,
            },
            {
                label: "import what from level namespace as alias",
                kind: monaco.languages.CompletionItemKind.Struct,
                insertText: "import ${1:id} from ${2:level} ${3:sourceNamespace} as ${4:alias}",
                filterText: "import",
                sortText: "importc",
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                range: range,
            },
            {
                label: "import type what from level namespace as alias",
                kind: monaco.languages.CompletionItemKind.Struct,
                insertText: "import ${1:type} ${2:id} from ${3:level} ${4:sourceNamespace} as ${4:alias}",
                filterText: "import",
                sortText: "importd",
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                range: range,
            },
          ]
      };
  };

  public triggerCharacters: string[] = Array.from("@abcdefghijklmnopqrstuvwxyz ");

  public provideCompletionItems(model: ITextModel, position: Position, context: CompletionContext, token: CancellationToken): languages.ProviderResult<CompletionList> {
        var word: IWordAtPosition = model.getWordUntilPosition(position);
        var endOfLine: boolean = model.getLineMaxColumn(position.lineNumber) == position.column;
		var range: IRange = {
		  startLineNumber: 0,
		  endLineNumber: position.lineNumber,
		  startColumn: 0,
		  endColumn: word.endColumn
		};
		return this.suggest(model.getValueInRange(range), position.lineNumber, position.column, range, endOfLine);
  }

}
