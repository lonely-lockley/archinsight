// Generated from /Users/lonely-lockley/workspace/java/archinsight/insight-lang/src/main/antlr/InsightLexer.g4 by ANTLR 4.9.2

package com.github.lonelylockley.insight.lang;

import org.antlr.v4.runtime.Lexer;
import org.antlr.v4.runtime.CharStream;
import org.antlr.v4.runtime.Token;
import org.antlr.v4.runtime.TokenStream;
import org.antlr.v4.runtime.*;
import org.antlr.v4.runtime.atn.*;
import org.antlr.v4.runtime.dfa.DFA;
import org.antlr.v4.runtime.misc.*;

@SuppressWarnings({"all", "warnings", "unchecked", "unused", "cast"})
public class InsightLexer extends Lexer {
	static { RuntimeMetaData.checkVersion("4.9.2", RuntimeMetaData.VERSION); }

	protected static final DFA[] _decisionToDFA;
	protected static final PredictionContextCache _sharedContextCache =
		new PredictionContextCache();
	public static final int
		CONTEXT=1, CONTAINER=2, SYSTEM=3, EXTERNAL=4, PERSON=5, NAME=6, DESCRIPTION=7, 
		TECHNOLOGY=8, SERVICE=9, STORAGE=10, MODULE=11, CONTAINS=12, COMMA=13, 
		EQ=14, LINKS=15, IDENTIFIER=16, INDENT=17, EOL=18, WHITESPACE=19, COMMENT=20, 
		TEXT=21, WHITESPACE2=22, PROJECTNAME=23, WHITESPACE3=24;
	public static final int
		VALUE_MODE=1, NAMESPACE=2;
	public static String[] channelNames = {
		"DEFAULT_TOKEN_CHANNEL", "HIDDEN"
	};

	public static String[] modeNames = {
		"DEFAULT_MODE", "VALUE_MODE", "NAMESPACE"
	};

	private static String[] makeRuleNames() {
		return new String[] {
			"CONTEXT", "CONTAINER", "SYSTEM", "EXTERNAL", "PERSON", "NAME", "DESCRIPTION", 
			"TECHNOLOGY", "SERVICE", "STORAGE", "MODULE", "CONTAINS", "LowerLetter", 
			"Letter", "Digit", "NL", "WS", "COMMA", "EQ", "LINKS", "IDENTIFIER", 
			"INDENT", "EOL", "WHITESPACE", "COMMENT", "TEXT", "WHITESPACE2", "PROJECTNAME", 
			"WHITESPACE3"
		};
	}
	public static final String[] ruleNames = makeRuleNames();

	private static String[] makeLiteralNames() {
		return new String[] {
			null, "'context'", "'container'", null, null, null, "'name'", null, null, 
			null, null, null, null, "','", "'='"
		};
	}
	private static final String[] _LITERAL_NAMES = makeLiteralNames();
	private static String[] makeSymbolicNames() {
		return new String[] {
			null, "CONTEXT", "CONTAINER", "SYSTEM", "EXTERNAL", "PERSON", "NAME", 
			"DESCRIPTION", "TECHNOLOGY", "SERVICE", "STORAGE", "MODULE", "CONTAINS", 
			"COMMA", "EQ", "LINKS", "IDENTIFIER", "INDENT", "EOL", "WHITESPACE", 
			"COMMENT", "TEXT", "WHITESPACE2", "PROJECTNAME", "WHITESPACE3"
		};
	}
	private static final String[] _SYMBOLIC_NAMES = makeSymbolicNames();
	public static final Vocabulary VOCABULARY = new VocabularyImpl(_LITERAL_NAMES, _SYMBOLIC_NAMES);

