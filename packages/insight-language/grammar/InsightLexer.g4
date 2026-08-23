lexer grammar InsightLexer;

@header {
import { LayoutLexerHelper, LexerState } from "../runtime/layout-lexer-helper.js";
}

@members {
  private readonly helper = new LayoutLexerHelper(this);

  public override nextToken(): Token {
    return this.helper.nextToken();
  }

  public supplyToken(): Token {
    return super.nextToken();
  }

  public snapshotState(): LexerState {
    return this.helper.snapshotState();
  }

  public restoreState(state: LexerState): void {
    this.helper.restoreState(state);
  }

  public enableSingleLineMode(): void {
    this.helper.enableSingleLineMode();
  }
}

tokens {
    INDENT,
    DEDENT,
    WRAP,
    UNWRAP,
    TEXT,
    ANNOTATION_VALUE
}

DEFINE      : 'define';
EXTEND      : 'extend';
PRESENTATION: 'presentation';
TYPE        : 'type';
OPERATOR    : 'operator';
ENUM        : 'enum';
OF          : 'of';
OR          : 'or';
ON          : 'on';
CONSTRUCTOR : 'constructor';
REQUIRED    : 'required';
IMPORT      : 'import';
FROM        : 'from';
AS          : 'as';
CONTEXT     : 'context';
ENVIRONMENT : 'environment';
PROJECT     : 'project';
PROJECTION  : 'projection';
FIXED       : 'fixed';
IN          : 'in';
IMPLEMENTATION
            : 'implementation';

PROJECTION_FROM
    : '$from'
    ;

PROJECTION_TO
    : '$to'
    ;

PROJECTION_THIS
    : '$this'
    ;

PROJECTION_SLOT
    : '$slot'
    ;

PROJECTION_OWNER
    : '$owner'
    ;

ATTRIBUTE_ANNOTATION
    : '@attribute'
    ;

PLANNED_ANNOTATION
    : '@planned'
    ;

DEPRECATED_ANNOTATION
    : '@deprecated'
    ;

LIST_TYPE
    : 'List'
    ;

TYPE_IDENTIFIER
    : [A-Z] [a-zA-Z_0-9]*
    ;

IDENTIFIER
    : [a-z] [a-zA-Z_0-9]*
    ;

ANONYMOUS_ATTRIBUTE
    : '_'
    ;

COLON
    : ':'
    ;

LPAREN
    : '(' -> pushMode(ANNOTATION_PARAMETERS)
    ;

OPERATOR_IDENTIFIER
    : [!$%&*+\-./<>?@\\^|~]+
    ;

EQ
    : '=' [ \t]* -> pushMode(VALUE_MODE)
    ;

EOL
    : ('\r'? '\n')+ [ \t]* { this.helper.checkIndentation(); } -> skip
    ;

COMMENT
    : '#' ~[\r\n]*
    ;

WHITESPACE
    : [ \t]+ -> skip
    ;

mode VALUE_MODE;

VALUE_TEXT
    : ~[ \t\r\n] ~[\r\n]* { this.helper.wrapValue(); } -> type(TEXT)
    ;

VALUE_EOL
    : ('\r'? '\n')+ [ \t]* { this.helper.unwrapValue(); } -> skip
    ;

mode ANNOTATION_PARAMETERS;

PARAMETERS_TEXT
    : ~[()]+ -> type(ANNOTATION_VALUE)
    ;

RPAREN
    : ')' -> popMode
    ;
