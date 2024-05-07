parser grammar InsightParser;

@header {
/* <package> */
package com.github.lonelylockley.insight.lang;
/* </package> */
}

options { tokenVocab = InsightLexer; }

/* This will be the entry point of our parser. */
insight
    :    commentDeclaration* levelDeclaration? EOF
    ;

levelDeclaration
    :   ( contextDeclaration namedImportDeclaration* contextElementDeclaration*
        | containerDeclaration namedImportDeclaration* containerElementDeclaration*
        )
    ;

identifierDeclaration
    :    IDENTIFIER
    ;

identifierUsage
    :    IDENTIFIER
    ;

contextDeclaration
    :    CONTEXT identifierDeclaration EOL
    ;

containerDeclaration
    :    CONTAINER identifierDeclaration EOL
    ;

namedImportDeclaration
    :   commentDeclaration* IMPORT importElementDeclaration importAliasDeclaration? EOL?
    ;

importAliasDeclaration
    :   AS identifierDeclaration
    ;

anonymousImportDeclaration
    :   importElementDeclaration
    ;

importElementDeclaration
    :   ( importContextElementDeclaration
        | importContainerElementDeclaration
        )
    ;

importContextElementDeclaration
    :   CONTEXT_ELEMENT_IMPORT? identifierUsage FROM importContextDeclaration
    ;

importContextDeclaration
    :   CONTEXT_IMPORT identifierUsage
    ;

importContainerElementDeclaration
    :   CONTAINER_ELEMENT_IMPORT? identifierUsage FROM importContainerDeclaration
    ;

importContainerDeclaration
    :   CONTAINER_IMPORT identifierUsage
    ;

contextElementDeclaration
    :    ( systemDeclaration EOL?
         | actorDeclaration EOL?
         | boundaryForContextDeclaration EOL?
         | commentDeclaration
         )
    ;

systemDeclaration
    :    annotationDeclaration* EXTERNAL? SYSTEM identifierDeclaration (noteDeclaration | EOL) systemParameters
    ;

systemParameters
    :    INDENT singleEntityParametersDefinition connectionDeclaration? DEDENT
    ;

actorDeclaration
    :    annotationDeclaration* ACTOR identifierDeclaration (noteDeclaration | EOL) actorParameters
    ;

actorParameters
    :    INDENT singleEntityParametersDefinition connectionDeclaration? DEDENT
    ;

boundaryForContextDeclaration
    :    BOUNDARY identifierDeclaration EOL boundaryContext
    ;

boundaryForContainerDeclaration
    :    BOUNDARY identifierDeclaration EOL boundaryContainer
    ;

boundaryContext
    :    INDENT boundaryParameters? namedImportDeclaration* contextElementDeclaration+ DEDENT
    ;

boundaryContainer
    :    INDENT boundaryParameters? namedImportDeclaration* containerElementDeclaration+ DEDENT
    ;

boundaryParameters
    :    entityParametersDefinition
    ;

containerElementDeclaration
    :    ( serviceDeclaration EOL?
         | storageDeclaration EOL?
         | boundaryForContainerDeclaration EOL?
         | INDENT* commentDeclaration
         )
    ;

serviceDeclaration
    :    annotationDeclaration* EXTERNAL? SERVICE identifierDeclaration (noteDeclaration | EOL) serviceParameters
    ;

serviceParameters
    :    INDENT singleEntityParametersDefinition connectionDeclaration? DEDENT
    ;

storageDeclaration
    :    annotationDeclaration* EXTERNAL? STORAGE identifierDeclaration (noteDeclaration | EOL) storageParameters
    ;

storageParameters
    :    INDENT singleEntityParametersDefinition connectionDeclaration? DEDENT
    ;

singleEntityParametersDefinition
    :    ( nameParameter
         | descriptionParameter
         | technologyParameter
         )+
    ;

entityParametersDefinition
    :    ( nameParameter
         | descriptionParameter
         | technologyParameter
         )*
    ;

nameParameter
    :    NAME EQ parameterValue
    ;

descriptionParameter
    :    DESCRIPTION EQ parameterValue
    ;

technologyParameter
    :    TECHNOLOGY EQ parameterValue
    ;

parameterValue
    :    INDENT textLine+ DEDENT
    ;

textLine
    :    TEXT+ EOL?
    ;

connectionDeclaration
    :    LINKS COLON EOL wireList
    ;

wireList
    :    INDENT wireDeclaration+ DEDENT
    ;

wireDeclaration
    :    annotationDeclaration? WIRE (anonymousImportDeclaration | identifierUsage) EOL? wireParameters? EOL?
    ;

wireParameters
    :    INDENT entityParametersDefinition DEDENT
    ;

annotationDeclaration
    :   (attributeAnnotationDeclaration | plannedAnnotationDeclaration | deprecatedAnnotationDeclaration) (commentDeclaration | EOL)
    ;

attributeAnnotationDeclaration
    :   ATTRIBUTE ANNOTATION_VALUE
    ;

plannedAnnotationDeclaration
    :   PLANNED
    ;

deprecatedAnnotationDeclaration
    :   DEPRECATED
    ;

commentDeclaration
    :    COMMENT EOL?
    ;

noteDeclaration
    :    COMMENT EOL?
    ;