parser grammar InsightParser;

@header {
/* <package> */
package com.github.lonelylockley.insight.lang;
/* </package> */
}

options { tokenVocab = InsightLexer; }

/* This will be the entry point of our parser. */
insight
    :    levelDeclaration EOF
    ;

levelDeclaration
    :   ( contextDeclaration contextElementDeclaration*
        | containerDeclaration containerElementDeclaration*
        )
    ;

contextDeclaration
    :    CONTEXT IDENTIFIER EOL+
    ;

containerDeclaration
    :    CONTAINER IDENTIFIER EOL+
    ;

contextElementDeclaration
    :    ( systemDeclaration EOL*
         | actorDeclaration EOL*
         | boundaryForContextDeclaration EOL*
         | INDENT* commentDeclaration
         )
    ;

systemDeclaration
    :    annotationDeclaration? EXTERNAL? SYSTEM IDENTIFIER (commentDeclaration | EOL) systemParameters
    ;

systemParameters
    :    INDENT namedEntityParametersDeclaration connectionDeclaration? DEDENT
    ;

actorDeclaration
    :    annotationDeclaration? ACTOR IDENTIFIER (commentDeclaration | EOL) actorParameters
    ;

actorParameters
    :    INDENT namedEntityParametersDeclaration connectionDeclaration? DEDENT
    ;

boundaryForContextDeclaration
    :    BOUNDARY IDENTIFIER EOL+ boundaryContext
    ;

boundareForContainerDeclaration
    :    BOUNDARY IDENTIFIER EOL+ boundaryContainer
    ;

boundaryContext
    :    INDENT boundaryParameters? EOL+ contextElementDeclaration+ DEDENT
    ;

boundaryContainer
    :    INDENT boundaryParameters? EOL+ containerElementDeclaration+ DEDENT
    ;

boundaryParameters
    :    entityParametersDefinition
    ;

containerElementDeclaration
    :    ( serviceDeclaration EOL*
         | storageDeclaration EOL*
         | boundareForContainerDeclaration EOL*
         | INDENT* commentDeclaration
         )
    ;

serviceDeclaration
    :    annotationDeclaration? EXTERNAL? SERVICE IDENTIFIER (commentDeclaration | EOL) serviceParameters
    ;

serviceParameters
    :    INDENT namedEntityParametersDeclaration connectionDeclaration? DEDENT
    ;

storageDeclaration
    :    annotationDeclaration? EXTERNAL? STORAGE IDENTIFIER (commentDeclaration | EOL) storageParameters
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
    :    annotationDeclaration? WIRE IDENTIFIER EOL wireParameters? EOL*
    ;

wireParameters
    :    INDENT entityParametersDefinition DEDENT
    ;

annotationDeclaration
    :   ANNOTATION ANNOTATION_VALUE (commentDeclaration | EOL)
    ;

commentDeclaration
    :    COMMENT
    ;