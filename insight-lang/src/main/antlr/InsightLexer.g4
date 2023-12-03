lexer grammar InsightLexer;

@header {
/* <package> */
package com.github.lonelylockley.insight.lang;
/* </package> */
/* <import> */
import com.github.lonelylockley.archinsight.lexer.*;
/* </import> */
}

@members {
/* <override> */
  private final IndentHelper helper = new IndentHelper(
      InsightLexer.super::nextToken,
      this
    );

  @Override
  public Token nextToken() {
    Token tkn = helper.nextToken();
    //debugPrinter(tkn);
    return tkn;
  }

  public LexerState snapshotState() {
    return helper.snapshotState();
  }

  public void restoreState(LexerState state) {
    helper.restoreState(state);
  }

  public void enableSingleLineMode() {
    helper.enableSingleLineMode();
  }

  private void debugPrinter(Token tkn) {
      final String rawType = getVocabulary().getSymbolicName(tkn.getType());
      System.out.println("---- " + rawType + " [line=" + tkn.getLine() + ",mode=" + _mode + ",channel=" + tkn.getChannel() + "] = `" + tkn.getText() + "`");
  }
/* </override> */
}

tokens { INDENT, DEDENT, IDENTIFIER, TEXT }

/* Levels */
CONTEXT     : 'context'   -> pushMode(NAMESPACE_MODE) ;
CONTAINER   : 'container' -> pushMode(NAMESPACE_MODE) ;

/* Keywords */
EXTERNAL    : ('external' | 'ext') ;
SYSTEM      : ('system')           -> pushMode(IDENTIFIER_MODE) ;
ACTOR       : ('person' | 'actor') -> pushMode(IDENTIFIER_MODE) ;
NAME        : ('name') ;
DESCRIPTION : ('description' | 'desc') ;
TECHNOLOGY  : ('technology' | 'tech') ;
LINKS       : ('links') ;
WIRE        : ('->' | '~>')        -> pushMode(IMPORT_MODE) ;
SERVICE     : ('service')          -> pushMode(IDENTIFIER_MODE) ;
STORAGE     : ('storage')          -> pushMode(IDENTIFIER_MODE) ;
BOUNDARY    : ('boundary')         -> pushMode(IDENTIFIER_MODE) ;
IMPORT      : ('import')           -> pushMode(IMPORT_MODE) ;
AS          : ('as')               -> pushMode(IMPORT_MODE) ;
FROM        : ('from')             -> pushMode(IMPORT_MODE);

/* Annotations */
ATTRIBUTE  : ('@attribute') ;
PLANNED    : ('@planned') ;
DEPRECATED : ('@deprecated') ;

fragment LowerLetter  : 'a'..'z' ;
fragment Letter       : 'a'..'z' | 'A'..'Z' ;
fragment Digit        : '0'..'9' ;
fragment Nl           : ('\r'?'\n' | '\n')  ;
fragment Ws           : (' ' | '\t' | '\u000C') ;
fragment NonWs        : ~(' ' | '\t' | '\u000C' | '\r' | '\n') ;
fragment OpenBracket  : '(' ;
fragment CloseBracket : ')' ;

COLON            : ':' ;
EQ               : '=' Ws* -> pushMode(VALUE_MODE) ;
EOL              : { /* <position> */ getCharPositionInLine() /* </position> */ > 0 }? Nl ;
EMPTY_LINE       : { /* <position> */ getCharPositionInLine() /* </position> */ == 0 }? Nl -> skip  ;
BLANK            : { /* <position> */ getCharPositionInLine() /* </position> */ > 0 }? Ws+ -> channel(HIDDEN) ;
INDENTATION      : { /* <position> */ getCharPositionInLine() /* </position> */ == 0 }? Ws+ -> channel(HIDDEN) ;
ANNOTATION_VALUE : OpenBracket ( ~[)] )* CloseBracket ;
COMMENT          : '#' .*? (EOL | EOF) ;

mode NAMESPACE_MODE;
NAMESPACE           : (LowerLetter (LowerLetter | Digit | '_')*) -> type(IDENTIFIER), popMode ;
BLANK_NAMESPACE     : BLANK -> skip ;

mode IDENTIFIER_MODE;
ID                : (LowerLetter (Letter | Digit | '_')*) -> type(IDENTIFIER), popMode ;
BLANK_INDENTIFIER : BLANK -> skip ;

mode VALUE_MODE;
WORD               : NonWs+ -> type(TEXT) ;
BLANK_VALUE        : BLANK -> type(TEXT), channel(DEFAULT_TOKEN_CHANNEL) ;
INDENTATION_VALUE  : INDENTATION -> type(INDENTATION), channel(HIDDEN) ;
EOL_VALUE          : EOL INDENTATION? { /* <helper> */ if (helper.checkTextBlockBound(getText())) { popMode(); } /* </helper> */ } ;
EOF_VALUE          : EOF -> type(EOF), popMode ;

mode IMPORT_MODE;
CONTEXT_IMPORT           : CONTEXT -> popMode, pushMode(NAMESPACE_MODE) ;
CONTAINER_IMPORT         : CONTAINER -> popMode, pushMode(NAMESPACE_MODE) ;
CONTEXT_ELEMENT_IMPORT   : (SYSTEM | ACTOR) ;
CONTAINER_ELEMENT_IMPORT : (SERVICE | STORAGE) ;
IDENTIFIER_IMPORT        : (LowerLetter (Letter | Digit | '_')*) -> type(IDENTIFIER), popMode ;
BLANK_IMPORT             : BLANK -> skip ;
