parser grammar InsightParser;

@header {
/* <package> */
package com.github.lonelylockley.insight.lang;
/* </package> */
}

options { tokenVocab = InsightLexer; }

/* This will be the entry point of our parser. */
insight
    :    commentDeclaration? levelDeclaration? EOF
    ;

levelDeclaration
    :   ( contextDeclaration namedImportDeclaration* contextElementDeclaration*
        | containerDeclaration namedImportDeclaration* containerElementDeclaration*
        )
    ;

contextDeclaration
    :    CONTEXT IDENTIFIER EOL
    ;

containerDeclaration
    :    CONTAINER IDENTIFIER EOL
    ;

namedImportDeclaration
    :   IMPORT importElementDeclaration importAliasDeclaration? EOL?
    ;

importAliasDeclaration
    :   AS IDENTIFIER
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
    :   CONTEXT_ELEMENT_IMPORT? IDENTIFIER FROM importContextDeclaration
    ;

importContextDeclaration
    :   CONTEXT_IMPORT IDENTIFIER
    ;

importContainerElementDeclaration
    :   CONTAINER_ELEMENT_IMPORT? IDENTIFIER FROM importContainerDeclaration
    ;

importContainerDeclaration
    :   CONTAINER_IMPORT IDENTIFIER
    ;

contextElementDeclaration
    :    ( systemDeclaration EOL?
         | actorDeclaration EOL?
         | boundaryForContextDeclaration EOL?
         | commentDeclaration
         )
    ;

systemDeclaration
    :    annotationDeclaration* EXTERNAL? SYSTEM IDENTIFIER (noteDeclaration | EOL) systemParameters
    ;

systemParameters
    :    INDENT namedEntityParametersDeclaration connectionDeclaration? DEDENT
    ;

actorDeclaration
    :    annotationDeclaration* ACTOR IDENTIFIER (noteDeclaration | EOL) actorParameters
    ;

actorParameters
    :    INDENT namedEntityParametersDeclaration connectionDeclaration? DEDENT
    ;

boundaryForContextDeclaration
    :    BOUNDARY IDENTIFIER EOL boundaryContext
    ;

boundaryForContainerDeclaration
    :    BOUNDARY IDENTIFIER EOL boundaryContainer
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
    :    annotationDeclaration* EXTERNAL? SERVICE IDENTIFIER (noteDeclaration | EOL) serviceParameters
    ;

serviceParameters
    :    INDENT namedEntityParametersDeclaration connectionDeclaration? DEDENT
    ;

storageDeclaration
    :    annotationDeclaration* EXTERNAL? STORAGE IDENTIFIER (noteDeclaration | EOL) storageParameters
    ;

storageParameters
    :    INDENT singleEntityParametersDefinition connectionDeclaration? DEDENT
    ;

namedEntityParametersDeclaration
    :    ( nameParameter descriptionParameter? technologyParameter?
         | descriptionParameter? nameParameter technologyParameter?
         | descriptionParameter? technologyParameter? nameParameter
         | nameParameter technologyParameter? descriptionParameter?
         | technologyParameter? nameParameter descriptionParameter?
         | technologyParameter? descriptionParameter? nameParameter
         )
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
    :    annotationDeclaration? WIRE (anonymousImportDeclaration | IDENTIFIER) EOL? wireParameters? EOL?
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
    :    COMMENT
    ;

noteDeclaration
    :    COMMENT
    ;