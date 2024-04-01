# MHT 2 HTML

Convert MHTML string to HTML string in browser.

Ported from [mhtml2html](https://github.com/msindwan/mhtml2html)

## Usage

-   copy `src/mht2html.mjs` to your project
-   import `convert` function

```javascript
import { convert } from './mht2html.mjs'

const element = convert(mhtmlText, { convertIframes: true })
const html = '<!DOCTYPE html>\n' + element.documentElement.outerHTML
```

## Demo

-   npm i
-   npm start
-   check out `/demo/index.html`
