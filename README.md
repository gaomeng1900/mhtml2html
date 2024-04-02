# MHT 2 HTML

Convert MHTML to HTML. No dependencies. Support GBK Encoding.

Ported from [mhtml2html](https://github.com/msindwan/mhtml2html)

-   remove node.js support
-   remove all dependencies
-   remove bundlers. use native mjs module
-   support GBK encoding with native TextDecoder

## Usage

-   copy `src/mht2html.mjs` to your project, no dependencies needed
-   import `convert` function

```javascript
import { convert } from './mht2html.mjs'

const element = convert(mhtmlText, { convertIframes: true })
const html = '<!DOCTYPE html>\n' + element.documentElement.outerHTML
```

## GBK Encoding

```javascript
import { convert } from './mht2html.mjs'

const element = convert(mhtmlText, { convertIframes: true, enc: 'gbk' })
const html =
	'<!DOCTYPE html>\n' +
	element.documentElement.outerHTML.replace(/charset=GBK/g, 'charset=utf-8')
```

## Demo

-   npm i
-   npm start
-   check out `/demo/index.html`
