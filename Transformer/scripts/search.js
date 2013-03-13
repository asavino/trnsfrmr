/*jslint browser: true, devel: true, todo: true */
/*global Settings, PageAction, replaceDates, window: false, chrome: false, $: false, KeyInfo: false */
	"use strict";
var settings;
var pageaction;
var abbrevMostRecentlyUsed = window.localStorage.mru ? JSON.parse(window.localStorage.mru) : new Array(10);

function updateMostRecentlyUsedList(key) {
	var keyOccurence = abbrevMostRecentlyUsed.filter(function(value, index, object) {
		return value === key;
	});
	if (keyOccurence.length === 0) {
		abbrevMostRecentlyUsed.pop();
		abbrevMostRecentlyUsed.unshift(key);
		window.localStorage.mru = JSON.stringify(abbrevMostRecentlyUsed);
	}
}

function getMostRecentlyUsedList() {
	return abbrevMostRecentlyUsed;
}

function findInputElements(elem) {
	for (var i = 0; i < elem.length; i++) {
		var type = elem[i].type;
		type.toLocaleLowerCase();
		if ((type === "text") || (type === "password") || (type === "textarea")) {
			return true;
		}
	}
	return false;
}

// FIXME Eliminate this global variable.
var unExpandedValue;

function extractKeyWord(str, s, e) {
	//  "use strict";
	var result = {};
	result.before = "";
	result.after = "";
	result.key = "";

	//  var s = element.selectionStart;
	//  var e = element.selectionEnd;
	//    var word;

	// if nothing is selected find word boundaries
	if (s === e) {
		// string b(efore) and a(fter) cursor
		var b = str.substring(0, s);
		var a = str.substring(e);
		// take care of U+00A0 NO-BREAK SPACE as well
		var rb = b.match(/[^ \t\u00A0]*$/);
		var ra = a.match(/^[^ \t\u00A0]*/);

		s -= rb[0].length;
		e += ra[0].length;
	}


	result.before = str.substring(0, s);
	result.key = str.substring(s, e);
	result.after = str.substring(e);

	return result;
}

function handleArguments(value, r) {
	var fromRegExp, offsetFromEnd, m;
	try {
		var x = JSON.parse(value);
		if (x.length !== 2) {
			alert(chrome.i18n.getMessage("extname") + ": " + "Advanced abbreviations have exactly two string elements:" + "\ne.g.\n[\"(\\d+)\\s+(\\w+)\",\n \"$1: $2\"]" + "\nPlease fix definition of abbreviation \"" + r.key + "\"\n" + value);
		}
		try {
			fromRegExp = new RegExp("^" + x[0], "");
		} catch (e) {
			//              NOTE The initial array element is not a string (can be used in a RegExp constructor).
			alert(chrome.i18n.getMessage("extname") + ": " + e.toString());
		}
		var toReplacement = x[1];
		//          NOTE Is replacement argument really a string?
		if (typeof(toReplacement) !== "string") {
			alert(chrome.i18n.getMessage("extname") + ": " + toReplacement + " is not a double-quoted string, as expected for an advanced abbreviation!\nPlease fix abbreviation \"" + r.key + "\"\n" + value);
		}
		try {
			m = r.after.match(fromRegExp);
			if (m === null) {
				alert(chrome.i18n.getMessage("extname") + ": \"" + fromRegExp + "\" does not match arguments\nfor \"" + r.key + "\" \"" + r.after.substring(0, Math.min(r.after.length, 15)) + (r.after.length > 15 ? "..." : "") + "\"\nPlease fix arguments or definition of abbreviation \"" + r.key + "\"\n" + value);
				return;
			}
			unExpandedValue = r.key + m[0];
			offsetFromEnd = r.after.length - m[0].length;
			// x = r.after.replace(fromRegExp, toReplacement);
			//              alert("m="+JSON.stringify(m));
		} catch (e1) {
			alert(chrome.i18n.getMessage("extname") + ": " + e1.toString());
		}
		value = m[0].replace(fromRegExp, toReplacement);
		r.after = r.after.substring(m[0].length);
	} catch (e2) {
		// NOTE Reporting all exceptions here would be annoying.
		// It would come up for every simple abbreviation expansion which is not a valid
		// JSON text.
		// It might still be useful to report other errors to point out likely
		// syntactical errors of advanced abbrevations.
		if (e2 && e2.toString() !== "SyntaxError: Unexpected token " + typeof value === "string" ? value.substring(0, 1) : "") {
			alert(chrome.i18n.getMessage("extname") + ": " + e2.toString() + "\nPlease fix definition of Abbreviation \"" + r.key + "\"\n" + value);
		} else {
			unExpandedValue = r.key;
		}
	}
	return value;
}

