lexer grammar InsightLexer2;

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
  private final IndentHelper2 helper = new IndentHelper2(
      InsightLexer2.super::nextToken,
      this
    );

  @Override
  public Token nextToken() {
    Token tkn = helper.nextToken();
    //debugPrinter(tkn);
    return tkn;
  }

  public Pair<TokenSource, CharStream> getTokenFactorySourcePair() {
    return super._tokenFactorySourcePair;
  }

  private void debugPrinter(Token tkn) {
      final String rawType = getVocabulary().getSymbolicName(tkn.getType());
      System.out.println("---- " + rawType + " [line=" + tkn.getLine() + ",mode=" + _mode + ",channel=" + tkn.getChannel() + "] = `" + tkn.getText() + "`");
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

EOL        : Nl+ (Ws+)? { helper.checkIndentation(); } ;
COMMENT    : '#' ~[\r\n]* ;
IDENTIFIER : (LowerLetter (Letter | Digit | '_')*) ;
BLANK      : Ws+ -> skip ;
EQ         : '=' Ws* -> pushMode(VALUE_MODE) ;
LPAREN     : '(' -> pushMode(ANNOTATION_PARAMETERS) ;

mode VALUE_MODE;
VALUE_TEXT :  NonWs ~[\r\n]* { helper.wrapValue(); }  -> type(TEXT) ;
VALUE_EOL  :  Nl+ (Ws+)? { helper.unwrapValue(); } ;

mode ANNOTATION_PARAMETERS;
PARAMETERS_TEXT    : ~[()]+ -> type(TEXT);
RPAREN             : ')' -> popMode;