	/**
	 * @deprecated Use {@link #VOCABULARY} instead.
	 */
	@Deprecated
	public static final String[] tokenNames;
	static {
		tokenNames = new String[_SYMBOLIC_NAMES.length];
		for (int i = 0; i < tokenNames.length; i++) {
			tokenNames[i] = VOCABULARY.getLiteralName(i);
			if (tokenNames[i] == null) {
				tokenNames[i] = VOCABULARY.getSymbolicName(i);
			}

			if (tokenNames[i] == null) {
				tokenNames[i] = "<INVALID>";
			}
		}
	}

	@Override
	@Deprecated
	public String[] getTokenNames() {
		return tokenNames;
	}

	@Override

	public Vocabulary getVocabulary() {
		return VOCABULARY;
	}


	public InsightLexer(CharStream input) {
		super(input);
		_interp = new LexerATNSimulator(this,_ATN,_decisionToDFA,_sharedContextCache);
	}

	@Override
	public String getGrammarFileName() { return "InsightLexer.g4"; }

	@Override
	public String[] getRuleNames() { return ruleNames; }

	@Override
	public String getSerializedATN() { return _serializedATN; }

	@Override
	public String[] getChannelNames() { return channelNames; }

	@Override
	public String[] getModeNames() { return modeNames; }

	@Override
	public ATN getATN() { return _ATN; }

