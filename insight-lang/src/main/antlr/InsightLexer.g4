lexer grammar InsightLexer;

@header {
package com.github.lonelylockley.insight.lang;
}

/* Levels */
CONTEXT     : 'context' -> pushMode(NAMESPACE_MODE);
CONTAINER   : 'container' -> pushMode(NAMESPACE_MODE);


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

/* Annotations */
ANNOTATION_NAME : ('attribute') ;

fragment LowerLetter  : 'a'..'z' ;
fragment Letter       : 'a'..'z' | 'A'..'Z' ;
fragment Digit        : '0'..'9' ;
fragment NL           : ('\r'?'\n' | '\r')+  ;
fragment WS           :  (' ' | '\t' | '\u000C') ;
fragment OPEN_BRAKET  : '(' ;
fragment CLOSE_BRAKET : ')' ;

COMMA       : ',' ;
EQ : '=' -> pushMode(VALUE_MODE);
LINKS : ('->' | '~>') ;
IDENTIFIER : (LowerLetter (Letter | Digit | '_')*) ;
INDENT : ('    ' | '\t') ;
EOL : (WS+)? NL ;
WHITESPACE : (NL | WS ) -> skip ;
COMMENT : '#' .*? (NL | EOF) ;
ANNOTATION : '@' ANNOTATION_NAME ;
ANNOTATION_VALUE: OPEN_BRAKET ( ~[)] )* CLOSE_BRAKET;

mode VALUE_MODE;
TEXT : .*? (WS* NL INDENT INDENT .*?)* (EOL | EOF) -> popMode ;
WHITESPACE2 : (NL | WS) -> skip ;

mode NAMESPACE_MODE;
PROJECTNAME : (LowerLetter (LowerLetter | Digit | '_')*) -> popMode ;
WHITESPACE3 : (NL | WS) -> skip ;
