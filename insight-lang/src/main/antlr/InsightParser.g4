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
    :   boundedContextDeclaration EOL statement*
    ;

commentStatement
    :   COMMENT EOL
    ;

noteStatement
    :   COMMENT
    ;

boundedContextDeclaration
    :   CONTEXT identifierDeclaration
    ;

statement
    :   contextStatement
    |   annotationStatement EOL
    |   namedImportStatement EOL
    |   commentStatement
    |   EOL
    ;

namedImportStatement
    :   IMPORT identifierUsage FROM CONTEXT identifierUsage (AS identifierDeclaration)?
    ;

anonymousImportDeclaration
    :   FROM identifierUsage
    ;

contextStatement
    :   systemDeclaration
    |   actorDeclaration
    ;

contextDefinition
    :   INDENT nameParameter descriptionParameter? linksDeclaration? containerStatement* DEDENT
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
    :   INDENT nameParameter technologyParameter? descriptionParameter? linksDeclaration? DEDENT
    ;

containerParameters
    :   INDENT (nameParameter | descriptionParameter | technologyParameter)+ linksDeclaration? DEDENT
    ;

syncWireParameters
    :   INDENT (modelParameter | descriptionParameter | technologyParameter | callParameter)+ DEDENT
    ;

asyncWireParameters
    :   INDENT (modelParameter | descriptionParameter | technologyParameter | viaParameter)+ DEDENT
    ;

linksDeclaration
    :   LINKS COLON EOL wireList
    ;

wireList
    :   INDENT wireDeclaration+ DEDENT
    ;

wireDeclaration
    :   syncWireStatement
    |   asyncWireStatement
    ;

syncWireStatement
    :   annotationStatement? SWIRE identifierUsage anonymousImportDeclaration? noteStatement? EOL syncWireParameters?
    ;

asyncWireStatement
    :   annotationStatement? AWIRE identifierUsage anonymousImportDeclaration? noteStatement? EOL asyncWireParameters?
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

modelParameter
    :   MODEL EQ parameterValue EOL
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
