parser grammar InsightParser2;

@header {
/* <package> */
package com.github.lonelylockley.insight.lang;
/* </package> */
}

options { tokenVocab = InsightLexer2; }

insight
    :   statement* EOF
    ;

statement
    :   contextExpression
    |   annotation EOL
    |   COMMENT EOL
    |   EOL
    ;

contextExpression
    :   EXTERNAL? SYSTEM identifierDeclaration EOL contextDefinition
    |   ACTOR identifierDeclaration EOL contextParameters
    ;

contextDefinition
    :   INDENT nameParameter descriptionParameter? containerExpression* DEDENT
    ;

containerExpression
    :   SERVICE identifierDeclaration EOL containerParameters
    |   STORAGE identifierDeclaration EOL containerParameters
    |   annotation EOL
    |   COMMENT EOL
    ;

contextParameters
    :   INDENT nameParameter descriptionParameter? DEDENT
    ;

containerParameters
    :   INDENT (nameParameter | descriptionParameter | technologyParameter | methodParameter)+ DEDENT
    ;

nameParameter
    :   NAME EQ parameterValue EOL
    ;

descriptionParameter
    :   DESCRIPTION EQ parameterValue EOL
    ;

technologyParameter
    :   TECHNOLOGY EQ parameterValue EOL
    ;

viaParameter
    :   VIA EQ parameterValue EOL
    ;

methodParameter
    :   CALL EQ parameterValue EOL
    ;

parameterValue
    :   WRAP TEXT+ UNWRAP
    ;

identifierDeclaration
    :   IDENTIFIER
    ;

identifierUsage
    :   IDENTIFIER
    ;

annotation
    :   ATTRIBUTE annotationValue
    |   PLANNED annotationValue
    |   DEPRECATED annotationValue
    ;

annotationValue
    :   LPAREN TEXT? RPAREN
    ;
