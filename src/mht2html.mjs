/**
 * mht2html
 *
 * @Author : Simon
 * @Version : 1.0.0
 * @Date : 2024-04-01
 * @Description : Converts mhtml to html.
 * @Original : Mayank Sindwani https://github.com/msindwan/mhtml2html
 * @Changes :
 * - remove node.js support
 * - remove all dependencies
 * - remove bundlers
 * - use native mjs module
 *
 * Licensed under the MIT License
 * Copyright(c) 2024 Simon
 * Copyright(c) 2016 Mayank Sindwani
 **/

/**
 * css 等 文本资源 会被保存为 quoted-printable 编码
 * @license MIT
 * @link https://github.com/mathiasbynens/quoted-printable/blob/master/src/quoted-printable.js
 */
function decodeQuotedPrintable(input) {
	return (
		input
			// https://tools.ietf.org/html/rfc2045#section-6.7, rule 3:
			// “Therefore, when decoding a `Quoted-Printable` body, any trailing white
			// space on a line must be deleted, as it will necessarily have been added
			// by intermediate transport agents.”
			.replace(/[\t\x20]$/gm, '')
			// Remove hard line breaks preceded by `=`. Proper `Quoted-Printable`-
			// encoded data only contains CRLF line  endings, but for compatibility
			// reasons we support separate CR and LF too.
			.replace(/=(?:\r\n?|\n|$)/g, '')
			// Decode escape sequences of the form `=XX` where `XX` is any
			// combination of two hexidecimal digits. For optimal compatibility,
			// lowercase hexadecimal digits are supported as well. See
			// https://tools.ietf.org/html/rfc2045#section-6.7, note 1.
			.replace(/=([a-fA-F0-9]{2})/g, function ($0, $1) {
				var codePoint = parseInt($1, 16)
				return String.fromCharCode(codePoint)
			})
	)
}

// Asserts a condition.
function assert(condition, error) {
	if (!condition) {
		throw new Error(error)
	}
	return true
}

// Default DOM parser (browser only).
function parseDOM(asset) {
	assert(typeof DOMParser !== 'undefined', 'No DOM parser available')
	return new DOMParser().parseFromString(asset, 'text/html')
}

// Returns an absolute url from base and relative paths.
function absoluteURL(base, relative) {
	if (
		relative.indexOf('http://') === 0 ||
		relative.indexOf('https://') === 0
	) {
		return relative
	}

	const stack = base.split('/')
	const parts = relative.split('/')

	stack.pop()

	for (let i = 0; i < parts.length; i++) {
		if (parts[i] == '.') {
			continue
		} else if (parts[i] == '..') {
			stack.pop()
		} else {
			stack.push(parts[i])
		}
	}

	return stack.join('/')
}

