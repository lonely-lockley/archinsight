parser grammar InsightParser;

@header {
package com.github.lonelylockley.insight.lang;
}

options { tokenVocab = InsightLexer; }

/* This will be the entry point of our parser. */
insight
    :    ( CONTEXT namespace EOL (contextDefinitions+ | empty) EOF
         | CONTAINER namespace EOL (containerDefinitions+ | empty) EOF
         )
    ;

empty
    :    EOL?
    ;

namespace
    :    ruleStart PROJECTNAME ruleEnd
    ;

contextDefinitions
    :    ( ruleStart EXTERNAL? SYSTEM namedEntityDefinition ruleEnd
         | ruleStart PERSON namedEntityDefinition ruleEnd
         | ruleStart IDENTIFIER LINKS IDENTIFIER entityDefinition? ruleEnd EOL?
         | COMMENT
         )
    ;

containerDefinitions
    :    ( ruleStart EXTERNAL? SERVICE namedEntityDefinition ruleEnd
         | ruleStart EXTERNAL? STORAGE singleEntityDefinition ruleEnd
         | ruleStart IDENTIFIER LINKS IDENTIFIER entityDefinition? ruleEnd EOL?
         | ruleStart MODULE IDENTIFIER CONTAINS identifierList ruleEnd EOL?
         | COMMENT
         )
    ;

namedEntityDefinition
    :    ( IDENTIFIER COMMENT? EOL? nameParameter descriptionParameter? technologyParameter?
         | IDENTIFIER COMMENT? EOL? descriptionParameter? nameParameter technologyParameter?
         | IDENTIFIER COMMENT? EOL? descriptionParameter? technologyParameter? nameParameter
         | IDENTIFIER COMMENT? EOL? nameParameter technologyParameter? descriptionParameter?
         | IDENTIFIER COMMENT? EOL? technologyParameter? nameParameter descriptionParameter?
         | IDENTIFIER COMMENT? EOL? technologyParameter? descriptionParameter? nameParameter
         )
    ;

singleEntityDefinition
    :    IDENTIFIER COMMENT? EOL? (nameParameter | descriptionParameter | technologyParameter)+
    ;

entityDefinition
    :    IDENTIFIER? COMMENT? EOL? (nameParameter | descriptionParameter | technologyParameter)*
    ;

nameParameter
    :    INDENT NAME EQ value
    ;

descriptionParameter
    :    INDENT DESCRIPTION EQ value
    ;

technologyParameter
    :    INDENT TECHNOLOGY EQ value
    ;

value
    :    TEXT
    ;

identifierList
    :    (IDENTIFIER COMMA | IDENTIFIER EOL)+ (nameParameter)?
    ;

ruleStart
    :
    ;

ruleEnd
    :
    ;