//replaces the keys with the assigned values in the element.
function checkElements(elem) {
	//  "use strict";
	var substituted = false,
		element = elem,
		s, r, value, expandedElementType;
	if ((element.tagName === "INPUT" && ((element.type === "text") || (element.type === "password"))) || element.tagName === "TEXTAREA") {

		// if text is selected abort... see wysiwyg-editor
		if (element.selectionStart !== element.selectionEnd) {
			var oldSelectionStart = element.selectionStart;
			element.value = element.value.substring(0, element.selectionStart) + unExpandedValue + element.value.substring(element.selectionEnd, element.value.length);
			element.selectionStart = element.selectionEnd = oldSelectionStart;
			// TODO reenable if selection in  wysiwyg-editor works
			return;
		}

		r = extractKeyWord(element.value, element.selectionStart, element.selectionEnd);
		value = settings.map.get(r.key);

		//        var offsetFromEnd;
		//        unExpandedValue = r.key;
		value = handleArguments(value, r);
		if (value) {
			substituted = true;
			updateMostRecentlyUsedList(r.key);
			// date substitution
			value = replaceDates(value);
			if (element.tagName === "TEXTAREA") {} else {
				value = value.replace(/[\n\r]+/g, " ");
			}
			var tmp = r.before + value;

			//            var cursor = tmp.length;
			element.value = tmp + r.after;

			//             if (r.after === "" && offsetFromEnd !== null) {
			//                 cursor = cursor - offsetFromEnd
			//             }
			element.selectionStart = settings.selectPhrase ? r.before.length : tmp.length;
			element.selectionEnd = tmp.length;
		}
	} else if (element.isContentEditable) {
		// NOTE normalize split or empty text elements.
		// e.g. "badly " "split" "" "" "" " text" becomes "badly split text"
		// Don't do this here since it invalidates the current selection!
		// element.normalize();
		var doc = element.ownerDocument;
		var selection = doc.getSelection();
		//        NOTE undefined!
		//        alert("element.selectionStart(HTML|BODY) " + element.selectionStart)
		//      console.log( selection );

		if (selection.isCollapsed) {
			element = selection.anchorNode;
			s = selection.anchorOffset;

			r = extractKeyWord(element.textContent, s, s);

			value = settings.map.get(r.key);
			//            unExpandedValue = r.key;
			value = handleArguments(value, r);
			if (value) {
				substituted = true;
				updateMostRecentlyUsedList(r.key);
				value = replaceDates(value);

				var beforepos = r.before.length;

				// split text into "element" - "keyword" - "aftervalue"
				var keyword = element.splitText(beforepos);
				var aftervalue = keyword.splitText(unExpandedValue.length);
				// TODO check for other linebreaks like unix or mac style
				var lines = value.split("\n");
				var afterNode = doc.createElement(expandedElementType);
				// afterNode.appendChild(doc.createTextNode(lines[lines.length - 1] + aftervalue.textContent));
				afterNode.appendChild(doc.createTextNode(aftervalue.textContent));
				// FIXME: There must be a better way then this to preserve leading whitespace in text nodes.
				afterNode.innerHTML = afterNode.innerHTML.replace(/ /g, "&nbsp;");
				aftervalue.textContent = "";
				element.parentNode.insertBefore(afterNode, aftervalue.nextSibling);
				keyword.textContent = "";
				for (var i = 0; i < lines.length; i++) {
					if (lines[i].length > 0) {
						element.parentNode.insertBefore(doc.createElement("div").appendChild(doc.createTextNode(lines[i])).parentNode, keyword);
					} else {
						element.parentNode.insertBefore(doc.createElement("p").appendChild(doc.createTextNode(lines[i])).parentNode, keyword);
					}
				}
				// set selection/cursor
				selection.removeAllRanges();

				var range = doc.createRange();
				range.selectNode(afterNode);
				range.setStart(element, r.before.length);
				// NOTE We keep keyword empty to make it useful for ending the range!
				range.setEnd(keyword, 0);
				if (!settings.selectPhrase) {
					range.collapse(false);
				} else {
					selection.addRange(range);
					selection.anchorNode.parentNode.normalize();
				}
			}
		} else {
			selection.getRangeAt(0).deleteContents();
			selection.getRangeAt(0).insertNode(doc.createElement("div").appendChild(doc.createTextNode(unExpandedValue)));
			selection.collapseToStart();
			// NOTE normalize split or empty text elements.
			// e.g. "badly " "split" "" "" "" " text" becomes "badly split text"
			selection.anchorNode.parentNode.normalize();
			substituted = true;
		}
	}

	return substituted;

}

