/* eslint-disable */
import * as assert from 'assert'
import { EvalKind } from '../../snippets/eval'
import { Choice, CodeBlock, ConditionMarker, ConditionString, FormatString, getPlaceholderId, Marker, mergeTexts, Placeholder, Scanner, SnippetParser, Text, TextmateSnippet, TokenType, Transform, transformEscapes, Variable } from '../../snippets/parser'

describe('SnippetParser', () => {

  test('transformEscapes', () => {
    assert.equal(transformEscapes('b\\uabc\\LDef'), 'bAbcdef')
    assert.equal(transformEscapes('b\\lAbc\\LDef'), 'babcdef')
    assert.equal(transformEscapes('b\\Uabc\\Edef'), 'bABCdef')
    assert.equal(transformEscapes('b\\LABC\\Edef'), 'babcdef')
    assert.equal(transformEscapes(' \\n \\t'), ' \n \t')
  })

  test('Empty Marker', () => {
    assert.ok(Marker != null)
    assert.strictEqual((new Text('')).snippet, undefined)
  })

  test('Scanner', () => {

    const scanner = new Scanner()
    assert.equal(scanner.next().type, TokenType.EOF)

    scanner.text('abc')
    assert.equal(scanner.next().type, TokenType.VariableName)
    assert.equal(scanner.next().type, TokenType.EOF)

    scanner.text('{{abc}}')
    assert.equal(scanner.next().type, TokenType.CurlyOpen)
    assert.equal(scanner.next().type, TokenType.CurlyOpen)
    assert.equal(scanner.next().type, TokenType.VariableName)
    assert.equal(scanner.next().type, TokenType.CurlyClose)
    assert.equal(scanner.next().type, TokenType.CurlyClose)
    assert.equal(scanner.next().type, TokenType.EOF)

    scanner.text('abc() ')
    assert.equal(scanner.next().type, TokenType.VariableName)
    assert.equal(scanner.next().type, TokenType.OpenParen)
    assert.equal(scanner.next().type, TokenType.CloseParen)
    assert.equal(scanner.next().type, TokenType.Format)
    assert.equal(scanner.next().type, TokenType.EOF)

    scanner.text('abc 123')
    assert.equal(scanner.next().type, TokenType.VariableName)
    assert.equal(scanner.next().type, TokenType.Format)
    assert.equal(scanner.next().type, TokenType.Int)
    assert.equal(scanner.next().type, TokenType.EOF)

    scanner.text('$foo')
    assert.equal(scanner.next().type, TokenType.Dollar)
    assert.equal(scanner.next().type, TokenType.VariableName)
    assert.equal(scanner.next().type, TokenType.EOF)

    scanner.text('$foo_bar')
    assert.equal(scanner.next().type, TokenType.Dollar)
    assert.equal(scanner.next().type, TokenType.VariableName)
    assert.equal(scanner.next().type, TokenType.EOF)

    scanner.text('$foo-bar')
    assert.equal(scanner.next().type, TokenType.Dollar)
    assert.equal(scanner.next().type, TokenType.VariableName)
    assert.equal(scanner.next().type, TokenType.Dash)
    assert.equal(scanner.next().type, TokenType.VariableName)
    assert.equal(scanner.next().type, TokenType.EOF)

    scanner.text('${foo}')
    assert.equal(scanner.next().type, TokenType.Dollar)
    assert.equal(scanner.next().type, TokenType.CurlyOpen)
    assert.equal(scanner.next().type, TokenType.VariableName)
    assert.equal(scanner.next().type, TokenType.CurlyClose)
    assert.equal(scanner.next().type, TokenType.EOF)

    scanner.text('${1223:foo}')
    assert.equal(scanner.next().type, TokenType.Dollar)
    assert.equal(scanner.next().type, TokenType.CurlyOpen)
    assert.equal(scanner.next().type, TokenType.Int)
    assert.equal(scanner.next().type, TokenType.Colon)
    assert.equal(scanner.next().type, TokenType.VariableName)
    assert.equal(scanner.next().type, TokenType.CurlyClose)
    assert.equal(scanner.next().type, TokenType.EOF)

    scanner.text('\\${}')
    assert.equal(scanner.next().type, TokenType.Backslash)
    assert.equal(scanner.next().type, TokenType.Dollar)
    assert.equal(scanner.next().type, TokenType.CurlyOpen)
    assert.equal(scanner.next().type, TokenType.CurlyClose)

    scanner.text('${foo/regex/format/option}')
    assert.equal(scanner.next().type, TokenType.Dollar)
    assert.equal(scanner.next().type, TokenType.CurlyOpen)
    assert.equal(scanner.next().type, TokenType.VariableName)
    assert.equal(scanner.next().type, TokenType.Forwardslash)
    assert.equal(scanner.next().type, TokenType.VariableName)
    assert.equal(scanner.next().type, TokenType.Forwardslash)
    assert.equal(scanner.next().type, TokenType.VariableName)
    assert.equal(scanner.next().type, TokenType.Forwardslash)
    assert.equal(scanner.next().type, TokenType.VariableName)
    assert.equal(scanner.next().type, TokenType.CurlyClose)
    assert.equal(scanner.next().type, TokenType.EOF)
  })

  function assertText(value: string, expected: string, ultisnip = false) {
    const p = new SnippetParser(ultisnip)
    const actual = p.text(value)
    assert.equal(actual, expected)
  }

  function assertMarker(input: TextmateSnippet | Marker[] | string, ...ctors: Function[]) {
    let marker: Marker[]
    if (input instanceof TextmateSnippet) {
      marker = input.children
    } else if (typeof input === 'string') {
      const p = new SnippetParser()
      marker = p.parse(input).children
    } else {
      marker = input
    }
    while (marker.length > 0) {
      let m = marker.pop()
      let ctor = ctors.pop()
      assert.ok(m instanceof ctor)
    }
    assert.equal(marker.length, ctors.length)
    assert.equal(marker.length, 0)
  }

  function assertTextAndMarker(value: string, escaped: string, ...ctors: Function[]) {
    assertText(value, escaped)
    assertMarker(value, ...ctors)
  }

  function assertEscaped(value: string, expected: string) {
    const actual = SnippetParser.escape(value)
    assert.equal(actual, expected)
  }

  test('Parser, escaped', function() {
    assertEscaped('foo$0', 'foo\\$0')
    assertEscaped('foo\\$0', 'foo\\\\\\$0')
    assertEscaped('f$1oo$0', 'f\\$1oo\\$0')
    assertEscaped('${1:foo}$0', '\\${1:foo\\}\\$0')
    assertEscaped('$', '\\$')
  })

  test('Parser, escaped ultisnips', () => {
    const actual = new SnippetParser(true).text('t\\`a\\`\n\\$ \\{\\}')
    expect(actual).toBe('t`a`\n$ {}')
  })

  test('Parser, transform with empty placeholder', () => {
    const actual = new SnippetParser(true).text('${1} ${1/^(.*)/$1aa/}')
    expect(actual).toBe(' aa')
  })

  test('Parser, isPlainText()', function() {
    const s = (input: string, res: boolean) => {
      assert.equal(SnippetParser.isPlainText(input), res)
    }
    s('abc', true)
    s('abc$0', true)
    s('ab$0chh', false)
    s('ab$1chh', false)
  })

  test('Parser, paried curly brace in placeholder', () => {
    const getText = (text): string => {
      const parser = new SnippetParser(false)
      let snip = parser.parse(text)
      let res: Text
      snip.walk(marker => {
        if (marker instanceof Text) {
          res = marker
        }
        return true
      })
      return res ? res.value : undefined
    }

    let text = getText('${1:{foo}}')
    expect(text).toBe('{foo}')
    text = getText('${1:ab{foo}}')
    expect(text).toBe('ab{foo}')
    text = getText('${1:ab{foo}cd}')
    expect(text).toBe('ab{foo}cd')
  })

  test('Parser, first placeholder / variable', function() {
    const first = (input: string): Marker => {
      const p = new SnippetParser(false)
      let s = p.parse(input, true)
      return s.first
    }
    const assertPlaceholder = (m: any, index: number) => {
      assert.equal(m instanceof Placeholder, true)
      assert.equal(m.index, index)
    }
    assertPlaceholder(first('foo'), 0)
    assertPlaceholder(first('${1:foo}'), 1)
    assertPlaceholder(first('${2:foo}'), 2)

    const p = new SnippetParser(false)
    let s = p.parse('${1/from/to/}', true)
    let placeholder = s.placeholders[0]
    assert.strictEqual(placeholder.toTextmateString(), '${1/from/to/}')
  })

  test('Parser, text', () => {
    assertText('$', '$')
    assertText('\\\\$', '\\$')
    assertText('{', '{')
    assertText('\\}', '}')
    assertText('\\abc', '\\abc')
    assertText('foo${f:\\}}bar', 'foo}bar')
    assertText('\\{', '\\{')
    assertText('I need \\\\\\$', 'I need \\$')
    assertText('\\', '\\')
    assertText('\\{{', '\\{{')
    assertText('{{', '{{')
    assertText('{{dd', '{{dd')
    assertText('}}', '}}')
    assertText('ff}}', 'ff}}')

    assertText('${foo/.*/complex${1:/upcase/i}', '${foo/.*/complex/upcase/i')
    assertText('${foo/.*/${1/upcase}', '${foo/.*/${1/upcase}')
    assertText('${VISUAL/.*/complex${1:/upcase}/i}', '${VISUAL/.*/complex/upcase/i}', true)
    assertText('${foo/.*/complex${p:/upcase}/i}', '${foo/.*/complex/upcase/i}')

    assertText('farboo', 'farboo')
    assertText('far{{}}boo', 'far{{}}boo')
    assertText('far{{123}}boo', 'far{{123}}boo')
    assertText('far\\{{123}}boo', 'far\\{{123}}boo')
    assertText('far{{id:bern}}boo', 'far{{id:bern}}boo')
    assertText('far{{id:bern {{basel}}}}boo', 'far{{id:bern {{basel}}}}boo')
    assertText('far{{id:bern {{id:basel}}}}boo', 'far{{id:bern {{id:basel}}}}boo')
    assertText('far{{id:bern {{id2:basel}}}}boo', 'far{{id:bern {{id2:basel}}}}boo')
  })

  test('Parser ConditionMarker', () => {
    {
      let m = new ConditionMarker(1,
        [new Text('a '), new FormatString(1)],
        [new Text('b '), new FormatString(2)],
      )
      let val = m.resolve('', ['', 'foo', 'bar'])
      expect(val).toBe('b bar')
      val = m.resolve('x', ['', 'foo', 'bar'])
      expect(val).toBe('a foo')
      m.addIfMarker(new Text('if'))
      m.addElseMarker(new Text('else'))
      let s = m.toTextmateString()
      expect(s).toBe('(?1:a ${1}if:b ${2}else)')
      expect(m.clone()).toBeDefined()
    }
    {
      let m = new ConditionMarker(1,
        [new Text('foo')],
        []
      )
      let text = m.toTextmateString()
      expect(text).toBe('(?1:foo)')
    }
  })

  test('Parser, TM text', () => {
    assertTextAndMarker('foo${1:bar}}', 'foobar}', Text, Placeholder, Text)
    assertTextAndMarker('foo${1:bar}${2:foo}}', 'foobarfoo}', Text, Placeholder, Placeholder, Text)
    assertTextAndMarker('foo${1:bar\\}${2:foo}}', 'foobar}foo', Text, Placeholder)

    let [, placeholder] = new SnippetParser().parse('foo${1:bar\\}${2:foo}}').children
    let { children } = (<Placeholder>placeholder)

    assert.equal((<Placeholder>placeholder).index, '1')
    assert.ok(children[0] instanceof Text)
    assert.equal(children[0].toString(), 'bar}')
    assert.ok(children[1] instanceof Placeholder)
    assert.equal(children[1].toString(), 'foo')
  })

  test('Parser, placeholder', () => {
    assertTextAndMarker('farboo', 'farboo', Text)
    assertTextAndMarker('far{{}}boo', 'far{{}}boo', Text)
    assertTextAndMarker('far{{123}}boo', 'far{{123}}boo', Text)
    assertTextAndMarker('far\\{{123}}boo', 'far\\{{123}}boo', Text)
  })

  test('Parser, literal code', () => {
    assertTextAndMarker('far`123`boo', 'far`123`boo', Text)
    assertTextAndMarker('far\\`123\\`boo', 'far\\`123\\`boo', Text)
  })

  test('Parser, variables/tabstop', () => {
    assertTextAndMarker('$far-boo', '-boo', Variable, Text)
    assertTextAndMarker('\\$far-boo', '$far-boo', Text)
    assertTextAndMarker('far$farboo', 'far', Text, Variable)
    assertTextAndMarker('far${farboo}', 'far', Text, Variable)
    assertTextAndMarker('$123', '', Placeholder)
    assertTextAndMarker('$farboo', '', Variable)
    assertTextAndMarker('$far12boo', '', Variable)
    assertTextAndMarker('000_${far}_000', '000__000', Text, Variable, Text)
    assertTextAndMarker('FFF_${TM_SELECTED_TEXT}_FFF$0', 'FFF__FFF', Text, Variable, Text, Placeholder)
  })

  test('Parser, variables/placeholder with defaults', () => {
    assertTextAndMarker('${name:value}', 'value', Variable)
    assertTextAndMarker('${1:value}', 'value', Placeholder)
    assertTextAndMarker('${1:bar${2:foo}bar}', 'barfoobar', Placeholder)

    assertTextAndMarker('${name:value', '${name:value', Text)
    assertTextAndMarker('${1:bar${2:foobar}', '${1:barfoobar', Text, Placeholder)
  })

  test('Parser, variable transforms', function() {
    assertTextAndMarker('${foo///}', '', Variable)
    assertTextAndMarker('${foo/regex/format/gmi}', '', Variable)
    assertTextAndMarker('${foo/([A-Z][a-z])/format/}', '', Variable)

    // invalid regex
    assertTextAndMarker('${foo/([A-Z][a-z])/format/GMI}', '${foo/([A-Z][a-z])/format/GMI}', Text)
    assertTextAndMarker('${foo/([A-Z][a-z])/format/funky}', '${foo/([A-Z][a-z])/format/funky}', Text)
    assertTextAndMarker('${foo/([A-Z][a-z]/format/}', '${foo/([A-Z][a-z]/format/}', Text)

    // tricky regex
    assertTextAndMarker('${foo/m\\/atch/$1/i}', '', Variable)
    assertMarker('${foo/regex\/format/options}', Text)

    // incomplete
    assertTextAndMarker('${foo///', '${foo///', Text)
    assertTextAndMarker('${foo/regex/format/options', '${foo/regex/format/options', Text)

    // format string
    assertMarker('${foo/.*/${0:fooo}/i}', Variable)
    assertMarker('${foo/.*/${1}/i}', Variable)
    assertMarker('${foo/.*/$1/i}', Variable)
    assertMarker('${foo/.*/This-$1-encloses/i}', Variable)
    assertMarker('${foo/.*/complex${1:else}/i}', Variable)
    assertMarker('${foo/.*/complex${1:-else}/i}', Variable)
    assertMarker('${foo/.*/complex${1:+if}/i}', Variable)
    assertMarker('${foo/.*/complex${1:?if:else}/i}', Variable)
    assertMarker('${foo/.*/complex${1:/upcase}/i}', Variable)

  })

  test('Parse, parse code block', () => {
    assertText('aa \\`echo\\`', 'aa `echo`', true)
    assertText('aa `xyz`', 'aa ', true)
    assertText('aa `!v xyz`', 'aa ', true)
    assertText('aa `!p xyz`', 'aa ', true)
    assertText('aa `!p foo\nbar`', 'aa ', true)
    assertText('aa `!p py', 'aa `!p py', true)
    assertText('aa `!p \n`', 'aa ', true)
    assertText('aa `!p\n  1\n  2`', 'aa ', true)
    const c = text => {
      return (new SnippetParser(true)).parse(text)
    }
    assertMarker(c('`foo`'), CodeBlock)
    assertMarker(c('`!v bar`'), CodeBlock)
    assertMarker(c('`!p python`'), CodeBlock)
    const assertPlaceholder = (text: string, kind: EvalKind, code: string) => {
      let p = c(text).children[0]
      assert.ok(p instanceof Placeholder)
      let m = p.children[0] as CodeBlock
      assert.ok(m instanceof CodeBlock)
      assert.equal(m.kind, kind)
      assert.equal(m.code, code)
    }
    assertPlaceholder('${1:` foo `}', 'shell', 'foo')
    assertPlaceholder('${1:`!v bar`}', 'vim', 'bar')
    assertPlaceholder('${1:`!p python`}', 'python', 'python')
    assertPlaceholder('${1:`!p x\\`y`}', 'python', 'x\\`y')
    assertPlaceholder('${1:`!p x\ny`}', 'python', 'x\ny')
    assertPlaceholder('${1:`!p \nx\ny`}', 'python', 'x\ny')
  })

  test('Parser, CodeBlock toTextmateString', () => {
    const c = text => {
      return (new SnippetParser(true)).parse(text)
    }
    expect(c('`foo`').toTextmateString()).toBe('`foo`')
    expect(c('`!p snip.rv`').toTextmateString()).toBe('`!p snip.rv`')
    expect(c('`!v "var"`').toTextmateString()).toBe('`!v "var"`')
  })

  test('Parser, placeholder with CodeBlock primary', () => {
    const c = text => {
      return (new SnippetParser(true)).parse(text)
    }
    let s = c('${1/^_(.*)/$1/} $1 aa ${1:`!p snip.rv = "_foo"`}')
    let arr = s.placeholders
    arr = arr.filter(o => o.index == 1)
    assert.equal(arr.length, 3)
    let filtered = arr.filter(o => o.primary === true)
    assert.equal(filtered.length, 1)
    assert.equal(filtered[0], arr[2])
    let children = arr.map(o => o.children[0])
    assert.ok(children[0] instanceof Text)
    assert.ok(children[1] instanceof Text)
    assert.ok(children[2] instanceof CodeBlock)
  })

  test('Parser, placeholder with CodeBlock not primary', () => {
    const c = text => {
      return (new SnippetParser(true)).parse(text)
    }
    let s = c('${1/^_(.*)/$1/} ${1:_foo} ${2:bar} $1 $3 ${1:`!p snip.rv = "three"`}')
    let arr = s.placeholders
    arr = arr.filter(o => o.index == 1)
    assert.equal(arr.length, 4)
    assert.ok(arr[0].transform)
    assert.equal(arr[1].primary, true)
    assert.equal(arr[2].toString(), '_foo')
    assert.equal(arr[3].toString(), '_foo')
    assert.deepEqual(s.values, { '0': '', '1': '_foo', '2': 'bar', '3': '' })
    arr[1].index = 1.1
    assert.deepEqual(s.values, { '0': '', '1': '_foo', '2': 'bar', '3': '' })
    s = c('${1:`!p snip.rv = t[2]`} ${2:`!p snip.rv = t[1]`}')
    assert.deepEqual(s.orderedPyIndexBlocks, [])
  })

  test('Parser, python CodeBlock with related', () => {
    const c = text => {
      return (new SnippetParser(true)).parse(text)
    }
    let s = c('${1:_foo} ${2:bar} $1 $3 ${3:`!p snip.rv = str(t[1]) + str(t[2])`}')
    let b = s.pyBlocks[0]
    expect(b).toBeDefined()
    expect(b.related).toEqual([1, 2])
  })

  test('Parser, python CodeBlock by sequence', () => {
    const c = text => {
      return (new SnippetParser(true)).parse(text)
    }
    let s = c('${2:\{${3:`!p foo`}\}} ${1:`!p bar`}')
    let arr = s.pyBlocks
    expect(arr[0].code).toBe('foo')
    expect(arr[1].code).toBe('bar')
  })

  test('Parser, hasPython()', () => {
    const c = text => {
      return (new SnippetParser(true)).parse(text)
    }
    assert.equal(c('${1:`!p foo`}').hasPythonBlock, true)
    assert.equal(c('`!p foo`').hasPythonBlock, true)
    assert.equal(c('$1').hasPythonBlock, false)
  })

  test('Parser, insertBefore', () => {
    const c = text => {
      return (new SnippetParser(true)).parse(text)
    }
    let m = new Placeholder(2)
    m.insertBefore('\n')
    let p = new Placeholder(1)
    m.parent = p
    m.insertBefore('\n')
    {
      let s = c('start ${1:foo}')
      p = s.children[1] as Placeholder
      p.insertBefore('\n')
      let t = s.children[0] as Text
      assert.equal(t.value, 'start \n')
    }
    {
      let s = c('${1:foo} end')
      p = s.children[0] as Placeholder
      p.insertBefore('\n')
      let t = s.children[0] as Text
      assert.equal(t.value, '\n')
    }
  })

  test('Parser, hasCodeBlock()', () => {
    const c = text => {
      return (new SnippetParser(true)).parse(text)
    }
    assert.equal(c('${1:`!p foo`}').hasCodeBlock, true)
    assert.equal(c('`!p foo`').hasCodeBlock, true)
    assert.equal(c('$1').hasCodeBlock, false)
    let s = (new SnippetParser(false)).parse('`!p foo`', true)
    assert.strictEqual(s.hasCodeBlock, false)
    let len = s.fullLen(s.children[1])
    assert.strictEqual(len, 0)
  })

  test('Parser, resolved variable', async () => {
    const c = text => {
      return (new SnippetParser(true)).parse(text)
    }
    let s = c('${1:${VISUAL}} $1')
    assert.ok(s.children[0] instanceof Placeholder)
    assert.ok(s.children[0].children[0] instanceof Variable)
    let v = s.children[0].children[0] as Variable
    assert.equal(v.name, 'VISUAL')
    {
      let s = c('`!p`')
      let m = s.children[0] as CodeBlock
      await m.resolve(undefined as any)
    }
  })

  test('Parser, convert and resolve variables', async () => {
    const c = text => {
      return (new SnippetParser(false)).parse(text)
    }
    {
      let s = c('${1:${foo}x${foo:bar}} $1')
      await s.resolveVariables({
        resolve: async (variable) => {
          if (variable.name == 'foo') return 'f'
          return undefined
        }
      })
      assert.equal(s.placeholders[0].children.length, 1)
      assert.equal(s.toString(), 'fxf fxf')
    }
    {
      let s = c('${myname/(.*)$/${1:/capitalize}/}')
      let variable = s.children[0] as Variable
      variable.appendChild(new Text(''))
      expect(s.toTextmateString()).toBe('${myname:/(.*)$/${1:/capitalize}/}')
      s = s.clone()
      await s.resolveVariables({
        resolve: async (_variable) => {
          return undefined
        }
      })
      expect(s.toString()).toBe('Myname')
    }
  })

  test('Parser, resolved ultisnip variable', async () => {
    const c = text => {
      return (new SnippetParser(true)).parse(text)
    }
    let s = c('${VISUAL/\\w+\\s*/\\u$0\\\\x/} ${visual}')
    await s.resolveVariables({
      resolve: async (variable) => {
        if (variable.name === 'VISUAL') return 'visual'
        return ''
      }
    })
    expect(s.clone().toString()).toBe('Visual\\x ${visual}')
  })

  test('Parser variable with code', () => {
    // not allowed on ultisnips.
    const c = text => {
      return (new SnippetParser(true)).parse(text)
    }
    let s = c('${foo:`!p snip.rv = "bar"`}')
    assert.ok(s.children[0] instanceof Text)
    assert.ok(s.children[1] instanceof CodeBlock)
  })

  test('Parser, transform condition if text', () => {
    const p = new SnippetParser(true)
    let snip = p.parse('begin|${1:t}${1/(t)$|(a)$|(.*)/(?1:abular)(?2:rray)/}')
    expect(snip.toString()).toBe('begin|tabular')
    let m = snip.placeholders.find(o => o.index == 1 && o.primary)
    m.setOnlyChild(new Text('a'))
    snip.onPlaceholderUpdate(m)
    expect(snip.toString()).toBe('begin|array')
  })

  test('Parser, transform condition not match', () => {
    const p = new SnippetParser(true)
    let snip = p.parse('${1:xyz} ${1/^(f)(b?)/(?2:_:two)/}')
    expect(snip.toString()).toBe('xyz xyz')
  })

  test('Parser, transform backslash in condition', () => {
    const p = new SnippetParser(true)
    let snip = p.parse('${1:foo} ${1/^(f)/(?1:x\\)\\:a:two)/}')
    expect(snip.toString()).toBe('foo x):aoo')
  })

  test('Parser, transform backslash in format string', () => {
    const p = new SnippetParser(true)
    let snip = p.parse('${1:\\n} ${1/^(\\\\n)/$1aa/}')
    expect(snip.toString()).toBe('\\n \\naa')
  })

  test('Parser, ultisnips transform replacement', () => {
    const p = new SnippetParser(true)
    let snip = p.parse('${1:foo} ${1/^\\w/$0_/}')
    expect(snip.toString()).toBe('foo f_oo')
    snip = p.parse('${1:foo} ${1/^\\w//}')
    expect(snip.toString()).toBe('foo oo')
    snip = p.parse('${1:Foo} ${1/^(\\w+)$/\\u$1 (?1:-\\l$1)/g}')
    expect(snip.toString()).toBe('Foo Foo -foo')
  })


  test('Parser, convert ultisnips regex', () => {
    const p = new SnippetParser(true)
    let snip = p.parse('${1:foo} ${1/^\\A/_/}')
    expect(snip.toString()).toBe('foo _foo')
  })

  test('Parser, transform condition else text', () => {
    const p = new SnippetParser(true)
    let snip = p.parse('${1:foo} ${1/^(f)(b?)/(?2:_:two)/}')
    expect(snip.toString()).toBe('foo twooo')
    let m = snip.placeholders.find(o => o.index == 1 && o.primary)
    m.setOnlyChild(new Text('fb'))
    snip.onPlaceholderUpdate(m)
    expect(snip.toString()).toBe('fb _')
  })

  test('Parser, transform escape sequence', () => {
    const p = new SnippetParser(true)
    const snip = p.parse('${1:a text}\n${1/\\w+\\s*/\\u$0/}')
    expect(snip.toString()).toBe('a text\nA text')
  })

  test('Parser, transform backslash', () => {
    const p = new SnippetParser(true)
    const snip = p.parse('${1:a}\n${1/\\w+/\\(\\)\\:\\x\\\\y/}')
    expect(snip.toString()).toBe('a\n():\\x\\y')
  })

  test('Parser, transform with ascii option', () => {
    let p = new SnippetParser()
    let snip = p.parse('${1:pêche}\n${1/.*/$0/a}')
    expect(snip.toString()).toBe('pêche\npeche')
    p = new SnippetParser()
    snip = p.parse('${1/.*/$0/a}\n${1:pêche}')
    expect(snip.toString()).toBe('peche\npêche')
  })

  test('Parser, placeholder with transform', () => {
    const p = new SnippetParser()
    const snippet = p.parse('${1:type}${1/(.+)/ /}')
    let s = snippet.toString()
    assert.equal(s.length, 5)
  })

  test('Parser, placeholder transforms', function() {
    assertTextAndMarker('${1///}', '', Placeholder)
    assertTextAndMarker('${1/regex/format/gmi}', '', Placeholder)
    assertTextAndMarker('${1/([A-Z][a-z])/format/}', '', Placeholder)
    assertTextAndMarker('${1///}', '', Placeholder)

    // tricky regex
    assertTextAndMarker('${1/m\\/atch/$1/i}', '', Placeholder)
    assertMarker('${1/regex\/format/options}', Text)

    // incomplete
    assertTextAndMarker('${1///', '${1///', Text)
    assertTextAndMarker('${1/regex/format/options', '${1/regex/format/options', Text)
  })

  test('No way to escape forward slash in snippet regex #36715', function() {
    assertMarker('${TM_DIRECTORY/src\\//$1/}', Variable)
  })

  test('No way to escape forward slash in snippet format section #37562', function() {
    assertMarker('${TM_SELECTED_TEXT/a/\\/$1/g}', Variable)
    assertMarker('${TM_SELECTED_TEXT/a/in\\/$1ner/g}', Variable)
    assertMarker('${TM_SELECTED_TEXT/a/end\\//g}', Variable)
  })

  test('Parser, placeholder with choice', () => {

    assertTextAndMarker('${1|one,two,three|}', 'one', Placeholder)
    assertTextAndMarker('${1|one|}', 'one', Placeholder)
    assertTextAndMarker('${1|one1,two2|}', 'one1', Placeholder)
    assertTextAndMarker('${1|one1\\,two2|}', 'one1,two2', Placeholder)
    assertTextAndMarker('${1|one1\\|two2|}', 'one1|two2', Placeholder)
    assertTextAndMarker('${1|one1\\atwo2|}', 'one1\\atwo2', Placeholder)
    assertTextAndMarker('${1|one,two,three,|}', '${1|one,two,three,|}', Text)
    assertTextAndMarker('${1|one,', '${1|one,', Text)

    const p = new SnippetParser()
    const snippet = p.parse('${1|one,two,three|}')
    assertMarker(snippet, Placeholder)
    const expected = [Placeholder, Text, Text, Text]
    snippet.walk(marker => {
      assert.equal(marker, expected.shift())
      return true
    })
  })

  test('Snippet choices: unable to escape comma and pipe, #31521', function() {
    assertTextAndMarker('console.log(${1|not\\, not, five, 5, 1   23|});', 'console.log(not, not);', Text, Placeholder, Text)
  })

  test('Marker, basic toTextmateString', function() {

    function assertTextsnippetString(input: string, expected: string): void {
      const snippet = new SnippetParser().parse(input)
      const actual = snippet.toTextmateString()
      assert.equal(actual, expected)
    }

    assertTextsnippetString('$1', '$1')
    assertTextsnippetString('\\$1', '\\$1')
    assertTextsnippetString('console.log(${1|not\\, not, five, 5, 1   23|});', 'console.log(${1|not\\, not, five, 5, 1   23|});')
    assertTextsnippetString('console.log(${1|not\\, not, \\| five, 5, 1   23|});', 'console.log(${1|not\\, not, \\| five, 5, 1   23|});')
    assertTextsnippetString('this is text', 'this is text')
    assertTextsnippetString('this ${1:is ${2:nested with $var}}', 'this ${1:is ${2:nested with ${var}}}')
    assertTextsnippetString('this ${1:is ${2:nested with $var}}}', 'this ${1:is ${2:nested with ${var}}}\\}')
    {
      const snippet = new SnippetParser(true).parse('${1:Foo} ${1/^(\\w+)$/\\x\\u$1/g}')
      const actual = snippet.children[2].toTextmateString()
      expect(actual).toBe('${1:\\\\xFoo/^(\\w+)$/\\\\x\\u${1}/g}')
    }
  })

  test('Marker, toTextmateString() <-> identity', function() {

    function assertIdent(input: string): void {
      // full loop: (1) parse input, (2) generate textmate string, (3) parse, (4) ensure both trees are equal
      const snippet = new SnippetParser().parse(input)
      const input2 = snippet.toTextmateString()
      const snippet2 = new SnippetParser().parse(input2)

      function checkCheckChildren(marker1: Marker, marker2: Marker) {
        assert.ok(marker1 instanceof Object.getPrototypeOf(marker2).constructor)
        assert.ok(marker2 instanceof Object.getPrototypeOf(marker1).constructor)

        assert.equal(marker1.children.length, marker2.children.length)
        assert.equal(marker1.toString(), marker2.toString())

        for (let i = 0; i < marker1.children.length; i++) {
          checkCheckChildren(marker1.children[i], marker2.children[i])
        }
      }

      checkCheckChildren(snippet, snippet2)
    }

    assertIdent('$1')
    assertIdent('\\$1')
    assertIdent('console.log(${1|not\\, not, five, 5, 1   23|});')
    assertIdent('console.log(${1|not\\, not, \\| five, 5, 1   23|});')
    assertIdent('this is text')
    assertIdent('this ${1:is ${2:nested with $var}}')
    assertIdent('this ${1:is ${2:nested with $var}}}')
    assertIdent('this ${1:is ${2:nested with $var}} and repeating $1')
  })

  test('Parser, choice marker', () => {
    const { placeholders } = new SnippetParser().parse('${1|one,two,three|}')

    assert.equal(placeholders.length, 1)
    assert.ok(placeholders[0].choice instanceof Choice)
    assert.ok(placeholders[0].choice.clone() instanceof Choice)
    assert.ok(placeholders[0].children[0] instanceof Choice)
    assert.equal((<Choice>placeholders[0].children[0]).options.length, 3)

    assertText('${1|one,two,three|}', 'one')
    assertText('\\${1|one,two,three|}', '${1|one,two,three|}')
    assertText('${1\\|one,two,three|}', '${1\\|one,two,three|}')
    assertText('${1||}', '${1||}')
  })

  test('Backslash character escape in choice tabstop doesn\'t work #58494', function() {

    const { placeholders } = new SnippetParser().parse('${1|\\,,},$,\\|,\\\\|}')
    assert.equal(placeholders.length, 1)
    assert.ok(placeholders[0].choice instanceof Choice)
  })

  test('Parser, only textmate', () => {
    const p = new SnippetParser()
    assertMarker(p.parse('far{{}}boo'), Text)
    assertMarker(p.parse('far{{123}}boo'), Text)
    assertMarker(p.parse('far\\{{123}}boo'), Text)

    assertMarker(p.parse('far$0boo'), Text, Placeholder, Text)
    assertMarker(p.parse('far${123}boo'), Text, Placeholder, Text)
    assertMarker(p.parse('far\\${123}boo'), Text)
  })

  test('Parser, real world', () => {
    let marker = new SnippetParser().parse('console.warn(${1: $TM_SELECTED_TEXT })').children

    assert.equal(marker[0].toString(), 'console.warn(')
    assert.ok(marker[1] instanceof Placeholder)
    assert.equal(marker[2].toString(), ')')

    const placeholder = <Placeholder>marker[1]
    assert.equal(placeholder, false)
    assert.equal(placeholder.index, '1')
    assert.equal(placeholder.children.length, 3)
    assert.ok(placeholder.children[0] instanceof Text)
    assert.ok(placeholder.children[1] instanceof Variable)
    assert.ok(placeholder.children[1].clone() instanceof Variable)
    assert.ok(placeholder.children[2] instanceof Text)
    assert.equal(placeholder.children[0].toString(), ' ')
    assert.equal(placeholder.children[1].toString(), '')
    assert.equal(placeholder.children[2].toString(), ' ')

    const nestedVariable = <Variable>placeholder.children[1]
    assert.equal(nestedVariable.name, 'TM_SELECTED_TEXT')
    assert.equal(nestedVariable.children.length, 0)

    marker = new SnippetParser().parse('$TM_SELECTED_TEXT').children
    assert.equal(marker.length, 1)
    assert.ok(marker[0] instanceof Variable)
  })

  test('Parser, transform example', () => {
    let { children } = new SnippetParser().parse('${1:name} : ${2:type}${3/\\s:=(.*)/${1:+ :=}${1}/};\n$0')

    //${1:name}
    assert.ok(children[0] instanceof Placeholder)
    assert.equal(children[0].children.length, 1)
    assert.equal(children[0].children[0].toString(), 'name')
    assert.equal((<Placeholder>children[0]).transform, undefined)

    // :
    assert.ok(children[1] instanceof Text)
    assert.equal(children[1].toString(), ' : ')

    //${2:type}
    assert.ok(children[2] instanceof Placeholder)
    assert.equal(children[2].children.length, 1)
    assert.equal(children[2].children[0].toString(), 'type')

    //${3/\\s:=(.*)/${1:+ :=}${1}/}
    assert.ok(children[3] instanceof Placeholder)
    assert.equal(children[3].children.length, 1)
    assert.notEqual((<Placeholder>children[3]).transform, undefined)
    let transform = (<Placeholder>children[3]).transform
    assert.equal(transform.regexp, '/\\s:=(.*)/')
    assert.equal(transform.children.length, 2)
    assert.ok(transform.children[0] instanceof FormatString)
    assert.equal((<FormatString>transform.children[0]).index, 1)
    assert.equal((<FormatString>transform.children[0]).ifValue, ' :=')
    assert.ok(transform.children[1] instanceof FormatString)
    assert.equal((<FormatString>transform.children[1]).index, 1)
    assert.ok(children[4] instanceof Text)
    assert.equal(children[4].toString(), ';\n')

  })

  test('Parser, ConditionString', () => {
    assert.ok(ConditionString != undefined)
    let s = new ConditionString(0, 'if', 'else')
    assert.strictEqual(s.toTextmateString(), '(?0:if:else)')
    s = new ConditionString(0, 'if', '')
    assert.strictEqual(s.clone().toTextmateString(), '(?0:if)')
    // invalid examples
    assertText('$1 ${1/.*/(?p:foo:bar)/}', ' (?p:foo:bar)', true)
    assertText('$1 ${1/.*/(?1foobar)/}', ' (?1foobar)', true)
    assertText('$1 ${1/.*/(?1:foo:bar/}', ' (?1:foo:bar', true)
    assertText('$1 ${1/.*/', ' ${1/.*/', true)
    assertText('${foo', '${foo')
    assertText('$foo', '$foo', true)
    assertText('${foo}', '${foo}', true)
    assertText('$1 ${1/.*/(?1:', ' ${1/.*/(?1:', true)
  })

  test('Parser, FormatString', () => {
    let { children } = new SnippetParser().parse('${foo/^x/complex${1:?if:else}/i}')
    let transform = children[0]['transform'] as Transform
    let res = transform.resolve('y')
    assert.strictEqual(res, 'complexelse')
    let formatString = transform.children[1] as FormatString
    assert.strictEqual(formatString.toTextmateString(), '${1:?if:else}')
    let assertResolve = (shorthandName: string, value: string, result: string) => {
      let formatString = new FormatString(0, shorthandName)
      assert.strictEqual(formatString.resolve(value), result)
      assert.ok(formatString.toTextmateString().includes(shorthandName))
    }
    assertResolve('upcase', '', '')
    assertResolve('downcase', '', '')
    assertResolve('capitalize', '', '')
    assertResolve('pascalcase', '', '')
    assertResolve('pascalcase', '', '')
    assertResolve('pascalcase', '1', '1')
    let f = new FormatString(0, undefined, 'if', undefined)
    assert.strictEqual(f.toTextmateString(), '${0:+if}')
    f = new FormatString(0, undefined, undefined, 'else')
    assert.strictEqual(f.toTextmateString(), '${0:-else}')
  })

  test('Parser, default placeholder values', () => {

    assertMarker('errorContext: `${1:err}`, error: $1', Text, Placeholder, Text, Placeholder)

    const [, p1, , p2] = new SnippetParser().parse('errorContext: `${1:err}`, error:$1').children

    assert.equal((<Placeholder>p1).index, '1')
    assert.equal((<Placeholder>p1).children.length, '1')
    assert.equal((<Text>(<Placeholder>p1).children[0]), 'err')

    assert.equal((<Placeholder>p2).index, '1')
    assert.equal((<Placeholder>p2).children.length, '1')
    assert.equal((<Text>(<Placeholder>p2).children[0]), 'err')
  })

  test('Parser, default placeholder values and one transform', () => {

    assertMarker('errorContext: `${1:err}`, error: ${1/err/ok/}', Text, Placeholder, Text, Placeholder)

    const [, p3, , p4] = new SnippetParser().parse('errorContext: `${1:err}`, error:${1/err/ok/}').children

    assert.equal((<Placeholder>p3).index, '1')
    assert.equal((<Placeholder>p3).children.length, '1')
    assert.equal((<Text>(<Placeholder>p3).children[0]), 'err')
    assert.equal((<Placeholder>p3).transform, undefined)

    assert.equal((<Placeholder>p4).index, '1')
    assert.equal((<Placeholder>p4).children.length, '1')
    assert.equal((<Text>(<Placeholder>p4).children[0]), 'ok')
    assert.notEqual((<Placeholder>p4).transform, undefined)
  })

  test('Repeated snippet placeholder should always inherit, #31040', function() {
    assertText('${1:foo}-abc-$1', 'foo-abc-foo')
    assertText('${1:foo}-abc-${1}', 'foo-abc-foo')
    assertText('${1:foo}-abc-${1:bar}', 'foo-abc-foo')
    assertText('${1}-abc-${1:foo}', 'foo-abc-foo')
  })

  test('backspace esapce in TM only, #16212', () => {
    const actual = new SnippetParser().text('Foo \\\\${abc}bar')
    assert.equal(actual, 'Foo \\bar')
  })

  test('colon as variable/placeholder value, #16717', () => {
    let actual = new SnippetParser().text('${TM_SELECTED_TEXT:foo:bar}')
    assert.equal(actual, 'foo:bar')

    actual = new SnippetParser().text('${1:foo:bar}')
    assert.equal(actual, 'foo:bar')
  })

  test('incomplete placeholder', () => {
    assertTextAndMarker('${1:}', '', Placeholder)
  })

  test('marker#len', () => {

    function assertLen(template: string, ...lengths: number[]): void {
      const snippet = new SnippetParser().parse(template, true)
      snippet.walk(m => {
        const expected = lengths.shift()
        assert.equal(m.len(), expected)
        return true
      })
      assert.equal(lengths.length, 0)
    }

    assertLen('text$0', 4, 0)
    assertLen('$1text$0', 0, 4, 0)
    assertLen('te$1xt$0', 2, 0, 2, 0)
    assertLen('errorContext: `${1:err}`, error: $0', 15, 0, 3, 10, 0)
    assertLen('errorContext: `${1:err}`, error: $1$0', 15, 0, 3, 10, 0, 3, 0)
    assertLen('$TM_SELECTED_TEXT$0', 0, 0)
    assertLen('${TM_SELECTED_TEXT:def}$0', 0, 3, 0)
  })

  test('marker#replaceWith', () => {
    let m = new Placeholder(1)
    expect(m.replaceWith(new Text(''))).toBe(false)
    let p = new Placeholder(2)
    p.appendChild(m)
    p.replaceChildren([])
    expect(m.replaceWith(new Text(''))).toBe(false)
  })

  test('parser, parent node', function() {
    let snippet = new SnippetParser().parse('This ${1:is ${2:nested}}$0', true)

    assert.equal(snippet.placeholders.length, 3)
    let [first, second] = snippet.placeholders
    assert.equal(first.index, '1')
    assert.equal(second.index, '2')
    assert.ok(second.parent === first)
    assert.ok(first.parent === snippet)

    snippet = new SnippetParser().parse('${VAR:default${1:value}}$0', true)
    assert.equal(snippet.placeholders.length, 2)
      ;[first] = snippet.placeholders
    assert.equal(first.index, '1')

    assert.ok(snippet.children[0] instanceof Variable)
    assert.ok(first.parent === snippet.children[0])
  })

  test('Maximum call stack size exceeded, #28983', () => {
    new SnippetParser().parse('${1:${foo:${1}}}')
  })

  test('Snippet can freeze the editor, #30407', () => {
    const seen = new Set<Marker>()
    seen.clear()
    new SnippetParser().parse('class ${1:${TM_FILENAME/(?:\\A|_)([A-Za-z0-9]+)(?:\\.rb)?/(?2::\\u$1)/g}} < ${2:Application}Controller\n  $3\nend').walk(marker => {
      assert.ok(!seen.has(marker))
      seen.add(marker)
      return true
    })

    seen.clear()
    new SnippetParser().parse('${1:${FOO:abc$1def}}').walk(marker => {
      assert.ok(!seen.has(marker))
      seen.add(marker)
      return true
    })
  })

  test('Snippets: make parser ignore `${0|choice|}`, #31599', function() {
    assertTextAndMarker('${0|foo,bar|}', '${0|foo,bar|}', Text)
    assertTextAndMarker('${1|foo,bar|}', 'foo', Placeholder)
  })


  test('Transform -> FormatString#resolve', function() {

    // shorthand functions
    assert.equal(new FormatString(1, 'upcase').resolve('foo'), 'FOO')
    assert.equal(new FormatString(1, 'downcase').resolve('FOO'), 'foo')
    assert.equal(new FormatString(1, 'capitalize').resolve('bar'), 'Bar')
    assert.equal(new FormatString(1, 'capitalize').resolve('bar no repeat'), 'Bar no repeat')
    assert.equal(new FormatString(1, 'pascalcase').resolve('bar-foo'), 'BarFoo')
    assert.equal(new FormatString(1, 'notKnown').resolve('input'), 'input')

    // if
    assert.equal(new FormatString(1, undefined, 'foo', undefined).resolve(undefined), '')
    assert.equal(new FormatString(1, undefined, 'foo', undefined).resolve(''), '')
    assert.equal(new FormatString(1, undefined, 'foo', undefined).resolve('bar'), 'foo')

    // else
    assert.equal(new FormatString(1, undefined, undefined, 'foo').resolve(undefined), 'foo')
    assert.equal(new FormatString(1, undefined, undefined, 'foo').resolve(''), 'foo')
    assert.equal(new FormatString(1, undefined, undefined, 'foo').resolve('bar'), 'bar')

    // if-else
    assert.equal(new FormatString(1, undefined, 'bar', 'foo').resolve(undefined), 'foo')
    assert.equal(new FormatString(1, undefined, 'bar', 'foo').resolve(''), 'foo')
    assert.equal(new FormatString(1, undefined, 'bar', 'foo').resolve('baz'), 'bar')
  })

  test('Snippet variable transformation doesn\'t work if regex is complicated and snippet body contains \'$$\' #55627', function() {
    const snippet = new SnippetParser().parse('const fileName = "${TM_FILENAME/(.*)\\..+$/$1/}"')
    assert.equal(snippet.toTextmateString(), 'const fileName = "${TM_FILENAME/(.*)\\..+$/${1}/}"')
  })

  test('[BUG] HTML attribute suggestions: Snippet session does not have end-position set, #33147', function() {

    const { placeholders } = new SnippetParser().parse('src="$1"', true)
    const [first, second] = placeholders

    assert.equal(placeholders.length, 2)
    assert.equal(first.index, 1)
    assert.equal(second.index, 0)

  })

  test('Snippet optional transforms are not applied correctly when reusing the same variable, #37702', function() {

    const transform = new Transform()
    assert.strictEqual(transform.toString(), '')
    transform.appendChild(new FormatString(1, 'upcase'))
    transform.appendChild(new FormatString(2, 'upcase'))
    transform.regexp = /^(.)|-(.)/g

    assert.equal(transform.resolve('my-file-name'), 'MyFileName')

    const clone = transform.clone()
    assert.equal(clone.resolve('my-file-name'), 'MyFileName')
    transform.regexp = /^(.)|-(.)/i
    assert.strictEqual(transform.clone().regexp.ignoreCase, true)
  })

  test('problem with snippets regex #40570', function() {

    const snippet = new SnippetParser().parse('${TM_DIRECTORY/.*src[\\/](.*)/$1/}')
    assertMarker(snippet, Variable)
  })

  test('Variable transformation doesn\'t work if undefined variables are used in the same snippet #51769', function() {
    let transform = new Transform()
    transform.appendChild(new Text('bar'))
    transform.regexp = new RegExp('foo', 'gi')
    assert.equal(transform.toTextmateString(), '/foo/bar/ig')
  })

  test('Snippet parser freeze #53144', function() {
    let snippet = new SnippetParser().parse('${1/(void$)|(.+)/${1:?-\treturn nil;}/}')
    assertMarker(snippet, Placeholder)
  })

  test('snippets variable not resolved in JSON proposal #52931', function() {
    assertTextAndMarker('FOO${1:/bin/bash}', 'FOO/bin/bash', Text, Placeholder)
  })

  test('Mirroring sequence of nested placeholders not selected properly on backjumping #58736', function() {
    let snippet = new SnippetParser().parse('${3:nest1 ${1:nest2 ${2:nest3}}} $3')
    assert.equal(snippet.children.length, 3)
    assert.ok(snippet.children[0] instanceof Placeholder)
    assert.ok(snippet.children[1] instanceof Text)
    assert.ok(snippet.children[2] instanceof Placeholder)

    function assertParent(marker: Marker) {
      marker.children.forEach(assertParent)
      if (!(marker instanceof Placeholder)) {
        return
      }
      let found = false
      let m: Marker = marker
      while (m && !found) {
        if (m.parent === snippet) {
          found = true
        }
        m = m.parent
      }
      assert.ok(found)
    }
    let [, , clone] = snippet.children
    assertParent(clone)
  })
})

