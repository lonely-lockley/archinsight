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
      this
    );

  @Override
  public Token nextToken() {
    Token tkn = helper.nextToken();
    //debugPrinter(tkn);
    return tkn;
  }

  public Token supplyToken() {
    return super.nextToken();
  }

  public Pair<TokenSource, CharStream> getTokenFactorySourcePair() {
    return super._tokenFactorySourcePair;
  }

  private void debugPrinter(Token tkn) {
      final String rawType = getVocabulary().getSymbolicName(tkn.getType());
      System.out.println("---- " + rawType + " [line=" + tkn.getLine() + ",mode=" + _mode + ",channel=" + tkn.getChannel() + "] = `" + tkn.getText() + "`");
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
/* </override> */
}

tokens { INDENT, DEDENT, WRAP, UNWRAP, TEXT }

/* Keywords */
EXTERNAL    : ('external') ;
SYSTEM      : ('system') ;
ACTOR       : ('actor') ;
SERVICE     : ('service') ;
STORAGE     : ('storage') ;
NAME        : ('name') ;
DESCRIPTION : ('description') ;
TECHNOLOGY  : ('technology') ;
VIA         : ('via') ;
CALL        : ('call') ;
FORMAT      : ('format') ;
LINKS       : ('links') ;
SWIRE       : ('->') ;
AWIRE       : ('~>') ;
IMPORT      : ('import') ;
FROM        : ('from') ;
AS          : ('as') ;

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

EOL        : Nl+ (Ws+)? { this.helper.checkIndentation(); } -> skip ;
COMMENT    : '#' ~[\r\n]* ;
IDENTIFIER : (LowerLetter (Letter | Digit | '_')*) ;
BLANK      : Ws+ -> skip ;
EQ         : '=' Ws* -> pushMode(VALUE_MODE) ;
LPAREN     : '(' -> pushMode(ANNOTATION_PARAMETERS) ;
COLON      : ':' ;

mode VALUE_MODE;
VALUE_TEXT :  NonWs ~[\r\n]* { this.helper.wrapValue(); }  -> type(TEXT) ;
VALUE_EOL  :  Nl+ (Ws+)? { this.helper.unwrapValue(); } -> skip;

mode ANNOTATION_PARAMETERS;
PARAMETERS_TEXT : ~[()]+ -> type(TEXT);
RPAREN          : ')' -> popMode;
