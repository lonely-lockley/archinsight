import { InsightError } from './InsightErrorListener';
import { parseAndGetSyntaxErrors } from './parser';

class InsightLanguageService {
  validate(code: string): InsightError[] {
    return parseAndGetSyntaxErrors(code);
  }

  format(code: string): string {
    return code;
  }
}

export default InsightLanguageService;
