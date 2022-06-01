lexer grammar InsightLexer;

@header {
package com.github.lonelylockley.insight.lang;
}

/* Levels */
CONTEXT     : 'context' -> pushMode(NAMESPACE);
CONTAINER   : 'container' -> pushMode(NAMESPACE);


/* Keywords */
SYSTEM      : ('system' | 'sys');
EXTERNAL    : ('external' | 'ext') ;
PERSON      : ('person' | 'user') ;
NAME        : 'name' ;
DESCRIPTION : ('description' | 'desc') ;
TECHNOLOGY  : ('technology' | 'tech') ;
SERVICE     : ('service') ;
STORAGE     : ('storage') ;
MODULE      : ('module') ;
CONTAINS    : ('contains') ;

fragment LowerLetter : 'a'..'z' ;
fragment Letter      : 'a'..'z' | 'A'..'Z' ;
fragment Digit       : '0'..'9' ;
fragment NL          : ('\r'?'\n' | '\r')+  ;
fragment WS          :  (' ' | '\t' | '\u000C') ;

COMMA       : ',' ;
EQ : '=' -> pushMode(VALUE_MODE);
LINKS : ('->' | '~>') ;
IDENTIFIER : (LowerLetter (Letter | Digit | '_')*) ;
INDENT : ('    ' | '\t') ;
EOL : (WS+)? NL ;
WHITESPACE : (NL | WS ) -> skip;
COMMENT : '#' .*? (NL | EOF) -> skip;

mode VALUE_MODE;
TEXT : .*? (WS* NL INDENT INDENT .*?)* (EOL | EOF) -> popMode ;
WHITESPACE2 : (NL | WS) -> skip ;

mode NAMESPACE;
PROJECTNAME : (LowerLetter (LowerLetter | Digit | '_')*) -> popMode ;
WHITESPACE3 : (NL | WS) -> skip ;