function pageHasEditableElements() {
	var elemInput = document.getElementsByTagName("input");
	var elemTextarea = document.getElementsByTagName("textarea");

	return (elemTextarea.length > 0 || findInputElements(elemInput));
}

// trigger replaceKeysWithValues method on key event space or enter
function onKeyEvent(e) {
	if (settings.replaceKey.equals(e)) {
		var element = e.srcElement;

		if (checkElements(element)) {
			pageaction.notify();
		} else {
			var notification = webkitNotifications.createNotification(
//			NOTE Don't try to use a smaller icon since it will be streched and become low-resolution.
//				chrome.extension.getURL("icons/icon-16x16.png"), // icon url - can be relative
//			TODO See issue chromium:134315 for possible trouble with this.
				chrome.extension.getURL("icons/icon-48x48.png"), // icon url - can be relative, NOT!
			chrome.i18n.getMessage("extname") + ' - Recent Expansions', // notification title
			getMostRecentlyUsedList().join("\n") // notification body text
			);
			notification.show();
			//			window.alert("Most recently expanded abbreviations:\n\n" + getMostRecentlyUsedList().join("\n"));
		}
		// consume event
		e.returnValue = false;
	}
}

function addEventListenerToIframes() {
	var iframes = document.getElementsByTagName("iframe");

	for (var i = 0; i < iframes.length; i++) {
		var iframe = iframes[i];
		if (iframe.src.match("^https?://") === null && iframe.contentDocument) {
			iframe.contentDocument.addEventListener("keydown", onKeyEvent, false);
		} else if (iframe.src.match("^https?://") === null && iframe.contentWindow) {
			iframe.contentWindow.addEventListener("keydown", onKeyEvent, false);
		}
	}

	if (pageHasEditableElements()) {
		pageaction.show();
	}

	setTimeout(function() {
		addEventListenerToIframes();
	}, 500);
}

// init extension
function init() {
	settings = new Settings();
	pageaction = new PageAction();

	settings.readRequest();
	settings.enableListener();
	if (document.body) {
		// TODO This approach does not work in Google Drive yet (formerly Google Docs).
		var mySpans = document.body.querySelectorAll('span[class="goog-inline-block kix-lineview-text-block"]');
		if (mySpans) {
			for (var i = 2; i < mySpans.length; i++) {
				mySpans[i].addEventListener("keydown", onKeyEvent, false);
			}
		}
	}
	addEventListenerToIframes();

	document.addEventListener("keydown", onKeyEvent, false);

}

setTimeout(function() {
	init();
}, 0);

// global replacer
function globalReplacer(value) {
	var m = settings.map;
	// check all keys
	for (var j = 0; j++ < m.size; m.next()) {
		value = value.replace(new RegExp("\\b" + m.key() + "\\b", "g"), m.value());
		value = replaceDates(value);
	}
	return value;
}