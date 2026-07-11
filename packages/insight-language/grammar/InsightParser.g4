parser grammar InsightParser;

options {
    tokenVocab = InsightLexer;
}

insight
    : trivia* (definitionFile | architectureFile)? EOF
    ;

definitionFile
    : declaration (declaration | trivia)*
    ;

architectureFile
    : contextDeclaration architectureTopLevelItem*
    ;

architectureTopLevelItem
    : namedImportDeclaration
    | annotatedObjectDeclaration
    | objectExtension
    | trivia
    ;

namedImportDeclaration
    : IMPORT identifierReference FROM CONTEXT contextReference (AS importAlias)? EOL
    ;

contextDeclaration
    : CONTEXT contextDeclarationName note? EOL objectBody?
    ;

annotatedObjectDeclaration
    : annotation* objectDeclaration
    ;

objectDeclaration
    : namedPrefixOperatorInvocation? elementConstructor identifierDeclaration note? EOL objectBody?
    ;

namedPrefixOperatorInvocation
    : operatorIdentifier
    ;

objectBody
    : INDENT architectureBodyItem* DEDENT
    ;

architectureBodyItem
    : assignment
    | namedList
    | annotatedObjectDeclaration
    | objectExtension
    | annotatedOperatorInvocation
    | trivia
    ;

objectExtension
    : EXTEND extensionConstructor extensionTargetReference note? EOL objectBody?
    ;

namedList
    : listName COLON EOL
      INDENT listBodyItem* DEDENT
    ;

listBodyItem
    : architectureBodyItem
    | listValue
    ;

listValue
    : identifierReference anonymousImportDeclaration? EOL
    ;

annotatedOperatorInvocation
    : annotation* operatorInvocation
    ;

operatorInvocation
    : operatorIdentifier identifierReference anonymousImportDeclaration? note? EOL objectBody?
    ;

anonymousImportDeclaration
    : FROM contextReference
    ;

annotation
    : annotationName annotationParameters? EOL
    ;

annotationName
    : ATTRIBUTE_ANNOTATION
    | PLANNED_ANNOTATION
    | DEPRECATED_ANNOTATION
    ;

annotationParameters
    : LPAREN ANNOTATION_VALUE? RPAREN
    ;

declaration
    : defineOperatorDeclaration
    | defineTypeDeclaration
    | defineEnumDeclaration
    | definePresentationDeclaration
    | extendTypeDeclaration
    | extendEnumDeclaration
    | extendPresentationDeclaration
    ;

defineOperatorDeclaration
    : DEFINE OPERATOR typeIdentifier OF typeReference EOL
      INDENT operatorBodyItem* anonymousListAttributeDeclaration? trivia* DEDENT
    ;

operatorBodyItem
    : operatorConstructorDeclaration
    | attributeDeclaration
    | implementationAssignment
    | projectDeclaration
    | commentLine
    | EOL
    ;

defineTypeDeclaration
    : DEFINE TYPE typeIdentifier (OF typeReference)? EOL
      (INDENT typeBodyItem* anonymousListAttributeDeclaration? projectDeclaration? trivia* DEDENT)?
    ;

typeBodyItem
    : typeConstructorDeclaration
    | attributeDeclaration
    | commentLine
    | EOL
    ;

defineEnumDeclaration
    : DEFINE ENUM OF typeReference EOL
      INDENT enumValueDeclaration* DEDENT
    ;

definePresentationDeclaration
    : DEFINE PRESENTATION presentationIdentifier EOL
      INDENT presentationBodyItem* DEDENT
    ;

presentationBodyItem
    : presentationAssignment
    | presentationSection
    | commentLine
    | EOL
    ;

presentationSection
    : identifier EOL
      INDENT (presentationAssignment | commentLine | EOL)* DEDENT
    ;

presentationAssignment
    : presentationPropertyIdentifier EQ textValue EOL
    ;

presentationPropertyIdentifier
    : TYPE_IDENTIFIER
    | IDENTIFIER
    | TEXT_TYPE
    | TYPE
    | OPERATOR
    | ENUM
    | CONTEXT
    | PROJECT
    | IMPLEMENTATION
    ;

implementationAssignment
    : IMPLEMENTATION EQ textValue EOL
    ;

enumValueDeclaration
    : identifier EOL
      (INDENT (assignment | commentLine | EOL)* DEDENT)?
    ;

extendTypeDeclaration
    : EXTEND TYPE typeIdentifier EOL
      INDENT extendTypeBodyItem* anonymousListAttributeDeclaration? trivia* DEDENT
    ;

extendTypeBodyItem
    : attributeDeclaration
    | commentLine
    | EOL
    ;

extendEnumDeclaration
    : EXTEND ENUM OF typeReference EOL
      INDENT enumValueDeclaration* DEDENT
    ;

extendPresentationDeclaration
    : EXTEND PRESENTATION presentationIdentifier EOL
      INDENT presentationBodyItem* DEDENT
    ;

operatorConstructorDeclaration
    : CONSTRUCTOR constructorIdentifier typeUnion? EOL
      INDENT ON typeUnion EOL
      (assignment | commentLine | EOL)*
      DEDENT
    ;

typeConstructorDeclaration
    : CONSTRUCTOR constructorName EOL
      (INDENT (assignment | commentLine | EOL)* DEDENT)?
    ;

constructorIdentifier
    : operatorIdentifier
    | CONTEXT
    ;

operatorIdentifier
    : OPERATOR_IDENTIFIER
    | identifier
    ;

constructorName
    : identifier
    | CONTEXT
    ;

attributeDeclaration
    : REQUIRED? typeReference identifier EOL
    ;

anonymousListAttributeDeclaration
    : LIST_TYPE OF typeReference ANONYMOUS_ATTRIBUTE EOL
    ;

projectDeclaration
    : PROJECT COLON EOL
      INDENT projectionRule* DEDENT
    ;

projectionRule
    : projectionTerm operatorIdentifier projectionTerm EOL
    ;

projectionTerm
    : projectionSlotDereference
    | projectionEndpoint
    | identifier
    ;

projectionSlotDereference
    : PROJECTION_SLOT FROM PROJECTION_OWNER identifier
    ;

projectionEndpoint
    : PROJECTION_FROM
    | PROJECTION_TO
    | PROJECTION_THIS
    ;

assignment
    : attributeName EQ textValue EOL
    ;

textValue
    : WRAP TEXT+ UNWRAP
    ;

typeUnion
    : typeReference (OR typeReference)*
    ;

typeReference
    : scalarType
    | LIST_TYPE (OF typeReference)?
    | typeIdentifier (OF typeReference)?
    ;

scalarType
    : TEXT_TYPE
    ;

typeIdentifier
    : TYPE_IDENTIFIER
    ;

presentationIdentifier
    : TYPE_IDENTIFIER
    ;

identifier
    : IDENTIFIER
    | PROJECT
    ;

contextDeclarationName
    : identifier
    ;

contextReference
    : identifier
    ;

elementConstructor
    : identifier
    ;

identifierDeclaration
    : identifier
    | ANONYMOUS_ATTRIBUTE
    ;

identifierReference
    : identifier
    ;

attributeName
    : identifier
    ;

listName
    : identifier
    ;

importAlias
    : identifier
    ;

extensionConstructor
    : constructorName
    ;

extensionTargetReference
    : identifier
    ;

commentLine
    : COMMENT EOL
    ;

note
    : COMMENT
    ;

trivia
    : commentLine
    | EOL
    ;
