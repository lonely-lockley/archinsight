import { editor, languages } from 'monaco-editor';
import * as monaco from 'monaco-editor-core';
import { Token, BufferedTokenStream, CharStream, CommonTokenStream, ParseTree, TerminalNode } from 'antlr4ng';
import { InsightLexer } from '../../generated/insight-lang/InsightLexer';
import { InsightParser } from '../../generated/insight-lang/InsightParser';
import { CompletionTokenSource } from './CompletionTokenSource';
import { CodeCompletionCore } from 'antlr4-c3'

import ITextModel = editor.ITextModel;
import IWordAtPosition = editor.IWordAtPosition;

import Position = monaco.Position;
import CancellationToken = monaco.CancellationToken;
import IRange = monaco.IRange;

import CompletionItemProvider = languages.CompletionItemProvider;
import CompletionContext = languages.CompletionContext
import CompletionList = languages.CompletionList;
import CompletionItem = languages.CompletionItem;

export class InsightAutocomplete implements CompletionItemProvider {

  private suggest(source: string, line: number, col: number, range: IRange, context: CompletionContext, endOfLine: boolean): CompletionList | undefined {
    const inputStream = CharStream.fromString(source);
    const lexer = new InsightLexer(inputStream);
    lexer.removeErrorListeners();
    const tknSrc = new CompletionTokenSource(lexer, line, col);
    const parser = new InsightParser(new BufferedTokenStream(tknSrc));
    parser.removeErrorListeners();
    var tree: ParseTree | null = null;
    try {
        tree = parser.insight();
    }
    catch (e) {}
    var core = new CodeCompletionCore(parser);
    core.ignoredTokens = new Set([
      InsightLexer.INDENT, InsightLexer.DEDENT, InsightLexer.EOL, InsightLexer.EOF, InsightLexer.COMMENT,
      InsightLexer.COLON, InsightLexer.EQ, InsightLexer.ANNOTATION_VALUE, InsightLexer.BLANK, InsightLexer.TEXT,
      InsightLexer.IDENTIFIER
    ]);
    var index = tknSrc.computeTokenIndex(line, col);
    var suggestions = core.collectCandidates(index);
    if (suggestions != undefined && suggestions.tokens.size > 0) {
        var result = Array.from(suggestions.tokens.keys()).flatMap((key) => {
            const name = lexer.vocabulary.getSymbolicName(key)!;
            switch (key) {
                case InsightLexer.SYSTEM:
                case InsightLexer.SERVICE:
                case InsightLexer.STORAGE:
                case InsightLexer.ACTOR: {
                    return this.suggestKeywordWithParameters(name, range, endOfLine);
                }
                case InsightLexer.WIRE: {
                    return this.suggestWireWithParameters(name, range, context, endOfLine);
                }
                case InsightLexer.NAME:
                case InsightLexer.DESCRIPTION:
                case InsightLexer.TECHNOLOGY: {
                    return this.suggestParameters(name, range, endOfLine);
                }
                case InsightLexer.ATTRIBUTE: {
                    return this.suggestAttributesWithParameters(name, range, context, endOfLine);
                }
                case InsightLexer.PLANNED:
                case InsightLexer.DEPRECATED: {
                    return this.suggestAttributes(name, range, context, endOfLine);
                }
                case InsightLexer.IMPORT: {
                    return this.suggestImports(name, range, endOfLine);
                }
                case InsightLexer.CONTEXT_ELEMENT_IMPORT: {
                    return this.suggestImportFromContext(name, range, endOfLine);
                }
                case InsightLexer.CONTAINER_ELEMENT_IMPORT: {
                    return this.suggestImportFromContainer(name, range, endOfLine);
                }
                case InsightLexer.LINKS: {
                    return this.suggestLinks(name, range, endOfLine);
                }
                default: {
                    return this.suggestKeywordInLowerCase(name, range, endOfLine);
                }
            }
        });
        return {
            suggestions: result
        };
    }
    return undefined;
  }

  private suggestKeywordInLowerCase(name: string, range: IRange, endOfLine: boolean): CompletionItem[] {
       const lower = name.toLowerCase();
       return [
           {
              label: lower,
              kind: monaco.languages.CompletionItemKind.Keyword,
              insertText: endOfLine ? lower + " " : lower,
              sortText: lower,
              range: range,
          }
      ];
  }

  private suggestKeywordWithParameters(name: string, range: IRange, endOfLine: boolean): CompletionItem[] {
      const lower = name.toLowerCase();
      return [
           {
              label: lower,
              kind: monaco.languages.CompletionItemKind.Keyword,
              insertText: endOfLine ? lower + " " : lower,
              sortText: lower,
              range: range,
           },
           {
              label: lower + " name",
              kind: monaco.languages.CompletionItemKind.Struct,
              insertText: lower + " ${1:id}\n    name = ${2:name}",
              filterText: lower,
              sortText: lower + "a",
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range: range,
          },
          {
              label: lower + " name tech desc",
              kind: monaco.languages.CompletionItemKind.Struct,
              insertText: lower + " ${1:id}\n    name = ${2:name}\n    tech = ${3:technology}\n    desc = ${4:description}",
              filterText: lower,
              sortText: lower + "b",
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range: range,
          }
      ];
  }

