// import { InsightContext } from 'insight/build/InsightParser';
import { InsightError } from './InsightErrorListener';
import { parseAndGetSyntaxErrors } from './parser';

class InsightLanguageService {
  validate(code: string): InsightError[] {
    return parseAndGetSyntaxErrors(code);
    // const syntaxErrors: InsightError[] = parseAndGetSyntaxErrors(code);
    // const ast: InsightContext = parseAndGetASTRoot(code);
    // return syntaxErrors.concat(checkSemanticRules(ast));
  }

  format(code: string): string {
    /** Implements format here **/
    return code;
  }
}

// const checkSemanticRules = (ast: InsightContext): InsightError[] => {
//   const errors: InsightError[] = [];
//   /** Push additional errors' validation here **/
//   return errors;
// };

export default InsightLanguageService;
