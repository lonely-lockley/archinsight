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
    | environmentFile
    ;

environmentFile
    : environmentDeclaration architectureTopLevelItem*
    ;

architectureTopLevelItem
    : namedImportDeclaration
    | annotatedObjectDeclaration
    | objectExtension
    | trivia
    ;

namedImportDeclaration
    : IMPORT identifierReference FROM importScopeReference (AS importAlias)? EOL
    ;

importScopeReference
    : CONTEXT contextReference
    | ENVIRONMENT environmentReference
    ;

contextDeclaration
    : CONTEXT contextDeclarationName note? EOL objectBody?
    ;

environmentDeclaration
    : ENVIRONMENT environmentDeclarationName note? EOL objectBody?
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
    | relationInvocation
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
    | capabilityAssignment
    | commentLine
    | EOL
    ;

defineTypeDeclaration
    : DEFINE TYPE typeIdentifier (OF typeReference)? EOL
      (INDENT typeBodyItem* anonymousListAttributeDeclaration? trivia* DEDENT)?
    ;

typeBodyItem
    : typeConstructorDeclaration
    | attributeDeclaration
    | capabilityAssignment
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
    | TYPE
    | OPERATOR
    | ENUM
    | CONTEXT
    | ENVIRONMENT
    | PROJECTION
    | PROJECT
    | IMPLEMENTATION
    ;

implementationAssignment
    : IMPLEMENTATION EQ textValue EOL
    ;

capabilityAssignment
    : CAPABILITY EQ textValue EOL
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
    | ENVIRONMENT
    ;

operatorIdentifier
    : OPERATOR_IDENTIFIER
    | identifier
    ;

constructorName
    : identifier
    | CONTEXT
    | ENVIRONMENT
    ;

attributeDeclaration
    : REQUIRED? typeReference identifier EOL
      (INDENT capabilityAssignment+ DEDENT)?
    ;

anonymousListAttributeDeclaration
    : LIST_TYPE OF typeReference ANONYMOUS_ATTRIBUTE EOL
    ;

relationInvocation
    : relationTerm operatorIdentifier relationTerm EOL
      (INDENT (assignment | commentLine | EOL)* DEDENT)?
    ;

relationTerm
    : relationPlacement relationReference
    ;

relationPlacement
    : identifier
    ;

relationReference
    : relationSlotDereference
    | projectionEndpoint
    | identifier
    ;

relationSlotDereference
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
    : LIST_TYPE (OF typeReference)?
    | typeIdentifier (OF typeReference)?
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
    | PROJECTION
    ;

contextDeclarationName
    : identifier
    ;

environmentDeclarationName
    : identifier
    ;

contextReference
    : identifier
    ;

environmentReference
    : identifier
    ;

elementConstructor
    : identifier
    | ENVIRONMENT
    ;

identifierDeclaration
    : identifier
    | ANONYMOUS_ATTRIBUTE
    ;

identifierReference
    : identifier
    | ANONYMOUS_ATTRIBUTE
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
