import * as monaco from 'monaco-editor';
import {editor, languages} from 'monaco-editor';

import {BufferedTokenStream, CharStream} from 'antlr4ng';
import {InsightLexer} from '../../generated/insight-lang/InsightLexer';
import {InsightParser} from '../../generated/insight-lang/InsightParser';
import {CompletionTokenSource} from './CompletionTokenSource';
import {CodeCompletionCore} from 'antlr4-c3'
import ITextModel = editor.ITextModel;
import IWordAtPosition = editor.IWordAtPosition;

import Position = monaco.Position;
import CancellationToken = monaco.CancellationToken;
import IRange = monaco.IRange;

import CompletionItemProvider = languages.CompletionItemProvider;
import CompletionContext = languages.CompletionContext;
import CompletionList = languages.CompletionList;
import CompletionItem = languages.CompletionItem;

export class InsightAutocomplete implements CompletionItemProvider {

  private suggest(source: string, line: number, col: number, range: IRange, context: CompletionContext, endOfLine: boolean): CompletionList | undefined {
    const inputStream = CharStream.fromString(source);
    const lexer = new InsightLexer(inputStream);
    lexer.removeErrorListeners();
    const parser = new InsightParser(new BufferedTokenStream(lexer));
    parser.removeErrorListeners();
    const listener = new CompletionTokenSource(line, col);
    parser.addParseListener(listener);
    try {
        parser.insight();
    }
    catch (e) {}
    var core = new CodeCompletionCore(parser);
    core.ignoredTokens = new Set([
      InsightLexer.INDENT, InsightLexer.DEDENT, InsightLexer.EOL, InsightLexer.EOF, InsightLexer.COMMENT,
      InsightLexer.COLON, InsightLexer.EQ, InsightLexer.BLANK, InsightLexer.TEXT, InsightLexer.IDENTIFIER,
      InsightLexer.WRAP, InsightLexer.UNWRAP
    ]);
    var suggestions = core.collectCandidates(listener.getTokenIndex());
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
                case InsightLexer.SWIRE: {
                    return this.suggestSyncWire(name, range, context, endOfLine);
                }
                case InsightLexer.AWIRE: {
                    return this.suggestAsyncWire(name, range, context, endOfLine);
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
           }
      ];
  }

  private suggestSyncWire(name: string, range: IRange, context: CompletionContext, endOfLine: boolean): CompletionItem[] {
      var triggeredWithCharacter = context.triggerCharacter == '-' || context.triggerCharacter == '~'
        return [
            {
                label: "->",
                kind: monaco.languages.CompletionItemKind.Operator,
                insertText: triggeredWithCharacter ? (endOfLine ? "> " : ">") : (endOfLine ? "-> " : "->"),
                sortText: "a",
                range: range,
            }
        ];
  }

    private suggestAsyncWire(name: string, range: IRange, context: CompletionContext, endOfLine: boolean): CompletionItem[] {
        var triggeredWithCharacter = context.triggerCharacter == '-' || context.triggerCharacter == '~'
        return [
            {
                label: "~>",
                kind: monaco.languages.CompletionItemKind.Operator,
                insertText: triggeredWithCharacter ? (endOfLine ? "> " : ">") : (endOfLine ? "~> " : "~>"),
                sortText: "c",
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
