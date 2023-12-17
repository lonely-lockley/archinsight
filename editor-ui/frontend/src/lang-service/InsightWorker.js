import InsightLanguageService from "./LanguageService"

export class InsightWorker {
  constructor(ctx) {
    this._ctx = ctx
    this.languageService = new InsightLanguageService()
  }

  doValidation() {
    const code = this.getTextDocument()
    return Promise.resolve(this.languageService.validate(code))
  }

  format(code) {
    return Promise.resolve(this.languageService.format(code))
  }

  getTextDocument() {
    const model = this._ctx.getMirrorModels()[0] // When there are multiple files open, this will be an array
    return model.getValue()
  }
}