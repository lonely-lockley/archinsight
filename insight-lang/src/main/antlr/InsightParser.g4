parser grammar InsightParser;

@header {
/* <package> */
package com.github.lonelylockley.insight.lang;
/* </package> */
}

options { tokenVocab = InsightLexer; }

insight
    :   (commentStatement | EOL)* boundedContextStatement? EOF
    ;

boundedContextStatement
    :   boundedContextDeclaration softEOL statement*
    ;

softEOL
    : EOL | EOF
    ;

softDedent
    : DEDENT | EOF
    ;
commentStatement
    :   COMMENT softEOL
    ;

noteStatement
    :   COMMENT
    ;

boundedContextDeclaration
    :   CONTEXT identifierDeclaration
    ;

statement
    :   contextStatement
    |   annotationStatement
    |   namedImportStatement
    |   commentStatement
    |   EOL
    ;

namedImportStatement
    :   IMPORT identifierUsage FROM CONTEXT identifierUsage (AS identifierDeclaration)? softEOL
    ;

anonymousImportDeclaration
    :   FROM identifierUsage
    ;

contextStatement
    :   systemDeclaration | actorDeclaration
    ;

contextDefinition
    :   INDENT nameParameter technologyParameter? descriptionParameter? linksDeclaration? containerStatement* softDedent
    ;

containerStatement
    :   serviceDeclaration
    |   storageDeclaration
    |   commentStatement
    |   EOL
    ;

systemDeclaration
    :   annotationStatement? EXTERNAL? SYSTEM identifierDeclaration noteStatement? EOL contextDefinition
    ;

actorDeclaration
    :   annotationStatement? ACTOR identifierDeclaration noteStatement? EOL contextParameters
    ;

serviceDeclaration
    :   annotationStatement? SERVICE identifierDeclaration noteStatement? EOL contextParameters
    ;

storageDeclaration
    :   annotationStatement? STORAGE identifierDeclaration noteStatement? EOL containerParameters
    ;

contextParameters
    :   INDENT nameParameter technologyParameter? descriptionParameter? linksDeclaration? softDedent
    ;

containerParameters
    :   INDENT (nameParameter | descriptionParameter | technologyParameter)+ linksDeclaration? softDedent
    ;

syncWireParameters
    :   INDENT (modelParameter | descriptionParameter | technologyParameter | callParameter)+ softDedent
    ;

asyncWireParameters
    :   INDENT (modelParameter | descriptionParameter | technologyParameter | viaParameter)+ softDedent
    ;

linksDeclaration
    :   LINKS COLON EOL wireList
    ;

wireList
    :   INDENT wireDeclaration+ softDedent
    ;

wireDeclaration
    :   syncWireStatement
    |   asyncWireStatement
    ;

syncWireStatement
    :   commentStatement* annotationStatement? SWIRE identifierUsage anonymousImportDeclaration? noteStatement? softEOL syncWireParameters?
    ;

asyncWireStatement
    :   commentStatement* annotationStatement? AWIRE identifierUsage anonymousImportDeclaration? noteStatement? softEOL asyncWireParameters?
    ;

nameParameter
    :   commentStatement* NAME EQ parameterValue softEOL
    ;

descriptionParameter
    :   commentStatement* DESCRIPTION EQ parameterValue softEOL
    ;

technologyParameter
    :   commentStatement* TECHNOLOGY EQ parameterValue softEOL
    ;

viaParameter
    :   commentStatement* VIA EQ parameterValue softEOL
    ;

callParameter
    :   commentStatement* CALL EQ parameterValue softEOL
    ;

modelParameter
    :   commentStatement* MODEL EQ parameterValue softEOL
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

annotationStatement
    :   (attributeAnnotationDeclaration EOL
    |   plannedAnnotationDeclaration EOL
    |   deprecatedAnnotationDeclaration EOL)+
    ;

attributeAnnotationDeclaration
    :   ATTRIBUTE annotationValue
    ;

plannedAnnotationDeclaration
    :   PLANNED annotationValue?
    ;

deprecatedAnnotationDeclaration
    :   DEPRECATED annotationValue?
    ;

annotationValue
    :   LPAREN ANNOTATION_VALUE RPAREN
    ;