describe('TextmateSnippet', () => {
  test('TextmateSnippet#enclosingPlaceholders', () => {
    let snippet = new SnippetParser().parse('This ${1:is ${2:nested}}$0', true)
    let [first, second] = snippet.placeholders

    assert.deepEqual(snippet.enclosingPlaceholders(first), [])
    assert.deepEqual(snippet.enclosingPlaceholders(second), [first])
  })

  test('TextmateSnippet#getTextBefore', () => {
    let snippet = new SnippetParser().parse('This ${1:is ${2:nested}}$0', true)
    expect(snippet.getTextBefore(snippet, undefined)).toBe('')
    let [first, second] = snippet.placeholders
    expect(snippet.getTextBefore(second, first)).toBe('is ')
    snippet = new SnippetParser().parse('This ${1:foo ${2:is ${3:nested}}} $0', true)
    let arr = snippet.placeholders
    expect(snippet.getTextBefore(arr[2], arr[0])).toBe('foo is ')
  })

  test('TextmateSnippet#offset', () => {
    let snippet = new SnippetParser().parse('te$1xt', true)
    assert.equal(snippet.offset(snippet.children[0]), 0)
    assert.equal(snippet.offset(snippet.children[1]), 2)
    assert.equal(snippet.offset(snippet.children[2]), 2)

    snippet = new SnippetParser().parse('${TM_SELECTED_TEXT:def}', true)
    assert.equal(snippet.offset(snippet.children[0]), 0)
    assert.equal(snippet.offset((<Variable>snippet.children[0]).children[0]), 0)

    // foreign marker
    assert.equal(snippet.offset(new Text('foo')), -1)
  })

  test('TextmateSnippet#placeholder', () => {
    let snippet = new SnippetParser().parse('te$1xt$0', true)
    let placeholders = snippet.placeholders
    assert.equal(placeholders.length, 2)

    snippet = new SnippetParser().parse('te$1xt$1$0', true)
    placeholders = snippet.placeholders
    assert.equal(placeholders.length, 3)


    snippet = new SnippetParser().parse('te$1xt$2$0', true)
    placeholders = snippet.placeholders
    assert.equal(placeholders.length, 3)

    snippet = new SnippetParser().parse('${1:bar${2:foo}bar}$0', true)
    placeholders = snippet.placeholders
    assert.equal(placeholders.length, 3)
  })

  test('TextmateSnippet#replace 1/2', function() {
    let snippet = new SnippetParser().parse('aaa${1:bbb${2:ccc}}$0', true)

    assert.equal(snippet.placeholders.length, 3)
    const [, second] = snippet.placeholders
    assert.equal(second.index, '2')

    const enclosing = snippet.enclosingPlaceholders(second)
    assert.equal(enclosing.length, 1)
    assert.equal(enclosing[0].index, '1')
    let marker = snippet.placeholders.find(o => o.index == 2)
    let nested = new SnippetParser().parse('ddd$1eee', false)
    let err
    try {
      snippet.replace(marker, nested.children)
    } catch (e) {
      err = e
    }
    expect(err).toBeDefined()
  })

  test('TextmateSnippet#replace 2/2', () => {
    let snippet = new SnippetParser().parse('aaa${1:bbb${2:ccc}}$0', true)

    assert.equal(snippet.placeholders.length, 3)
    const [, second] = snippet.placeholders
    assert.equal(second.index, '2')

    let nested = new SnippetParser().parse('dddeee$0', true)
    snippet.replace(second, nested.children)

    assert.equal(snippet.toString(), 'aaabbbdddeee')
    assert.equal(snippet.placeholders.length, 4)
  })

  test('TextmateSnippet replace variable with placeholder', async () => {
    let snippet = new SnippetParser().parse('|${1:${foo}} ${foo} $1 ${bar}|', true)
    await snippet.resolveVariables({
      resolve: _variable => {
        return undefined
      }
    })
    let placeholders = snippet.placeholders
    let indexes = placeholders.map(o => o.index)
    expect(indexes).toEqual([1, 2, 2, 1, 3, 0])
    let p = placeholders.find(o => o.index == 2 && o.primary)
    p.setOnlyChild(new Text('x'))
    snippet.onPlaceholderUpdate(p)
    expect(snippet.toString()).toBe('|x x x bar|')
  })

  test('mergeTexts()', () => {
    let m = new TextmateSnippet(false)
    m.replaceChildren([
      new Text('c'),
      new Placeholder(1),
      new Text('a'),
      new Text('b'),
      new Placeholder(2),
      new Text('c'),
      new Text(''),
      new Text('d'),
      new Text('e')
    ])
    mergeTexts(m, 0)
    expect(m.hasPythonBlock).toBe(false)
    expect(m.hasCodeBlock).toBe(false)
    expect(m.children.length).toBe(5)
    expect(m.children[2].toString()).toBe('ab')
    expect(m.children[4].toString()).toBe('cde')
  })

  test('getPlaceholderId', () => {
    const p = new Placeholder(1)
    let id = getPlaceholderId(p)
    expect(typeof id).toBe('number')
    expect(p.id).toBe(id)
    expect(getPlaceholderId(p)).toBe(id)
  })
})