// Replace asset references with the corresponding data.
function replaceReferences(media, base, asset) {
	const CSS_URL_RULE = 'url('
	let reference, i

	for (
		i = 0;
		(i = asset.indexOf(CSS_URL_RULE, i)) > 0;
		i += reference.length
	) {
		i += CSS_URL_RULE.length
		reference = asset.substring(i, asset.indexOf(')', i))

		// Get the absolute path of the referenced asset.
		const path = absoluteURL(base, reference.replace(/(\"|\')/g, ''))
		if (media[path] != null) {
			if (media[path].type === 'text/css') {
				media[path].data = replaceReferences(
					media,
					base,
					media[path].data,
				)
			}
			// Replace the reference with an encoded version of the resource.
			try {
				const embeddedAsset = `'data:${media[path].type};base64,${
					media[path].encoding === 'base64'
						? media[path].data
						: self.btoa(self.encodeURIComponent(media[path].data))
				}'`
				asset = `${asset.substring(
					0,
					i,
				)}${embeddedAsset}${asset.substring(i + reference.length)}`
			} catch (e) {
				console.warn(e)
			}
		}
	}
	return asset
}

// Converts the provided asset to a data URI based on the encoding.
function convertAssetToDataURI(asset) {
	switch (asset.encoding) {
		case 'quoted-printable':
			return `data:${asset.type};utf8,${escape(
				decodeQuotedPrintable(asset.data),
			)}`
		case 'base64':
			return `data:${asset.type};base64,${asset.data}`
		default:
			return `data:${asset.type};base64,${Base64.encode(asset.data)}`
	}
}

/**
 * Parse
 *
 * Description: Returns an object representing the mhtml and its resources.
 * @param {mhtml} // The mhtml string.
 * @param {options.htmlOnly} // Only handle and return html. Ignore static resources.
 * @returns an html document without resources if htmlOnly === true; an MHTML parsed object otherwise.
 */
const parse = (mhtml, { htmlOnly = false } = {}) => {
	const MHTML_FSM = {
		MHTML_HEADERS: 0,
		MTHML_CONTENT: 1,
		MHTML_DATA: 2,
		MHTML_END: 3,
	}

	let asset, headers, content, media, frames // Record-keeping.
	let location, encoding, type, id // Content properties.
	let state, key, next, index, i, l // States.
	let boundary // Boundaries.

	headers = {}
	content = {}
	media = {}
	frames = {}

	// Initial state and index.
	state = MHTML_FSM.MHTML_HEADERS
	i = l = 0

	// Discards characters until a non-whitespace character is encountered.
	function trim() {
		while (
			assert(i < mhtml.length - 1, 'Unexpected EOF') &&
			/\s/.test(mhtml[i])
		) {
			if (mhtml[++i] == '\n') {
				l++
			}
		}
	}

	// Returns the next line from the index.
	function getLine(encoding) {
		const j = i

		// Wait until a newline character is encountered or when we exceed the str length.
		while (
			mhtml[i] !== '\n' &&
			assert(i++ < mhtml.length - 1, 'Unexpected EOF')
		);
		i++
		l++

		const line = mhtml.substring(j, i)

		// Return the (decoded) line.
		if (encoding === 'quoted-printable') {
			return decodeQuotedPrintable(line)
		}
		if (encoding === 'base64') {
			return line.trim()
		}
		return line
	}

	// Splits headers from the first instance of ':'.
	function splitHeaders(line, obj) {
		const m = line.indexOf(':')
		if (m > -1) {
			key = line.substring(0, m).trim()
			obj[key] = line.substring(m + 1, line.length).trim()
		} else {
			assert(
				typeof key !== 'undefined',
				`Missing MHTML headers; Line ${l}`,
			)
			obj[key] += line.trim()
		}
	}

	while (state != MHTML_FSM.MHTML_END) {
		switch (state) {
			// Fetch document headers including the boundary to use.
			case MHTML_FSM.MHTML_HEADERS: {
				next = getLine()
				// Use a new line or null character to determine when we should
				// stop processing headers.
				if (next != 0 && next != '\n') {
					splitHeaders(next, headers)
				} else {
					assert(
						typeof headers['Content-Type'] !== 'undefined',
						`Missing document content type; Line ${l}`,
					)
					const matches =
						headers['Content-Type'].match(/boundary=(.*)/m)

					// Ensure the extracted boundary exists.
					assert(
						matches != null,
						`Missing boundary from document headers; Line ${l}`,
					)
					boundary = matches[1].replace(/\"/g, '')

					trim()
					next = getLine()

					// Expect the next boundary to appear.
					assert(
						next.includes(boundary),
						`Expected boundary; Line ${l}`,
					)
					content = {}
					state = MHTML_FSM.MTHML_CONTENT
				}
				break
			}

			// Parse and store content headers.
			case MHTML_FSM.MTHML_CONTENT: {
				next = getLine()

				// Use a new line or null character to determine when we should
				// stop processing headers.
				if (next != 0 && next != '\n') {
					splitHeaders(next, content)
				} else {
					encoding = content['Content-Transfer-Encoding']
					type = content['Content-Type']
					id = content['Content-ID']
					location = content['Content-Location']

					// Assume the first boundary to be the document.
					if (typeof index === 'undefined') {
						index = location
						assert(
							typeof index !== 'undefined' &&
								type === 'text/html',
							`Index not found; Line ${l}`,
						)
					}

					// Ensure the extracted information exists.
					assert(
						typeof id !== 'undefined' ||
							typeof location !== 'undefined',
						`ID or location header not provided;  Line ${l}`,
					)
					assert(
						typeof encoding !== 'undefined',
						`Content-Transfer-Encoding not provided;  Line ${l}`,
					)
					// assert(
					// 	typeof encoding !== 'quoted-printable',
					// 	`Quoted-printable encoding not supported; Line ${l}`,
					// )
					assert(
						typeof type !== 'undefined',
						`Content-Type not provided; Line ${l}`,
					)

					asset = {
						encoding: encoding,
						type: type,
						data: '',
						id: id,
					}

					// Keep track of frames by ID.
					if (typeof id !== 'undefined') {
						frames[id] = asset
					}

					// Keep track of resources by location.
					if (
						typeof location !== 'undefined' &&
						typeof media[location] === 'undefined'
					) {
						media[location] = asset
					}

					trim()
					content = {}
					state = MHTML_FSM.MHTML_DATA
				}
				break
			}

			// Map data to content.
			case MHTML_FSM.MHTML_DATA: {
				next = getLine(encoding)

				// Build the decoded string.
				while (!next.includes(boundary)) {
					asset.data += next
					next = getLine(encoding)
				}

				try {
					// Decode unicode.
					asset.data = decodeURIComponent(escape(asset.data))
				} catch (e) {
					e
				}

				// Ignore assets if 'htmlOnly' is set.
				if (htmlOnly === true && typeof index !== 'undefined') {
					return parseDOM(asset.data)
				}

				// Set the finishing state if there are no more characters.
				state =
					i >= mhtml.length - 1
						? MHTML_FSM.MHTML_END
						: MHTML_FSM.MTHML_CONTENT
				break
			}
		}
	}

	return {
		frames: frames,
		media: media,
		index: index,
	}
}

/**
 * Convert
 *
 * Description: Accepts an mhtml string or parsed object and returns the converted html.
 * @param {mhtml} // The mhtml string or object.
 * @param {options.convertIframes} // Whether or not to include iframes in the converted response (defaults to false).
 * @returns {Element} // The converted html document.
 */
export const convert = (mhtml, { convertIframes = false } = {}) => {
	let index, media, frames // Record-keeping.
	let style, base, img // DOM objects.
	let href, src // References.

	if (typeof mhtml === 'string') {
		mhtml = parse(mhtml)
	} else {
		assert(
			typeof mhtml === 'object',
			'Expected argument of type string or object',
		)
	}

	frames = mhtml.frames
	media = mhtml.media
	index = mhtml.index

	assert(typeof frames === 'object', 'MHTML error: invalid frames')
	assert(typeof media === 'object', 'MHTML error: invalid media')
	assert(typeof index === 'string', 'MHTML error: invalid index')
	assert(
		media[index] && media[index].type === 'text/html',
		'MHTML error: invalid index',
	)

	const documentElem = parseDOM(media[index].data)
	const nodes = [documentElem]

	// Merge resources into the document.
	while (nodes.length) {
		const childNode = nodes.shift()

		// Resolve each node.
		childNode.childNodes.forEach(function (child) {
			if (child.getAttribute) {
				href = child.getAttribute('href')
				src = child.getAttribute('src')
			}
			if (child.removeAttribute) {
				child.removeAttribute('integrity')
			}
			switch (child.tagName) {
				case 'HEAD':
					// Link targets should be directed to the outer frame.
					base = documentElem.createElement('base')
					base.setAttribute('target', '_parent')
					child.insertBefore(base, child.firstChild)
					break

				case 'LINK':
					if (
						typeof media[href] !== 'undefined' &&
						media[href].type === 'text/css'
					) {
						// Embed the css into the document.
						style = documentElem.createElement('style')
						style.type = 'text/css'
						media[href].data = replaceReferences(
							media,
							href,
							media[href].data,
						)
						style.appendChild(
							documentElem.createTextNode(media[href].data),
						)
						childNode.replaceChild(style, child)
					}
					break

				case 'STYLE':
					style = documentElem.createElement('style')
					style.type = 'text/css'
					style.appendChild(
						documentElem.createTextNode(
							replaceReferences(media, index, child.innerHTML),
						),
					)
					childNode.replaceChild(style, child)
					break

				case 'IMG':
					img = null
					if (
						typeof media[src] !== 'undefined' &&
						media[src].type.includes('image')
					) {
						// Embed the image into the document.
						try {
							img = convertAssetToDataURI(media[src])
						} catch (e) {
							console.warn(e)
						}
						if (img !== null) {
							child.setAttribute('src', img)
						}
					}
					child.style.cssText = replaceReferences(
						media,
						index,
						child.style.cssText,
					)
					break

				case 'IFRAME':
					if (convertIframes === true && src) {
						const id = `<${src.split('cid:')[1]}>`
						const frame = frames[id]

						if (frame && frame.type === 'text/html') {
							const iframe = convert(
								{
									media: Object.assign({}, media, {
										[id]: frame,
									}),
									frames: frames,
									index: id,
								},
								{ convertIframes },
							)
							child.src = `data:text/html;charset=utf-8,${encodeURIComponent(
								iframe.documentElement.outerHTML,
							)}`
						}
					}
					break

				default:
					if (child.style) {
						child.style.cssText = replaceReferences(
							media,
							index,
							child.style.cssText,
						)
					}
					break
			}
			nodes.push(child)
		})
	}
	return documentElem
}
