import { Token } from 'antlr4ng';
import { languages } from 'monaco-editor';
import IState = languages.IState;

class LexerState implements IState {

    TEXT: number;

    private _wasText: boolean = false;
    private indentation: number = 0;

     constructor(TEXT: number) {
        this.TEXT = TEXT;
     }

     public wasText(): boolean {
         return this._wasText;
     }

     public setWasText() {
         this._wasText = true;
     }

     public resetWasText() {
         this._wasText = false;
     }

     public getIndentation(): number {
         return this.indentation;
     }

     public incIndentation() {
         this.indentation++;
     }

     public decIndentation() {
         this.indentation--;
     }

     public updateToken(tkn: Token) {
         if (tkn.type == this.TEXT) {
             this.setWasText();
         }
     }

     public clone(): IState {
         var res = new LexerState(this.TEXT);
         res._wasText = this._wasText;
         res.indentation = this.indentation;
         return res;
     }

     equals(that: IState): boolean {
         if (that instanceof LexerState) {
             return this._wasText === that._wasText && this.indentation === that.indentation;
         }
         else {
             return false;
         }
     }

}

export default LexerState;