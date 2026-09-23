parser grammar AiqParser;

options { tokenVocab=AiqLexer; }

query
    : graphQuery EOF
    | tableQuery EOF
    ;

graphQuery
    : matchClause+ groupByClause? RETURN returnList
    ;

tableQuery
    : tableInputClause+ RETURN TABLE projection orderByClause? skipClause? limitClause?
    ;

tableInputClause
    : matchClause
    | unwindClause
    | withClause
    ;

matchClause
    : OPTIONAL? MATCH ROLLUP? (pathAssignment | pathPattern | pattern) (WHERE expression)?
    ;

pathAssignment
    : identifier EQUALS (SHORTEST_PATH LPAREN pathPattern RPAREN | pathPattern)
    ;

pathPattern
    : nodePattern
      (
        MINUS pathRelationshipPattern (ARROW_RIGHT | MINUS) nodePattern
        | ARROW_LEFT pathRelationshipPattern MINUS nodePattern
      )
    ;

pathRelationshipPattern
    : LBRACKET
      (
        identifier (COLON identifier)?
        | COLON identifier
      )?
      STAR pathRange? relationshipProperties?
      RBRACKET
    ;

pathRange
    : NUMBER (DOT DOT NUMBER?)?
    | DOT DOT NUMBER?
    ;

unwindClause
    : UNWIND valueExpression AS identifier
    ;

withClause
    : WITH projection (WHERE expression)? orderByClause? skipClause? limitClause?
    ;

projection
    : DISTINCT? projectionItem (COMMA projectionItem)*
    ;

projectionItem
    : valueExpression (AS identifier)?
    ;

orderByClause
    : ORDER BY orderItem (COMMA orderItem)*
    ;

orderItem
    : identifier (ASC | DESC)?
    ;

skipClause
    : SKIP_KW paginationValue
    ;

limitClause
    : LIMIT paginationValue
    ;

paginationValue
    : NUMBER
    | VARIABLE
    ;

groupByClause
    : GROUP BY valueExpression
    ;

pattern
    : nodePattern
      (
        MINUS relationshipPattern (ARROW_RIGHT | MINUS) nodePattern
        | ARROW_LEFT relationshipPattern MINUS nodePattern
      )?
    ;

nodePattern
    : LPAREN identifier (COLON identifier)? nodeProperties? RPAREN
    ;

relationshipPattern
    : LBRACKET
      (
        identifier (COLON identifier)?
        | COLON identifier
      )?
      relationshipProperties?
      RBRACKET
    ;

nodeProperties
    : LBRACE (nodeProperty (COMMA nodeProperty)*)? RBRACE
    ;

nodeProperty
    : identifier COLON queryValue
    ;

relationshipProperties
    : LBRACE (relationshipProperty (COMMA relationshipProperty)*)? RBRACE
    ;

relationshipProperty
    : identifier (COLON queryValue)?
    ;

expression
    : orExpression
    ;

orExpression
    : andExpression (OR andExpression)*
    ;

andExpression
    : notExpression (AND notExpression)*
    ;

notExpression
    : NOT notExpression
    | primaryExpression
    ;

primaryExpression
    : LPAREN expression RPAREN
    | comparison
    ;

comparison
    : valueExpression
      (
        IS NOT? (NULL | identifier)
        | IN valueExpression
        | comparisonOperator valueExpression
      )?
    ;

comparisonOperator
    : EQUALS
    | NOT_EQUALS
    | LESS_THAN
    | LESS_THAN_OR_EQUAL
    | GREATER_THAN
    | GREATER_THAN_OR_EQUAL
    | CONTAINS
    ;

valueExpression
    : valueAtom (DOT identifier)*
    ;

valueAtom
    : listExpression
    | functionCall
    | identifier
    | VARIABLE
    | STRING
    | NUMBER
    | TRUE
    | FALSE
    | NULL
    ;

functionCall
    : identifier LPAREN
      (
        STAR
        | DISTINCT? valueExpression (COMMA valueExpression)*
        | identifier IN valueExpression (WHERE expression)?
      )?
      RPAREN
    ;

listExpression
    : LBRACKET
      (
        identifier IN valueExpression (WHERE expression)? PIPE valueExpression
        | valueExpression (COMMA valueExpression)*
      )?
      RBRACKET
    ;

queryValue
    : identifier
    | VARIABLE
    | STRING
    | NUMBER
    | TRUE
    | FALSE
    | NULL
    ;

returnList
    : identifier (COMMA identifier)*
    ;

// AIQ keywords are contextual. Existing queries may use them as aliases,
// labels, property names, and unquoted legacy literal values.
identifier
    : IDENTIFIER
    | MATCH | OPTIONAL | ROLLUP | WHERE | GROUP | BY | RETURN
    | AND | OR | NOT | IS | IN | CONTAINS | TABLE | WITH | UNWIND | AS
    | DISTINCT | ORDER | SKIP_KW | LIMIT | ASC | DESC | TRUE | FALSE | NULL
    | SHORTEST_PATH
    ;
