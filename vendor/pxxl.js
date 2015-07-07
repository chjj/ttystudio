/**
 * pxxl.js - bdf compiler used in ttystudio
 * Copyright (C) 2011 by Remco Veldkamp
 * Modified by Christopher Jeffrey
 * https://github.com/remcoder/Pxxl.js
 * https://github.com/remcoder/Pxxl.js/blob/master/dist/pxxl.js
 *
 * Pxxl.js
 * -------
 * Copyright (C) 2011 by Remco Veldkamp
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 * jsparse.js
 * ----------
 * Copyright (C) 2011 by Chris Double
 * http://github.com/doublec/jsparse
 *
 *
 * Copyright (C) 2007 Chris Double.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED ``AS IS'' AND ANY EXPRESS OR IMPLIED WARRANTIES,
 * INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 * FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
 * DEVELOPERS AND CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS;
 * OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
 * WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR
 * OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF
 * ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

var fs = require('fs');

function foldl(f, initial, seq) {
    for(var i=0; i< seq.length; ++i)
        initial = f(initial, seq[i]);
    return initial;
}

var memoize = true;

function ParseState(input, index) {
    this.input = input;
    this.index = index || 0;
    this.length = input.length - this.index;
    this.cache = { };
    return this;
}

ParseState.prototype.from = function(index) {
    var r = new ParseState(this.input, this.index + index);
    r.cache = this.cache;
    r.length = this.length - index;
    return r;
}

ParseState.prototype.substring = function(start, end) {
    return this.input.substring(start + this.index, (end || this.length) + this.index);
}

ParseState.prototype.trimLeft = function() {
    var s = this.substring(0);
    var m = s.match(/^\s+/);
    return m ? this.from(m[0].length) : this;
}

ParseState.prototype.at = function(index) {
    return this.input.charAt(this.index + index);
}

ParseState.prototype.toString = function() {
    return 'PS"' + this.substring(0) + '"';
}

ParseState.prototype.getCached = function(pid) {
    if(!memoize)
        return false;

    var p = this.cache[pid];
    if(p)
        return p[this.index];
    else
        return false;
}

ParseState.prototype.putCached = function(pid, cached) {
    if(!memoize)
        return false;

    var p = this.cache[pid];
    if(p)
        p[this.index] = cached;
    else {
        p = this.cache[pid] = { };
        p[this.index] = cached;
    }
}

function ps(str) {
    return new ParseState(str);
}

// 'r' is the remaining string to be parsed.
// 'matched' is the portion of the string that
// was successfully matched by the parser.
// 'ast' is the AST returned by the successfull parse.
function make_result(r, matched, ast) {
        return { remaining: r, matched: matched, ast: ast };
}

var parser_id = 0;

// 'token' is a parser combinator that given a string, returns a parser
// that parses that string value. The AST contains the string that was parsed.
function token(s) {
    var pid = parser_id++;
    return function(state) {
        var savedState = state;
        var cached = savedState.getCached(pid);
        if(cached)
            return cached;

        var r = state.length >= s.length && state.substring(0,s.length) == s;
        if(r)
            cached = { remaining: state.from(s.length), matched: s, ast: s };
        else
            cached = false;
        savedState.putCached(pid, cached);
        return cached;
    };
}

// Like 'token' but for a single character. Returns a parser that given a string
// containing a single character, parses that character value.
function ch(c) {
    var pid = parser_id++;
    return function(state) {
        var savedState = state;
        var cached = savedState.getCached(pid);
        if(cached)
            return cached;
        var r = state.length >= 1 && state.at(0) == c;
        if(r)
            cached = { remaining: state.from(1), matched: c, ast: c };
        else
            cached = false;
        savedState.putCached(pid, cached);
        return cached;
    };
}

// 'range' is a parser combinator that returns a single character parser
// (similar to 'ch'). It parses single characters that are in the inclusive
// range of the 'lower' and 'upper' bounds ("a" to "z" for example).
function range(lower, upper) {
    var pid = parser_id++;
    return function(state) {
        var savedState = state;
        var cached = savedState.getCached(pid);
        if(cached)
            return cached;

        if(state.length < 1)
            cached = false;
        else {
            var ch = state.at(0);
            if(ch >= lower && ch <= upper)
                cached = { remaining: state.from(1), matched: ch, ast: ch };
            else
                cached = false;
        }
        savedState.putCached(pid, cached);
        return cached;
    };
}

// Helper function to convert string literals to token parsers
// and perform other implicit parser conversions.
function toParser(p) {
    return (typeof(p) == "string") ? token(p) : p;
}

// Parser combinator that returns a parser that
// skips whitespace before applying parser.
function whitespace(p) {
    var p = toParser(p);
    var pid = parser_id++;
    return function(state) {
        var savedState = state;
        var cached = savedState.getCached(pid);
        if(cached)
            return cached;

        cached = p(state.trimLeft());
        savedState.putCached(pid, cached);
        return cached;
    };
}

// Parser combinator that passes the AST generated from the parser 'p'
// to the function 'f'. The result of 'f' is used as the AST in the result.
function action(p, f) {
    var p = toParser(p);
    var pid = parser_id++;
    return function(state) {
        var savedState = state;
        var cached = savedState.getCached(pid);
        if(cached)
            return cached;

        var x = p(state);
        if(x) {
            x.ast = f(x.ast);
            cached = x;
        }
        else {
            cached = false;
        }
        savedState.putCached(pid, cached);
        return cached;
    };
}

// Given a parser that produces an array as an ast, returns a
// parser that produces an ast with the array joined by a separator.
function join_action(p, sep) {
    return action(p, function(ast) { return ast.join(sep); });
}

// Given an ast of the form [ Expression, [ a, b, ...] ], convert to
// [ [ [ Expression [ a ] ] b ] ... ]
// This is used for handling left recursive entries in the grammar. e.g.
// MemberExpression:
//   PrimaryExpression
//   FunctionExpression
//   MemberExpression [ Expression ]
//   MemberExpression . Identifier
//   new MemberExpression Arguments
function left_factor(ast) {
    return foldl(function(v, action) {
                     return [ v, action ];
                 },
                 ast[0],
                 ast[1]);
}

// Return a parser that left factors the ast result of the original
// parser.
function left_factor_action(p) {
    return action(p, left_factor);
}

// 'negate' will negate a single character parser. So given 'ch("a")' it will successfully
// parse any character except for 'a'. Or 'negate(range("a", "z"))' will successfully parse
// anything except the lowercase characters a-z.
function negate(p) {
    var p = toParser(p);
    var pid = parser_id++;
    return function(state) {
        var savedState = state;
        var cached = savedState.getCached(pid);
        if(cached)
            return cached;

        if(state.length >= 1) {
            var r = p(state);
            if(!r)
                cached =  make_result(state.from(1), state.at(0), state.at(0));
            else
                cached = false;
        }
        else {
            cached = false;
        }
        savedState.putCached(pid, cached);
        return cached;
    };
}

// 'end_p' is a parser that is successful if the input string is empty (ie. end of parse).
function end_p(state) {
    if(state.length == 0)
        return make_result(state, undefined, undefined);
    else
        return false;
}

// 'nothing_p' is a parser that always fails.
function nothing_p(state) {
    return false;
}

// 'sequence' is a parser combinator that processes a number of parsers in sequence.
// It can take any number of arguments, each one being a parser. The parser that 'sequence'
// returns succeeds if all the parsers in the sequence succeeds. It fails if any of them fail.
function sequence() {
    var parsers = [];
    for(var i = 0; i < arguments.length; ++i)
        parsers.push(toParser(arguments[i]));
    var pid = parser_id++;
    return function(state) {
        var savedState = state;
        var cached = savedState.getCached(pid);
        if(cached) {
            return cached;
        }

        var ast = [];
        var matched = "";
        var i;
        for(i=0; i< parsers.length; ++i) {
            var parser = parsers[i];
            var result = parser(state);
            if(result) {
                state = result.remaining;
                if(result.ast != undefined) {
                    ast.push(result.ast);
                    matched = matched + result.matched;
                }
            }
            else {
                break;
            }
        }
        if(i == parsers.length) {
            cached = make_result(state, matched, ast);
        }
        else
            cached = false;
        savedState.putCached(pid, cached);
        return cached;
    };
}

// Like sequence, but ignores whitespace between individual parsers.
function wsequence() {
    var parsers = [];
    for(var i=0; i < arguments.length; ++i) {
        parsers.push(whitespace(toParser(arguments[i])));
    }
    return sequence.apply(null, parsers);
}

// 'choice' is a parser combinator that provides a choice between other parsers.
// It takes any number of parsers as arguments and returns a parser that will try
// each of the given parsers in order. The first one that succeeds results in a
// successfull parse. It fails if all parsers fail.
function choice() {
    var parsers = [];
    for(var i = 0; i < arguments.length; ++i)
        parsers.push(toParser(arguments[i]));
    var pid = parser_id++;
    return function(state) {
        var savedState = state;
        var cached = savedState.getCached(pid);
        if(cached) {
            return cached;
        }
        var i;
        for(i=0; i< parsers.length; ++i) {
            var parser=parsers[i];
            var result = parser(state);
            if(result) {
                break;
            }
        }
        if(i == parsers.length)
            cached = false;
        else
            cached = result;
        savedState.putCached(pid, cached);
        return cached;
    }
}

// 'butnot' is a parser combinator that takes two parsers, 'p1' and 'p2'.
// It returns a parser that succeeds if 'p1' matches and 'p2' does not, or
// 'p1' matches and the matched text is longer that p2's.
// Useful for things like: butnot(IdentifierName, ReservedWord)
function butnot(p1,p2) {
    var p1 = toParser(p1);
    var p2 = toParser(p2);
    var pid = parser_id++;

    // match a but not b. if both match and b's matched text is shorter
    // than a's, a failed match is made
    return function(state) {
        var savedState = state;
        var cached = savedState.getCached(pid);
        if(cached)
            return cached;

        var br = p2(state);
        if(!br) {
            cached = p1(state);
        } else {
            var ar = p1(state);

            if (ar) {
              if(ar.matched.length > br.matched.length)
                  cached = ar;
              else
                  cached = false;
            }
            else {
              cached = false;
            }
        }
        savedState.putCached(pid, cached);
        return cached;
    }
}

// 'difference' is a parser combinator that takes two parsers, 'p1' and 'p2'.
// It returns a parser that succeeds if 'p1' matches and 'p2' does not. If
// both match then if p2's matched text is shorter than p1's it is successfull.
function difference(p1,p2) {
    var p1 = toParser(p1);
    var p2 = toParser(p2);
    var pid = parser_id++;

    // match a but not b. if both match and b's matched text is shorter
    // than a's, a successfull match is made
    return function(state) {
        var savedState = state;
        var cached = savedState.getCached(pid);
        if(cached)
            return cached;

        var br = p2(state);
        if(!br) {
            cached = p1(state);
        } else {
            var ar = p1(state);
            if(ar.matched.length >= br.matched.length)
                cached = br;
            else
                cached = ar;
        }
        savedState.putCached(pid, cached);
        return cached;
    }
}


// 'xor' is a parser combinator that takes two parsers, 'p1' and 'p2'.
// It returns a parser that succeeds if 'p1' or 'p2' match but fails if
// they both match.
function xor(p1, p2) {
    var p1 = toParser(p1);
    var p2 = toParser(p2);
    var pid = parser_id++;

    // match a or b but not both
    return function(state) {
        var savedState = state;
        var cached = savedState.getCached(pid);
        if(cached)
            return cached;

        var ar = p1(state);
        var br = p2(state);
        if(ar && br)
            cached = false;
        else
            cached = ar || br;
        savedState.putCached(pid, cached);
        return cached;
    }
}

// A parser combinator that takes one parser. It returns a parser that
// looks for zero or more matches of the original parser.
function repeat0(p) {
    var p = toParser(p);
    var pid = parser_id++;

    return function(state) {
        var savedState = state;
        var cached = savedState.getCached(pid);
        if(cached) {
            return cached;
        }

        var ast = [];
        var matched = "";
        var result;
        while(result = p(state)) {
            ast.push(result.ast);
            matched = matched + result.matched;
            if(result.remaining.index == state.index)
                break;
            state = result.remaining;
        }
        cached = make_result(state, matched, ast);
        savedState.putCached(pid, cached);
        return cached;
    }
}

// A parser combinator that takes one parser. It returns a parser that
// looks for one or more matches of the original parser.
function repeat1(p) {
    var p = toParser(p);
    var pid = parser_id++;

    return function(state) {
        var savedState = state;
        var cached = savedState.getCached(pid);
        if(cached)
            return cached;

        var ast = [];
        var matched = "";
        var result= p(state);
        if(!result)
            cached = false;
        else {
            while(result) {
                ast.push(result.ast);
                matched = matched + result.matched;
                if(result.remaining.index == state.index)
                    break;
                state = result.remaining;
                result = p(state);
            }
            cached = make_result(state, matched, ast);
        }
        savedState.putCached(pid, cached);
        return cached;
    }
}

// A parser combinator that takes one parser. It returns a parser that
// matches zero or one matches of the original parser.
function optional(p) {
    var p = toParser(p);
    var pid = parser_id++;
    return function(state) {
        var savedState = state;
        var cached = savedState.getCached(pid);
        if(cached)
            return cached;
        var r = p(state);
        cached = r || make_result(state, "", false);
        savedState.putCached(pid, cached);
        return cached;
    }
}

// A parser combinator that ensures that the given parser succeeds but
// ignores its result. This can be useful for parsing literals that you
// don't want to appear in the ast. eg:
// sequence(expect("("), Number, expect(")")) => ast: Number
function expect(p) {
    return action(p, function(ast) { return undefined; });
}

function chain(p, s, f) {
    var p = toParser(p);

    return action(sequence(p, repeat0(action(sequence(s, p), f))),
                  function(ast) { return [ast[0]].concat(ast[1]); });
}

// A parser combinator to do left chaining and evaluation. Like 'chain', it expects a parser
// for an item and for a seperator. The seperator parser's AST result should be a function
// of the form: function(lhs,rhs) { return x; }
// Where 'x' is the result of applying some operation to the lhs and rhs AST's from the item
// parser.
function chainl(p, s) {
    var p = toParser(p);
    return action(sequence(p, repeat0(sequence(s, p))),
                  function(ast) {
                      return foldl(function(v, action) { return action[0](v, action[1]); }, ast[0], ast[1]);
                  });
}

// A parser combinator that returns a parser that matches lists of things. The parser to
// match the list item and the parser to match the seperator need to
// be provided. The AST is the array of matched items.
function list(p, s) {
    return chain(p, s, function(ast) { return ast[1]; });
}

// Like list, but ignores whitespace between individual parsers.
function wlist() {
    var parsers = [];
    for(var i=0; i < arguments.length; ++i) {
        parsers.push(whitespace(arguments[i]));
    }
    return list.apply(null, parsers);
}

// A parser that always returns a zero length match
function epsilon_p(state) {
    return make_result(state, "", undefined);
}

// Allows attaching of a function anywhere in the grammer. If the function returns
// true then parse succeeds otherwise it fails. Can be used for testing if a symbol
// is in the symbol table, etc.
function semantic(f) {
    var pid = parser_id++;
    return function(state) {
        var savedState = state;
        var cached = savedState.getCached(pid);
        if(cached)
            return cached;
        cached = f() ? make_result(state, "", undefined) : false;
        savedState.putCached(pid, cached);
        return cached;
    }
}

// The and predicate asserts that a certain conditional
// syntax is satisfied before evaluating another production. Eg:
// sequence(and("0"), oct_p)
// (if a leading zero, then parse octal)
// It succeeds if 'p' succeeds and fails if 'p' fails. It never
// consume any input however, and doesn't put anything in the resulting
// AST.
function and(p) {
    var p = toParser(p);
    var pid = parser_id++;
    return function(state) {
        var savedState = state;
        var cached = savedState.getCached(pid);
        if(cached)
            return cached;
        var r = p(state);
        cached = r ? make_result(state, "", undefined) : false;
        savedState.putCached(pid, cached);
        return cached;
    }
}

// The opposite of 'and'. It fails if 'p' succeeds and succeeds if
// 'p' fails. It never consumes any input. This combined with 'and' can
// be used for 'lookahead' and disambiguation of cases.
//
// Compare:
// sequence("a",choice("+","++"),"b")
//   parses a+b
//   but not a++b because the + matches the first part and peg's don't
//   backtrack to other choice options if they succeed but later things fail.
//
// sequence("a",choice(sequence("+", not("+")),"++"),"b")
//    parses a+b
//    parses a++b
//
function not(p) {
    var p = toParser(p);
    var pid = parser_id++;
    return function(state) {
        var savedState = state;
        var cached = savedState.getCached(pid);
        if(cached)
            return cached;
        cached = p(state) ? false : make_result(state, "", undefined);
        savedState.putCached(pid, cached);
        return cached;
    }
}



var Pxxl = {};

Pxxl.Font = function(version, comments, properties, glyphs) {
  this.version = version;
  this.comments = comments;
  this.properties = properties;
  this.glyphs = glyphs;
  //console.log(glyphs);
  //console.log("BDF version " + this.version);
  // if (comments && comments.length)
  //   console.log(comments.join(""));
};

Pxxl.Font.prototype = {

  size: function() {
    return this.SIZE[0];
  },

  getGlyph: function(character) {
    var c = character.charCodeAt(0);

    return this.glyphs[c];
  },

  defaultWidth: function () {
    return this.FONTBOUNDINGBOX[0];
  },

  defaultHeight: function () {
    return this.FONTBOUNDINGBOX[1];
  },

  bit: function(text, row, column ) {
    var t = ~~(column / 8);
    if (t < 0 || t > text.length-1) return false;
    var c = text.charCodeAt(t);

    //console.log(t);
    var g = this.glyphs[c];
    if (g)
      return g.bit(row , column % 8);
    else
      return false;
  },

  getPixels : function(text) {
    //console.log(text, x,y, maxWidth);
    var ctx = this.ctx;
    var hspacing = this.FONTBOUNDINGBOX[0];

    var pixels = [];


    for( var t=0 ; t<text.length ; t++) // characters in a string x
    {
     var chr = text.charCodeAt(t);
     var glyph = this.glyphs[chr];

     var bitmap = glyph.bitmap;
     var dx = t * hspacing;
     var dy = this.defaultHeight() - glyph.height(); // some glyphs have fewer rows

     for ( var r=0 ; r<bitmap.length ; r++) // pixelrows in a glyph y
     {
       var row = bitmap[r];

       for (var b=0 ; b<row.length ; b++) // bytes in a row x
       {
         var byt = row[b];

         var offset = b*8; //consecutive bytes are drawn next to each other
         var bit = 256;

         while (bit >>>= 1) // bits in a byte x
         {
           if (byt & bit)
           {
             var px = dx+offset;
             var py = dy+r;

              pixels.push({x:px, y:py, row:r, column:offset });
           }
           offset++;
         }
       }
     }
    }

    return pixels;
  }
};


Pxxl.Glyph = function (name, bitmap) {
  //console.log("Glyph", name, bitmap);
  this.name = name;
  this.bitmap = bitmap;
};

Pxxl.Glyph.prototype = {

  set: function (x,y,value) {
    var bit = 1 << this.width() - x - 1;
    var byt = ~~(bit/256);
    bit %= (byt+1) * 256;

    //console.log(this.bitmap);

    if (value)
      this.bitmap[y][byt] |= bit;
    else
      this.bitmap[y][byt] &= ~bit;

    //console.log(this.bitmap);
  },

  get: function (x,y) {
    var bit = 1 << this.width() - x - 1;
    var byt = ~~(bit/256);
    bit %= (byt+1) * 256;

    var result = this.bitmap[y][byt] & bit;
    //console.log("x:"+x, "y:"+y, "bit:"+bit, "byte:"+byte, "value:"+result );
    return !!result;
  },

  width: function () {
    return this.BBX[0];
  },

  height: function () {
    return this.BBX[1];
  },

  toString: function() {
    var result = "";
    for (var y=0 ; y<this.bitmap.length ; y++)
    {
      for (var x=0 ; x<this.width() ; x++)
      {
        result += this.get(x,y) ? "*" : " ";
      }
      result += "/n";
    }

    return result;
  }
};

;(function() {

var EXCLAMATION_MARK = ch("!");
var AT = ch("@");
var HASH = ch("#");
var DOLLAR = ch("$");
var PERCENT = ch("%");
var CARET = ch("^");
var AMPERSAND = ch("&");
var ASTERISK = ch("*");
var LEFT_PARENTHESIS = ch("(");
var RIGHT_PARENTHESIS = ch(")");
var MINUS = ch("-");
var UNDERSCORE = ch("_");
var PLUS = ch("+");
var EQUALS = ch("=");
var LEFT_ACCOLADE = ch("{");
var RIGHT_ACCOLADE = ch("}");
var LEFT_BRACKET = ch("[");
var RIGHT_BRACKET = ch("]");
var COLON = ch(":");
var SEMICOLON = ch(";");
var QUOTE = ch("'");
var DOUBLE_QUOTE = ch('"');
var PIPE  = ch("|");
var BACKSLASH  = ch("\\");
var TILDE  = ch("~");
var BACKTICK = ch("`");
var COMMA = ch(",");
var PERIOD = ch(".");
var LESS_THAN = ch("<");
var GREATER_THAN = ch(">");
var QUESTION_MARK = ch("?");
var SLASH = ch("/");

var SpecialChar = choice(EXCLAMATION_MARK, AT, HASH, DOLLAR, PERCENT, CARET, AMPERSAND, ASTERISK, LEFT_PARENTHESIS, RIGHT_PARENTHESIS, MINUS, UNDERSCORE, PLUS, EQUALS, LEFT_ACCOLADE, RIGHT_ACCOLADE, LEFT_BRACKET, RIGHT_BRACKET, COLON, SEMICOLON, QUOTE, DOUBLE_QUOTE, PIPE, BACKSLASH, TILDE, BACKTICK, COMMA, PERIOD, LESS_THAN, GREATER_THAN, QUESTION_MARK, SLASH);

var Digit = range("0","9");
var LowerCase = range("a", "z");
var UpperCase = range("A", "Z");

var NEWLINE = ch('\n');
var Space = ch(' ');
var Tab = ch("\t");

var Alpha = choice(LowerCase, UpperCase);
var AlphaNum = choice(Alpha, Digit);
var NoSpaceChar = choice(AlphaNum, SpecialChar);
var Char = choice(NoSpaceChar, Space);
var Spaces = flatten(repeat1(Space));
var Text = flatten(repeat1(Char));

var EOL = sequence(repeat0(Space), NEWLINE);

var QUOTED_STRING = pick(1, sequence(DOUBLE_QUOTE, flatten(repeat1(butnot(Char, DOUBLE_QUOTE))), DOUBLE_QUOTE));

var HexDigit =  choice(range("a", "f"), range("A", "F"), Digit);
var Byte = action(flatten(sequence(HexDigit,HexDigit)), function(s) { return parseInt(s, 16); });
var ByteArray = repeat1(Byte);
var Natural = flatten(repeat1(Digit));

var NegativeNumber = flatten(sequence(MINUS, Natural));
var Integer = action(choice(Natural, NegativeNumber), parseInt);
//var Word = flatten(repeat1(Alpha));

//var PropName = flatten(sequence(Alpha, flatten(repeat0(choice(Alpha, UNDERSCORE)))));
var PropName = flatten(repeat1(choice(Alpha, UNDERSCORE)));
var Prop1 = action(sequence(PropName, repeat1(pick(1,sequence(Spaces, Integer)))), MakeProp1);
var Prop2 = action(sequence(PropName, Spaces, QUOTED_STRING), MakeProp2);
var Prop3 = action(sequence(PropName, Spaces, flatten(repeat1(NoSpaceChar))), MakeProp2);
var ENDPROPERTIES = token("ENDPROPERTIES");
var Prop = trace(choice(Prop1, Prop2, Prop3, ENDPROPERTIES), "prop");
var PropRow = pick(0, sequence(Prop, EOL));

var BitmapRow = pick(0,sequence( ByteArray, EOL ));
var BITMAP = token("BITMAP");
var BitmapStart = sequence(BITMAP, EOL);
var Bitmap = trace(pick(1, sequence(BitmapStart, repeat0( BitmapRow ))), "bitmap");

var STARTCHAR = token("STARTCHAR");
var ENDCHAR = token("ENDCHAR");
var GlyphStart = trace(pick(2, sequence(STARTCHAR, Space, Text, EOL)), "glyphstart");
var GlyphEnd = sequence(ENDCHAR, EOL);
var Glyph = trace(action(sequence(GlyphStart, repeat0(PropRow), Bitmap, GlyphEnd), MakeGlyph), "glyph");

//var Glyph = action(_Glyph, function(ast) { console.log(ast)} );

var STARTFONT = token("STARTFONT");
var ENDFONT = token("ENDFONT");
var Version = flatten(sequence(Natural, PERIOD, Natural));
var FontStart = trace(pick(2, sequence( STARTFONT, Spaces, Version, EOL )), "fontstart");
var FontEnd = trace(sequence( ENDFONT, optional(EOL)), "fontend"); // EOL optional for now
var COMMENT = token("COMMENT");
var Comment = pick(2, sequence(COMMENT, optional(Space), optional(Text)));
var CommentRow = trace(pick(0, sequence(Comment, EOL)), "comment");


var BDF = action(sequence( repeat0(CommentRow), FontStart, repeat0(CommentRow), repeat0(butnot(PropRow, GlyphStart)), repeat0(Glyph), FontEnd), MakeFont); // empty container is allowed

// input: sequence( FontStart, repeat0(CommentRow), repeat0(butnot(PropRow, GlyphStart)), repeat0(Glyph), FontEnd)
function MakeFont(ast) {
  var formatVersion = ast[1];
  var comments = ast[0].concat(ast[2]);
  var properties = ast[3];
  var glyphs = PropertyList2Hash(ast[4]);
  var f = new Pxxl.Font(formatVersion, comments, properties, glyphs);
  return PropertyBagMixin(f, properties);
}

// input: sequence(GlyphStart, repeat0(PropRow), Bitmap, GlyphEnd
function MakeGlyph(ast) {
  var name = ast[0];
  var properties = ast[1];
  var bitmap = ast[2];
  var g =  new Pxxl.Glyph(name, bitmap);
  //console.log("glyph", g.toString());
  g = PropertyBagMixin(g, properties);
  return { name: g["ENCODING"], value :g};
}

function PropertyBagMixin(obj, proplist) {
  for( var i=0 ; i<proplist.length ; i++ ) {
    var prop = proplist[i];

    // WATCH OUT! possibly overwriting pre-existing properties!
    obj[prop.name] = prop.value
  }

  return obj;
}

function PropertyList2Hash(proplist) {
  var hash = {};

  for( var i=0 ; i<proplist.length ; i++ ) {
    var prop = proplist[i];

    // WATCH OUT! possibly overwriting pre-existing properties!
    hash[prop.name] = prop.value
  }

  return hash;
}

function MakeProp1(ast) {
  var value = ast[1];
  var name = ast[0];

  if (name == "ENCODING" || name == "CHARS")
    value = value[0];

  return { name: name, value: value };
}

function MakeProp2(ast) {
  return { name: ast[0], value: ast[2] };
}

function flatten(p) {
  return join_action(p, "");
}

function pick(i, p) {
  return action(p, function(ast) { return ast[i]; });
}

function trace(p, label) {
  var traceon = Pxxl.trace;
  var traceall = Pxxl.traceall;

  if (!traceon) return p;

  return function(state) {
    var result = p(state);
    if (!result.ast) {
      var matched = state.input.substring(0,state.index);
      var lines = matched.split("\n");
      //lines[lines.length-1]
      console.error(label, "failed at line", lines.length, state);
    }
    if (result.ast && traceall)
      console.log(label, "matches", result.matched, "\nAST:", result.ast);

    return result;
  }
}

function pre(input) {
  var lines = input.split("\n");
  for (var l=lines.length-1 ; l>=0 ; l--) {
    var line = ltrim(lines[l]);

    if (line == "")
      lines.splice(l, 1);
    else
      lines[l] = line;
  }

  return lines.join("\n");
}

function ltrim(stringToTrim) {
	return stringToTrim.replace(/^\s+/,"");
}

function parseBDF (input, trace, traceall) {
  Pxxl.trace = trace;
  Pxxl.traceall = traceall;

  input = pre(input);
  var state = ps(input);
  var before = +new Date;
  var result = BDF(state);
  var time = +new Date - before;

  if (result.ast) {
    //console.log("parsing took: " + time + "ms");
    return result.ast;
  }

  throw new Error("Unable to parse font!");
}

// export only single function
Pxxl.Font.ParseBDF = parseBDF;

})();

Pxxl.Glyph.ParseJSON = function (obj) {

  var g = new Pxxl.Glyph(obj.name, obj.bitmap);

  // shallow copy
  for (var k in obj) {
    if (obj.hasOwnProperty(k))
      g[k] = obj[k];
  }
  //console.log("glyph", g.toString());
  return g;
};

Pxxl.Font.ParseJSON = function (obj) {
  var f = new Pxxl.Font(obj.version, obj.comments, obj.properties, {});
  //console.log(f);
  for (var k in obj) {
    if (obj.hasOwnProperty(k) && k != "glyphs")
      f[k] = obj[k];
  }

  f.glyphs = {};
  for (var g in obj.glyphs) {
    //console.log(g);
    if (obj.glyphs.hasOwnProperty(g))
      f.glyphs[g] = Pxxl.Glyph.ParseJSON(obj.glyphs[g]);
  }
  return f;
};
;(function() {
  //from: http://www.quirksmode.org/js/xmlhttp.html
  function sendRequest(url,callback,postData) {
      var req = createXMLHTTPObject();
      if (!req) return;
      var method = (postData) ? "POST" : "GET";
      req.open(method,url,true);
      //req.setRequestHeader('User-Agent','XMLHTTP/1.0');
      if (postData)
          req.setRequestHeader('Content-type','application/x-www-form-urlencoded');
      req.onreadystatechange = function () {
          if (req.readyState != 4) return;
          if (req.status != 200 && req.status != 304) {
  //          alert('HTTP error ' + req.status);
              return;
          }
          callback(req);
      }
      if (req.readyState == 4) return;
      req.send(postData);
  }

  var XMLHttpFactories = [
      function () {return new XMLHttpRequest()},
      function () {return new ActiveXObject("Msxml2.XMLHTTP")},
      function () {return new ActiveXObject("Msxml3.XMLHTTP")},
      function () {return new ActiveXObject("Microsoft.XMLHTTP")}
  ];

  function createXMLHTTPObject() {
      var xmlhttp = false;
      for (var i=0;i<XMLHttpFactories.length;i++) {
          try {
              xmlhttp = XMLHttpFactories[i]();
          }
          catch (e) {
              continue;
          }
          break;
      }
      return xmlhttp;
  }


  function LoadFont(url, callback) {
    // FIXME: determine type based on mimetype and/or extension
    // if(url.indexOf("json") > -1 )
    //   $.getJSON(url, function(data) {
    //     callback(Pxxl.Font.ParseJSON(data));
    //   });
    // else
    // sendRequest(url,function(req) {
    //   callback(Pxxl.Font.ParseBDF(req.responseText));
    // });
    var responseText;
    if (~url.indexOf('STARTFONT')) {
      responseText = url;
    } else {
      responseText = fs.readFileSync(url, 'utf8');
    }
    callback(Pxxl.Font.ParseBDF(responseText));
  };

  // memoization funcion for use with callbacks
  function memoize2(f) {
    var cache = {};

    return function (arg, callback) {
      var cached = cache[arg];

      if (typeof cached !== 'undefined') {
        //console.log('cache hit: ', arg);
        return callback(cached);
      }
      else {
        //console.log('cache miss:', arg);
        return f(arg, function(result) {
          cache[arg] = result;
          return callback(result);
        });
      }
    };
  }

  Pxxl.LoadFont = memoize2(LoadFont);

})();

function pxxl(fontUrl, text, draw) {
  Pxxl.LoadFont(fontUrl, function(font) {
    var pixels = font.getPixels(text);
    draw(pixels, font);
  });
}

pxxl.sync = function(fontUrl, text) {
  var pixels, font;
  Pxxl.LoadFont(fontUrl, function(font_) {
    var pixels_ = font_.getPixels(text);
    pixels = pixels_;
    font = font_;
  });
  return [pixels, font];
};

module.exports = pxxl;
