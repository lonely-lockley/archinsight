import { editor, languages } from 'monaco-editor';
import * as monaco from 'monaco-editor-core';
import { Token, BufferedTokenStream, CharStream, CommonTokenStream, ParseTree, TerminalNode } from 'antlr4ng';
import { InsightLexer } from '../../generated/insight-lang/InsightLexer';
import { InsightParser } from '../../generated/insight-lang/InsightParser';
import { CompletionTokenSource } from './CompletionTokenSource';
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
    lexer.enableSingleLineMode();
    const tknSrc = new CompletionTokenSource(lexer, line, col);
    const parser = new InsightParser(new BufferedTokenStream(tknSrc));
    parser.removeErrorListeners();
    var tree: ParseTree | null = null;
    try {
        tree = parser.insight();
    }
    catch (e) {}
    var core = new CodeCompletionCore(parser);
    console.log(source);
    console.log("================================================");
    var index = this.computeTokenIndex(tree, range);
    index = tknSrc.ttt(line, col, index);
    if (index != undefined) {
        var suggestions = core.collectCandidates(index);
        if (suggestions != undefined && suggestions.tokens.size > 0) {
            return {
                // @ts-ignore
                suggestions: Array.from(suggestions.tokens.keys()).map((key) => {
                                        return {
                                            label: lexer.vocabulary.getSymbolicName(key),
                                            kind: monaco.languages.CompletionItemKind.Keyword,
                                            insertText: "???"
                                        }
                                    })
            }
        }
    }
    return undefined;
  }

  private computeTokenIndex(parseTree: ParseTree | null, range: IRange): number | undefined {
      if (parseTree == undefined) {
          return undefined;
      }
      else
      if (parseTree instanceof TerminalNode) {
          return this.computeTokenIndexOfTerminalNode(parseTree, range);
      }
      else {
          return this.computeTokenIndexOfChildNode(parseTree, range);
      }
  }

  private computeTokenIndexOfTerminalNode(parseTree: TerminalNode, range: IRange): number | undefined {
      var start = parseTree.symbol.column;
      var stop = parseTree.symbol.column + (parseTree.symbol.stop - parseTree.symbol.start);
      console.log("dbg: " + parseTree.symbol + " [idx=" + parseTree.symbol.tokenIndex + ", line=" + parseTree.symbol.line + ", start=" + parseTree.symbol.start, ", stop=" + parseTree.symbol.stop + "]  range: [startLineNumber=" + range.startLineNumber + ", endLineNumber=" + range.endLineNumber + ", startColumn=" + range.startColumn + ", endColumn=" + range.endColumn + "]\nEOF=" + parseTree.symbol.type + " || (" + parseTree.symbol.line + "==" + range.endLineNumber + " && " + start + "<=" + (range.endColumn - 2) + " && " + stop + ">=" + (range.endColumn - 2));
      if (parseTree.symbol.type == InsightLexer.EOF || (parseTree.symbol.line == range.endLineNumber && start <= (range.endColumn - 2) && stop >= (range.endColumn - 2))) {
          return parseTree.symbol.tokenIndex;
      }
      else {
          return undefined;
      }
  }

  private computeTokenIndexOfChildNode(parseTree: ParseTree | null, range: IRange): number | undefined {
      if (parseTree == null) {
          return undefined;
      }
      for (var i = 0; i < parseTree.getChildCount(); i++) {
          var index = this.computeTokenIndex(parseTree.getChild(i), range);
          if (index !== undefined) {
              return index;
          }
      }
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
		  startLineNumber: 1,
		  endLineNumber: position.lineNumber,
		  startColumn: 1,
		  endColumn: position.column
		};
		return this.suggest(model.getValueInRange(range), position.lineNumber, position.column, range, endOfLine);
  }

}
