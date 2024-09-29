parser grammar InsightParser;

@header {
/* <package> */
package com.github.lonelylockley.insight.lang;
/* </package> */
}

options { tokenVocab = InsightLexer; }

insight
    :   statement* EOF
    ;

importStatement
    :   IMPORT identifierUsage FROM SYSTEM identifierUsage (AS identifierDeclaration)? EOL
    |   COMMENT EOL
    |   EOL
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
    |   EOL
    ;

contextParameters
    :   INDENT nameParameter descriptionParameter? linksDeclaration? DEDENT
    ;

containerParameters
    :   INDENT (nameParameter | descriptionParameter | technologyParameter)+ linksDeclaration? DEDENT
    ;

syncWireParameters
    :   INDENT (callParameter | descriptionParameter | technologyParameter)+ DEDENT
    ;

asyncWireParameters
    :   INDENT (formatParameter | descriptionParameter | technologyParameter | viaParameter)+ DEDENT
    ;

linksDeclaration
    :   LINKS COLON EOL wireList
    ;

wireList
    :   INDENT wireDeclaration+ DEDENT
    ;

wireDeclaration
    :   annotation EOL
    |   SWIRE identifierUsage EOL syncWireParameters?
    |   AWIRE identifierUsage EOL asyncWireParameters?
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

callParameter
    :   CALL EQ parameterValue EOL
    ;

formatParameter
    :   FORMAT EQ parameterValue EOL
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