  private suggestWireWithParameters(name: string, range: IRange, context: CompletionContext, endOfLine: boolean): CompletionItem[] {
      var triggeredWithCharacter = context.triggerCharacter == '-' || context.triggerCharacter == '~'
        return [
            {
                label: "->",
                kind: monaco.languages.CompletionItemKind.Operator,
                insertText: triggeredWithCharacter ? (endOfLine ? "> " : ">") : (endOfLine ? "-> " : "->"),
                sortText: "a",
                range: range,
            },
            {
               label: "-> tech",
               kind: monaco.languages.CompletionItemKind.Struct,
               insertText: triggeredWithCharacter ? "> ${1:id}\n    technology = ${2:name}" : "-> ${1:id}\n    technology = ${2:name}",
               filterText: "-> ",
               sortText: "b",
               insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
               range: range,
           },
           {
               label: "-> tech desc",
               kind: monaco.languages.CompletionItemKind.Struct,
               insertText: triggeredWithCharacter ? "> ${1:id}\n    tech = ${2:technology}\n    desc = ${3:description}" : "-> ${1:id}\n    tech = ${2:technology}\n    desc = ${3:description}",
               filterText: "->",
               sortText: "c",
               insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
               range: range,
           },
           {
               label: "~>",
               kind: monaco.languages.CompletionItemKind.Operator,
               insertText: triggeredWithCharacter ? (endOfLine ? "> " : ">") : (endOfLine ? "~> " : "~>"),
               sortText: "c",
               range: range,
           },
           {
               label: "~> tech",
               kind: monaco.languages.CompletionItemKind.Struct,
               insertText: triggeredWithCharacter ? "> ${1:id}\n    technology = ${2:name}" : "~> ${1:id}\n    technology = ${2:name}",
               filterText: "~> ",
               sortText: "e",
               insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
               range: range,
           },
           {
               label: "~> tech desc",
               kind: monaco.languages.CompletionItemKind.Struct,
               insertText: triggeredWithCharacter ? "> ${1:id}\n    tech = ${2:technology}\n    desc = ${3:description}" : "~> ${1:id}\n    tech = ${2:technology}\n    desc = ${3:description}",
               filterText: "~>",
               sortText: "f",
               insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
               range: range,
           }
        ];
  }

  private suggestParameters(name: string, range: IRange, endOfLine: boolean): CompletionItem[] {
      const lower = name.toLowerCase();
      return [
          {
             label: lower,
             kind: monaco.languages.CompletionItemKind.Keyword,
             insertText: endOfLine ? lower + " = " : lower,
             sortText: lower,
             range: range,
         }
      ];
  }

  private suggestAttributes(name: string, range: IRange, context: CompletionContext, endOfLine: boolean): CompletionItem[] {
        const lower = name.toLowerCase();
        if (context.triggerCharacter == '@') {
            return [
                {
                    label: "@" + lower,
                    kind: monaco.languages.CompletionItemKind.Event,
                    insertText: lower,
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    filterText: lower,
                    range: range,
                }
            ];
        }
        else {
            return [];
        }
    }

  private suggestAttributesWithParameters(name: string, range: IRange, context: CompletionContext, endOfLine: boolean): CompletionItem[] {
      const lower = name.toLowerCase();
      if (context.triggerCharacter == '@') {
          return [
              {
                  label: "@" + lower,
                  kind: monaco.languages.CompletionItemKind.Event,
                  insertText: endOfLine ? lower + "(${1:parameters})" : lower,
                  insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                  filterText: lower,
                  range: range,
              }
          ];
      }
      else {
          return [];
      }
  }

  private suggestImports(name: string, range: IRange, endOfLine: boolean): CompletionItem[] {
       const lower = name.toLowerCase();
       return [
           {
               label: lower,
               kind: monaco.languages.CompletionItemKind.Keyword,
               insertText: endOfLine ? lower + " " : lower,
               sortText: lower,
               range: range,
           },
           {
              label: lower + " from context",
              kind: monaco.languages.CompletionItemKind.Struct,
              insertText: "import ${1:id} from context ${2:contextId}",
              filterText: lower,
              sortText: lower + "context",
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range: range,
           },
           {
               label: lower + " from container",
               kind: monaco.languages.CompletionItemKind.Struct,
               insertText: "import ${1:id} from container ${2:contextId}",
               filterText: lower,
               sortText: lower + "container",
               insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
               range: range,
           }
      ];
  }

  private suggestImportFromContext(name: string, range: IRange, endOfLine: boolean): CompletionItem[] {
      return [
          {
             label: "import from context",
             kind: monaco.languages.CompletionItemKind.Struct,
             insertText: "${1:id} from context ${2:contextId}",
             filterText: "context",
             sortText: "context",
             insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
             range: range,
          }
      ];
  }

  private suggestImportFromContainer(name: string, range: IRange, endOfLine: boolean): CompletionItem[] {
      return [
          {
             label: "import from container",
             kind: monaco.languages.CompletionItemKind.Struct,
             insertText: "${1:id} from container ${2:contextId}",
             filterText: "container",
             sortText: "container",
             insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
             range: range,
          }
      ];
  }

  private suggestLinks(name: string, range: IRange, endOfLine: boolean): CompletionItem[] {
       const lower = name.toLowerCase();
       return [
           {
              label: lower,
              kind: monaco.languages.CompletionItemKind.Keyword,
              insertText: endOfLine ? lower + ":\n    " : lower,
              sortText: lower,
              range: range,
          }
      ];
  }

  public triggerCharacters: string[] = Array.from("@abcdefghijklmnopqrstuvwxyz -~");

  public provideCompletionItems(model: ITextModel, position: Position, context: CompletionContext, token: CancellationToken): languages.ProviderResult<CompletionList> {
        const word: IWordAtPosition = model.getWordUntilPosition(position);
        const endOfLine: boolean = model.getLineMaxColumn(position.lineNumber) == position.column;
		const textRange: IRange = {
		  startLineNumber: 1,
		  endLineNumber: position.lineNumber,
		  startColumn: 1,
		  endColumn: position.column
		};
		const completionRange: IRange = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn
        };
		return this.suggest(model.getValueInRange(textRange), position.lineNumber, position.column, completionRange, context, endOfLine);
  }

}