	public static final String _serializedATN =
		"\3\u608b\ua72a\u8133\ub9ed\u417c\u3be7\u7786\u5964\2\32\u013f\b\1\b\1"+
		"\b\1\4\2\t\2\4\3\t\3\4\4\t\4\4\5\t\5\4\6\t\6\4\7\t\7\4\b\t\b\4\t\t\t\4"+
		"\n\t\n\4\13\t\13\4\f\t\f\4\r\t\r\4\16\t\16\4\17\t\17\4\20\t\20\4\21\t"+
		"\21\4\22\t\22\4\23\t\23\4\24\t\24\4\25\t\25\4\26\t\26\4\27\t\27\4\30\t"+
		"\30\4\31\t\31\4\32\t\32\4\33\t\33\4\34\t\34\4\35\t\35\4\36\t\36\3\2\3"+
		"\2\3\2\3\2\3\2\3\2\3\2\3\2\3\2\3\2\3\3\3\3\3\3\3\3\3\3\3\3\3\3\3\3\3\3"+
		"\3\3\3\3\3\3\3\4\3\4\3\4\3\4\3\4\3\4\3\4\3\4\3\4\5\4_\n\4\3\5\3\5\3\5"+
		"\3\5\3\5\3\5\3\5\3\5\3\5\3\5\3\5\5\5l\n\5\3\6\3\6\3\6\3\6\3\6\3\6\3\6"+
		"\3\6\3\6\3\6\5\6x\n\6\3\7\3\7\3\7\3\7\3\7\3\b\3\b\3\b\3\b\3\b\3\b\3\b"+
		"\3\b\3\b\3\b\3\b\3\b\3\b\3\b\3\b\5\b\u008e\n\b\3\t\3\t\3\t\3\t\3\t\3\t"+
		"\3\t\3\t\3\t\3\t\3\t\3\t\3\t\3\t\5\t\u009e\n\t\3\n\3\n\3\n\3\n\3\n\3\n"+
		"\3\n\3\n\3\13\3\13\3\13\3\13\3\13\3\13\3\13\3\13\3\f\3\f\3\f\3\f\3\f\3"+
		"\f\3\f\3\r\3\r\3\r\3\r\3\r\3\r\3\r\3\r\3\r\3\16\3\16\3\17\3\17\3\20\3"+
		"\20\3\21\5\21\u00c7\n\21\3\21\3\21\6\21\u00cb\n\21\r\21\16\21\u00cc\3"+
		"\22\3\22\3\23\3\23\3\24\3\24\3\24\3\24\3\25\3\25\3\25\3\25\5\25\u00db"+
		"\n\25\3\26\3\26\3\26\3\26\7\26\u00e1\n\26\f\26\16\26\u00e4\13\26\3\27"+
		"\3\27\3\27\3\27\3\27\5\27\u00eb\n\27\3\30\6\30\u00ee\n\30\r\30\16\30\u00ef"+
		"\5\30\u00f2\n\30\3\30\3\30\3\31\3\31\5\31\u00f8\n\31\3\31\3\31\3\32\3"+
		"\32\7\32\u00fe\n\32\f\32\16\32\u0101\13\32\3\32\3\32\5\32\u0105\n\32\3"+
		"\32\3\32\3\33\7\33\u010a\n\33\f\33\16\33\u010d\13\33\3\33\7\33\u0110\n"+
		"\33\f\33\16\33\u0113\13\33\3\33\3\33\3\33\3\33\7\33\u0119\n\33\f\33\16"+
		"\33\u011c\13\33\7\33\u011e\n\33\f\33\16\33\u0121\13\33\3\33\3\33\5\33"+
		"\u0125\n\33\3\33\3\33\3\34\3\34\5\34\u012b\n\34\3\34\3\34\3\35\3\35\3"+
		"\35\3\35\7\35\u0133\n\35\f\35\16\35\u0136\13\35\3\35\3\35\3\36\3\36\5"+
		"\36\u013c\n\36\3\36\3\36\5\u00ff\u010b\u011a\2\37\5\3\7\4\t\5\13\6\r\7"+
		"\17\b\21\t\23\n\25\13\27\f\31\r\33\16\35\2\37\2!\2#\2%\2\'\17)\20+\21"+
		"-\22/\23\61\24\63\25\65\26\67\279\30;\31=\32\5\2\3\4\4\4\2C\\c|\5\2\13"+
		"\13\16\16\"\"\2\u0153\2\5\3\2\2\2\2\7\3\2\2\2\2\t\3\2\2\2\2\13\3\2\2\2"+
		"\2\r\3\2\2\2\2\17\3\2\2\2\2\21\3\2\2\2\2\23\3\2\2\2\2\25\3\2\2\2\2\27"+
		"\3\2\2\2\2\31\3\2\2\2\2\33\3\2\2\2\2\'\3\2\2\2\2)\3\2\2\2\2+\3\2\2\2\2"+
		"-\3\2\2\2\2/\3\2\2\2\2\61\3\2\2\2\2\63\3\2\2\2\2\65\3\2\2\2\3\67\3\2\2"+
		"\2\39\3\2\2\2\4;\3\2\2\2\4=\3\2\2\2\5?\3\2\2\2\7I\3\2\2\2\t^\3\2\2\2\13"+
		"k\3\2\2\2\rw\3\2\2\2\17y\3\2\2\2\21\u008d\3\2\2\2\23\u009d\3\2\2\2\25"+
		"\u009f\3\2\2\2\27\u00a7\3\2\2\2\31\u00af\3\2\2\2\33\u00b6\3\2\2\2\35\u00bf"+
		"\3\2\2\2\37\u00c1\3\2\2\2!\u00c3\3\2\2\2#\u00ca\3\2\2\2%\u00ce\3\2\2\2"+
		"\'\u00d0\3\2\2\2)\u00d2\3\2\2\2+\u00da\3\2\2\2-\u00dc\3\2\2\2/\u00ea\3"+
		"\2\2\2\61\u00f1\3\2\2\2\63\u00f7\3\2\2\2\65\u00fb\3\2\2\2\67\u010b\3\2"+
		"\2\29\u012a\3\2\2\2;\u012e\3\2\2\2=\u013b\3\2\2\2?@\7e\2\2@A\7q\2\2AB"+
		"\7p\2\2BC\7v\2\2CD\7g\2\2DE\7z\2\2EF\7v\2\2FG\3\2\2\2GH\b\2\2\2H\6\3\2"+
		"\2\2IJ\7e\2\2JK\7q\2\2KL\7p\2\2LM\7v\2\2MN\7c\2\2NO\7k\2\2OP\7p\2\2PQ"+
		"\7g\2\2QR\7t\2\2RS\3\2\2\2ST\b\3\2\2T\b\3\2\2\2UV\7u\2\2VW\7{\2\2WX\7"+
		"u\2\2XY\7v\2\2YZ\7g\2\2Z_\7o\2\2[\\\7u\2\2\\]\7{\2\2]_\7u\2\2^U\3\2\2"+
		"\2^[\3\2\2\2_\n\3\2\2\2`a\7g\2\2ab\7z\2\2bc\7v\2\2cd\7g\2\2de\7t\2\2e"+
		"f\7p\2\2fg\7c\2\2gl\7n\2\2hi\7g\2\2ij\7z\2\2jl\7v\2\2k`\3\2\2\2kh\3\2"+
		"\2\2l\f\3\2\2\2mn\7r\2\2no\7g\2\2op\7t\2\2pq\7u\2\2qr\7q\2\2rx\7p\2\2"+
		"st\7w\2\2tu\7u\2\2uv\7g\2\2vx\7t\2\2wm\3\2\2\2ws\3\2\2\2x\16\3\2\2\2y"+
		"z\7p\2\2z{\7c\2\2{|\7o\2\2|}\7g\2\2}\20\3\2\2\2~\177\7f\2\2\177\u0080"+
		"\7g\2\2\u0080\u0081\7u\2\2\u0081\u0082\7e\2\2\u0082\u0083\7t\2\2\u0083"+
		"\u0084\7k\2\2\u0084\u0085\7r\2\2\u0085\u0086\7v\2\2\u0086\u0087\7k\2\2"+
		"\u0087\u0088\7q\2\2\u0088\u008e\7p\2\2\u0089\u008a\7f\2\2\u008a\u008b"+
		"\7g\2\2\u008b\u008c\7u\2\2\u008c\u008e\7e\2\2\u008d~\3\2\2\2\u008d\u0089"+
		"\3\2\2\2\u008e\22\3\2\2\2\u008f\u0090\7v\2\2\u0090\u0091\7g\2\2\u0091"+
		"\u0092\7e\2\2\u0092\u0093\7j\2\2\u0093\u0094\7p\2\2\u0094\u0095\7q\2\2"+
		"\u0095\u0096\7n\2\2\u0096\u0097\7q\2\2\u0097\u0098\7i\2\2\u0098\u009e"+
		"\7{\2\2\u0099\u009a\7v\2\2\u009a\u009b\7g\2\2\u009b\u009c\7e\2\2\u009c"+
		"\u009e\7j\2\2\u009d\u008f\3\2\2\2\u009d\u0099\3\2\2\2\u009e\24\3\2\2\2"+
		"\u009f\u00a0\7u\2\2\u00a0\u00a1\7g\2\2\u00a1\u00a2\7t\2\2\u00a2\u00a3"+
		"\7x\2\2\u00a3\u00a4\7k\2\2\u00a4\u00a5\7e\2\2\u00a5\u00a6\7g\2\2\u00a6"+
		"\26\3\2\2\2\u00a7\u00a8\7u\2\2\u00a8\u00a9\7v\2\2\u00a9\u00aa\7q\2\2\u00aa"+
		"\u00ab\7t\2\2\u00ab\u00ac\7c\2\2\u00ac\u00ad\7i\2\2\u00ad\u00ae\7g\2\2"+
		"\u00ae\30\3\2\2\2\u00af\u00b0\7o\2\2\u00b0\u00b1\7q\2\2\u00b1\u00b2\7"+
		"f\2\2\u00b2\u00b3\7w\2\2\u00b3\u00b4\7n\2\2\u00b4\u00b5\7g\2\2\u00b5\32"+
		"\3\2\2\2\u00b6\u00b7\7e\2\2\u00b7\u00b8\7q\2\2\u00b8\u00b9\7p\2\2\u00b9"+
		"\u00ba\7v\2\2\u00ba\u00bb\7c\2\2\u00bb\u00bc\7k\2\2\u00bc\u00bd\7p\2\2"+
		"\u00bd\u00be\7u\2\2\u00be\34\3\2\2\2\u00bf\u00c0\4c|\2\u00c0\36\3\2\2"+
		"\2\u00c1\u00c2\t\2\2\2\u00c2 \3\2\2\2\u00c3\u00c4\4\62;\2\u00c4\"\3\2"+
		"\2\2\u00c5\u00c7\7\17\2\2\u00c6\u00c5\3\2\2\2\u00c6\u00c7\3\2\2\2\u00c7"+
		"\u00c8\3\2\2\2\u00c8\u00cb\7\f\2\2\u00c9\u00cb\7\17\2\2\u00ca\u00c6\3"+
		"\2\2\2\u00ca\u00c9\3\2\2\2\u00cb\u00cc\3\2\2\2\u00cc\u00ca\3\2\2\2\u00cc"+
		"\u00cd\3\2\2\2\u00cd$\3\2\2\2\u00ce\u00cf\t\3\2\2\u00cf&\3\2\2\2\u00d0"+
		"\u00d1\7.\2\2\u00d1(\3\2\2\2\u00d2\u00d3\7?\2\2\u00d3\u00d4\3\2\2\2\u00d4"+
		"\u00d5\b\24\3\2\u00d5*\3\2\2\2\u00d6\u00d7\7/\2\2\u00d7\u00db\7@\2\2\u00d8"+
		"\u00d9\7\u0080\2\2\u00d9\u00db\7@\2\2\u00da\u00d6\3\2\2\2\u00da\u00d8"+
		"\3\2\2\2\u00db,\3\2\2\2\u00dc\u00e2\5\35\16\2\u00dd\u00e1\5\37\17\2\u00de"+
		"\u00e1\5!\20\2\u00df\u00e1\7a\2\2\u00e0\u00dd\3\2\2\2\u00e0\u00de\3\2"+
		"\2\2\u00e0\u00df\3\2\2\2\u00e1\u00e4\3\2\2\2\u00e2\u00e0\3\2\2\2\u00e2"+
		"\u00e3\3\2\2\2\u00e3.\3\2\2\2\u00e4\u00e2\3\2\2\2\u00e5\u00e6\7\"\2\2"+
		"\u00e6\u00e7\7\"\2\2\u00e7\u00e8\7\"\2\2\u00e8\u00eb\7\"\2\2\u00e9\u00eb"+
		"\7\13\2\2\u00ea\u00e5\3\2\2\2\u00ea\u00e9\3\2\2\2\u00eb\60\3\2\2\2\u00ec"+
		"\u00ee\5%\22\2\u00ed\u00ec\3\2\2\2\u00ee\u00ef\3\2\2\2\u00ef\u00ed\3\2"+
		"\2\2\u00ef\u00f0\3\2\2\2\u00f0\u00f2\3\2\2\2\u00f1\u00ed\3\2\2\2\u00f1"+
		"\u00f2\3\2\2\2\u00f2\u00f3\3\2\2\2\u00f3\u00f4\5#\21\2\u00f4\62\3\2\2"+
		"\2\u00f5\u00f8\5#\21\2\u00f6\u00f8\5%\22\2\u00f7\u00f5\3\2\2\2\u00f7\u00f6"+
		"\3\2\2\2\u00f8\u00f9\3\2\2\2\u00f9\u00fa\b\31\4\2\u00fa\64\3\2\2\2\u00fb"+
		"\u00ff\7%\2\2\u00fc\u00fe\13\2\2\2\u00fd\u00fc\3\2\2\2\u00fe\u0101\3\2"+
		"\2\2\u00ff\u0100\3\2\2\2\u00ff\u00fd\3\2\2\2\u0100\u0104\3\2\2\2\u0101"+
		"\u00ff\3\2\2\2\u0102\u0105\5#\21\2\u0103\u0105\7\2\2\3\u0104\u0102\3\2"+
		"\2\2\u0104\u0103\3\2\2\2\u0105\u0106\3\2\2\2\u0106\u0107\b\32\4\2\u0107"+
		"\66\3\2\2\2\u0108\u010a\13\2\2\2\u0109\u0108\3\2\2\2\u010a\u010d\3\2\2"+
		"\2\u010b\u010c\3\2\2\2\u010b\u0109\3\2\2\2\u010c\u011f\3\2\2\2\u010d\u010b"+
		"\3\2\2\2\u010e\u0110\5%\22\2\u010f\u010e\3\2\2\2\u0110\u0113\3\2\2\2\u0111"+
		"\u010f\3\2\2\2\u0111\u0112\3\2\2\2\u0112\u0114\3\2\2\2\u0113\u0111\3\2"+
		"\2\2\u0114\u0115\5#\21\2\u0115\u0116\5/\27\2\u0116\u011a\5/\27\2\u0117"+
		"\u0119\13\2\2\2\u0118\u0117\3\2\2\2\u0119\u011c\3\2\2\2\u011a\u011b\3"+
		"\2\2\2\u011a\u0118\3\2\2\2\u011b\u011e\3\2\2\2\u011c\u011a\3\2\2\2\u011d"+
		"\u0111\3\2\2\2\u011e\u0121\3\2\2\2\u011f\u011d\3\2\2\2\u011f\u0120\3\2"+
		"\2\2\u0120\u0124\3\2\2\2\u0121\u011f\3\2\2\2\u0122\u0125\5\61\30\2\u0123"+
		"\u0125\7\2\2\3\u0124\u0122\3\2\2\2\u0124\u0123\3\2\2\2\u0125\u0126\3\2"+
		"\2\2\u0126\u0127\b\33\5\2\u01278\3\2\2\2\u0128\u012b\5#\21\2\u0129\u012b"+
		"\5%\22\2\u012a\u0128\3\2\2\2\u012a\u0129\3\2\2\2\u012b\u012c\3\2\2\2\u012c"+
		"\u012d\b\34\4\2\u012d:\3\2\2\2\u012e\u0134\5\35\16\2\u012f\u0133\5\35"+
		"\16\2\u0130\u0133\5!\20\2\u0131\u0133\7a\2\2\u0132\u012f\3\2\2\2\u0132"+
		"\u0130\3\2\2\2\u0132\u0131\3\2\2\2\u0133\u0136\3\2\2\2\u0134\u0132\3\2"+
		"\2\2\u0134\u0135\3\2\2\2\u0135\u0137\3\2\2\2\u0136\u0134\3\2\2\2\u0137"+
		"\u0138\b\35\5\2\u0138<\3\2\2\2\u0139\u013c\5#\21\2\u013a\u013c\5%\22\2"+
		"\u013b\u0139\3\2\2\2\u013b\u013a\3\2\2\2\u013c\u013d\3\2\2\2\u013d\u013e"+
		"\b\36\4\2\u013e>\3\2\2\2\37\2\3\4^kw\u008d\u009d\u00c6\u00ca\u00cc\u00da"+
		"\u00e0\u00e2\u00ea\u00ef\u00f1\u00f7\u00ff\u0104\u010b\u0111\u011a\u011f"+
		"\u0124\u012a\u0132\u0134\u013b\6\7\4\2\7\3\2\b\2\2\6\2\2";
	public static final ATN _ATN =
		new ATNDeserializer().deserialize(_serializedATN.toCharArray());
	static {
		_decisionToDFA = new DFA[_ATN.getNumberOfDecisions()];
		for (int i = 0; i < _ATN.getNumberOfDecisions(); i++) {
			_decisionToDFA[i] = new DFA(_ATN.getDecisionState(i), i);
		}
	}
}