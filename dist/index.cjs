'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var net = require('node:net');
var os$1 = require('node:os');
var ngrok = require('ngrok');
var twilio = require('twilio');
var fastifyFormbody = require('@fastify/formbody');
var fastify = require('fastify');
var process$2 = require('node:process');
var getSecureInputProcesses = require('get-secure-input-processes');
var inquirer = require('inquirer');
var tty = require('node:tty');
var require$$0$2 = require('path');
var require$$0$3 = require('child_process');
var require$$0$1 = require('fs');
var require$$0$4 = require('os');
var require$$0$5 = require('assert');
var require$$2 = require('events');
var require$$0$7 = require('buffer');
var require$$0$6 = require('stream');
var require$$2$1 = require('util');
var readline = require('node:readline');
var require$$10 = require('string_decoder/');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

var net__default = /*#__PURE__*/_interopDefaultLegacy(net);
var os__default = /*#__PURE__*/_interopDefaultLegacy(os$1);
var ngrok__default = /*#__PURE__*/_interopDefaultLegacy(ngrok);
var twilio__default = /*#__PURE__*/_interopDefaultLegacy(twilio);
var fastifyFormbody__default = /*#__PURE__*/_interopDefaultLegacy(fastifyFormbody);
var fastify__default = /*#__PURE__*/_interopDefaultLegacy(fastify);
var process__default = /*#__PURE__*/_interopDefaultLegacy(process$2);
var inquirer__default = /*#__PURE__*/_interopDefaultLegacy(inquirer);
var tty__default = /*#__PURE__*/_interopDefaultLegacy(tty);
var require$$0__default$1 = /*#__PURE__*/_interopDefaultLegacy(require$$0$2);
var require$$0__default$2 = /*#__PURE__*/_interopDefaultLegacy(require$$0$3);
var require$$0__default = /*#__PURE__*/_interopDefaultLegacy(require$$0$1);
var require$$0__default$3 = /*#__PURE__*/_interopDefaultLegacy(require$$0$4);
var require$$0__default$4 = /*#__PURE__*/_interopDefaultLegacy(require$$0$5);
var require$$2__default = /*#__PURE__*/_interopDefaultLegacy(require$$2);
var require$$0__default$6 = /*#__PURE__*/_interopDefaultLegacy(require$$0$7);
var require$$0__default$5 = /*#__PURE__*/_interopDefaultLegacy(require$$0$6);
var require$$2__default$1 = /*#__PURE__*/_interopDefaultLegacy(require$$2$1);
var readline__default = /*#__PURE__*/_interopDefaultLegacy(readline);
var require$$10__default = /*#__PURE__*/_interopDefaultLegacy(require$$10);

class Locked extends Error {
	constructor(port) {
		super(`${port} is locked`);
	}
}

const lockedPorts = {
	old: new Set(),
	young: new Set(),
};

// On this interval, the old locked ports are discarded,
// the young locked ports are moved to old locked ports,
// and a new young set for locked ports are created.
const releaseOldLockedPortsIntervalMs = 1000 * 15;

// Lazily create interval on first use
let interval;

const getLocalHosts = () => {
	const interfaces = os__default["default"].networkInterfaces();

	// Add undefined value for createServer function to use default host,
	// and default IPv4 host in case createServer defaults to IPv6.
	const results = new Set([undefined, '0.0.0.0']);

	for (const _interface of Object.values(interfaces)) {
		for (const config of _interface) {
			results.add(config.address);
		}
	}

	return results;
};

const checkAvailablePort = options =>
	new Promise((resolve, reject) => {
		const server = net__default["default"].createServer();
		server.unref();
		server.on('error', reject);

		server.listen(options, () => {
			const {port} = server.address();
			server.close(() => {
				resolve(port);
			});
		});
	});

const getAvailablePort = async (options, hosts) => {
	if (options.host || options.port === 0) {
		return checkAvailablePort(options);
	}

	for (const host of hosts) {
		try {
			await checkAvailablePort({port: options.port, host}); // eslint-disable-line no-await-in-loop
		} catch (error) {
			if (!['EADDRNOTAVAIL', 'EINVAL'].includes(error.code)) {
				throw error;
			}
		}
	}

	return options.port;
};

const portCheckSequence = function * (ports) {
	if (ports) {
		yield * ports;
	}

	yield 0; // Fall back to 0 if anything else failed
};

async function getPorts(options) {
	let ports;
	let exclude = new Set();

	if (options) {
		if (options.port) {
			ports = typeof options.port === 'number' ? [options.port] : options.port;
		}

		if (options.exclude) {
			const excludeIterable = options.exclude;

			if (typeof excludeIterable[Symbol.iterator] !== 'function') {
				throw new TypeError('The `exclude` option must be an iterable.');
			}

			for (const element of excludeIterable) {
				if (typeof element !== 'number') {
					throw new TypeError('Each item in the `exclude` option must be a number corresponding to the port you want excluded.');
				}

				if (!Number.isSafeInteger(element)) {
					throw new TypeError(`Number ${element} in the exclude option is not a safe integer and can't be used`);
				}
			}

			exclude = new Set(excludeIterable);
		}
	}

	if (interval === undefined) {
		interval = setInterval(() => {
			lockedPorts.old = lockedPorts.young;
			lockedPorts.young = new Set();
		}, releaseOldLockedPortsIntervalMs);

		// Does not exist in some environments (Electron, Jest jsdom env, browser, etc).
		if (interval.unref) {
			interval.unref();
		}
	}

	const hosts = getLocalHosts();

	for (const port of portCheckSequence(ports)) {
		try {
			if (exclude.has(port)) {
				continue;
			}

			let availablePort = await getAvailablePort({...options, port}, hosts); // eslint-disable-line no-await-in-loop
			while (lockedPorts.old.has(availablePort) || lockedPorts.young.has(availablePort)) {
				if (port !== 0) {
					throw new Locked(port);
				}

				availablePort = await getAvailablePort({...options, port}, hosts); // eslint-disable-line no-await-in-loop
			}

			lockedPorts.young.add(availablePort);

			return availablePort;
		} catch (error) {
			if (!['EADDRINUSE', 'EACCES'].includes(error.code) && !(error instanceof Locked)) {
				throw error;
			}
		}
	}

	throw new Error('No available ports found');
}

async function makeCall({ ngrokServerUrl, twilioAccountSid, twilioAuthToken, destinationPhoneNumber, originPhoneNumber, }) {
    const client = twilio__default["default"](twilioAccountSid, twilioAuthToken);
    console.info(`📞 Calling ${destinationPhoneNumber}...`);
    const call = await client.calls.create({
        url: `${ngrokServerUrl}/voice`,
        to: destinationPhoneNumber,
        from: originPhoneNumber,
        callerId: '+1 (903) 270-3921',
        statusCallback: `${ngrokServerUrl}/events`,
        timeLimit: 60,
    });
    return call;
}

async function startNgrokServer({ port, binPath, }) {
    const ngrokServerUrl = await ngrok__default["default"].connect({
        addr: port,
        binPath: binPath === undefined ? undefined : () => binPath,
    });
    console.info(`✨ ngrok server started at ${ngrokServerUrl}`);
    return ngrokServerUrl;
}

const ANSI_BACKGROUND_OFFSET$1 = 10;

const wrapAnsi16$1 = (offset = 0) => code => `\u001B[${code + offset}m`;

const wrapAnsi256$1 = (offset = 0) => code => `\u001B[${38 + offset};5;${code}m`;

const wrapAnsi16m$1 = (offset = 0) => (red, green, blue) => `\u001B[${38 + offset};2;${red};${green};${blue}m`;

function assembleStyles$1() {
	const codes = new Map();
	const styles = {
		modifier: {
			reset: [0, 0],
			// 21 isn't widely supported and 22 does the same thing
			bold: [1, 22],
			dim: [2, 22],
			italic: [3, 23],
			underline: [4, 24],
			overline: [53, 55],
			inverse: [7, 27],
			hidden: [8, 28],
			strikethrough: [9, 29],
		},
		color: {
			black: [30, 39],
			red: [31, 39],
			green: [32, 39],
			yellow: [33, 39],
			blue: [34, 39],
			magenta: [35, 39],
			cyan: [36, 39],
			white: [37, 39],

			// Bright color
			blackBright: [90, 39],
			redBright: [91, 39],
			greenBright: [92, 39],
			yellowBright: [93, 39],
			blueBright: [94, 39],
			magentaBright: [95, 39],
			cyanBright: [96, 39],
			whiteBright: [97, 39],
		},
		bgColor: {
			bgBlack: [40, 49],
			bgRed: [41, 49],
			bgGreen: [42, 49],
			bgYellow: [43, 49],
			bgBlue: [44, 49],
			bgMagenta: [45, 49],
			bgCyan: [46, 49],
			bgWhite: [47, 49],

			// Bright color
			bgBlackBright: [100, 49],
			bgRedBright: [101, 49],
			bgGreenBright: [102, 49],
			bgYellowBright: [103, 49],
			bgBlueBright: [104, 49],
			bgMagentaBright: [105, 49],
			bgCyanBright: [106, 49],
			bgWhiteBright: [107, 49],
		},
	};

	// Alias bright black as gray (and grey)
	styles.color.gray = styles.color.blackBright;
	styles.bgColor.bgGray = styles.bgColor.bgBlackBright;
	styles.color.grey = styles.color.blackBright;
	styles.bgColor.bgGrey = styles.bgColor.bgBlackBright;

	for (const [groupName, group] of Object.entries(styles)) {
		for (const [styleName, style] of Object.entries(group)) {
			styles[styleName] = {
				open: `\u001B[${style[0]}m`,
				close: `\u001B[${style[1]}m`,
			};

			group[styleName] = styles[styleName];

			codes.set(style[0], style[1]);
		}

		Object.defineProperty(styles, groupName, {
			value: group,
			enumerable: false,
		});
	}

	Object.defineProperty(styles, 'codes', {
		value: codes,
		enumerable: false,
	});

	styles.color.close = '\u001B[39m';
	styles.bgColor.close = '\u001B[49m';

	styles.color.ansi = wrapAnsi16$1();
	styles.color.ansi256 = wrapAnsi256$1();
	styles.color.ansi16m = wrapAnsi16m$1();
	styles.bgColor.ansi = wrapAnsi16$1(ANSI_BACKGROUND_OFFSET$1);
	styles.bgColor.ansi256 = wrapAnsi256$1(ANSI_BACKGROUND_OFFSET$1);
	styles.bgColor.ansi16m = wrapAnsi16m$1(ANSI_BACKGROUND_OFFSET$1);

	// From https://github.com/Qix-/color-convert/blob/3f0e0d4e92e235796ccb17f6e85c72094a651f49/conversions.js
	Object.defineProperties(styles, {
		rgbToAnsi256: {
			value: (red, green, blue) => {
				// We use the extended greyscale palette here, with the exception of
				// black and white. normal palette only has 4 greyscale shades.
				if (red === green && green === blue) {
					if (red < 8) {
						return 16;
					}

					if (red > 248) {
						return 231;
					}

					return Math.round(((red - 8) / 247) * 24) + 232;
				}

				return 16
					+ (36 * Math.round(red / 255 * 5))
					+ (6 * Math.round(green / 255 * 5))
					+ Math.round(blue / 255 * 5);
			},
			enumerable: false,
		},
		hexToRgb: {
			value: hex => {
				const matches = /(?<colorString>[a-f\d]{6}|[a-f\d]{3})/i.exec(hex.toString(16));
				if (!matches) {
					return [0, 0, 0];
				}

				let {colorString} = matches.groups;

				if (colorString.length === 3) {
					colorString = [...colorString].map(character => character + character).join('');
				}

				const integer = Number.parseInt(colorString, 16);

				return [
					/* eslint-disable no-bitwise */
					(integer >> 16) & 0xFF,
					(integer >> 8) & 0xFF,
					integer & 0xFF,
					/* eslint-enable no-bitwise */
				];
			},
			enumerable: false,
		},
		hexToAnsi256: {
			value: hex => styles.rgbToAnsi256(...styles.hexToRgb(hex)),
			enumerable: false,
		},
		ansi256ToAnsi: {
			value: code => {
				if (code < 8) {
					return 30 + code;
				}

				if (code < 16) {
					return 90 + (code - 8);
				}

				let red;
				let green;
				let blue;

				if (code >= 232) {
					red = (((code - 232) * 10) + 8) / 255;
					green = red;
					blue = red;
				} else {
					code -= 16;

					const remainder = code % 36;

					red = Math.floor(code / 36) / 5;
					green = Math.floor(remainder / 6) / 5;
					blue = (remainder % 6) / 5;
				}

				const value = Math.max(red, green, blue) * 2;

				if (value === 0) {
					return 30;
				}

				// eslint-disable-next-line no-bitwise
				let result = 30 + ((Math.round(blue) << 2) | (Math.round(green) << 1) | Math.round(red));

				if (value === 2) {
					result += 60;
				}

				return result;
			},
			enumerable: false,
		},
		rgbToAnsi: {
			value: (red, green, blue) => styles.ansi256ToAnsi(styles.rgbToAnsi256(red, green, blue)),
			enumerable: false,
		},
		hexToAnsi: {
			value: hex => styles.ansi256ToAnsi(styles.hexToAnsi256(hex)),
			enumerable: false,
		},
	});

	return styles;
}

const ansiStyles$1 = assembleStyles$1();

// From: https://github.com/sindresorhus/has-flag/blob/main/index.js
function hasFlag$1(flag, argv = process__default["default"].argv) {
	const prefix = flag.startsWith('-') ? '' : (flag.length === 1 ? '-' : '--');
	const position = argv.indexOf(prefix + flag);
	const terminatorPosition = argv.indexOf('--');
	return position !== -1 && (terminatorPosition === -1 || position < terminatorPosition);
}

const {env: env$1} = process__default["default"];

let flagForceColor$1;
if (
	hasFlag$1('no-color')
	|| hasFlag$1('no-colors')
	|| hasFlag$1('color=false')
	|| hasFlag$1('color=never')
) {
	flagForceColor$1 = 0;
} else if (
	hasFlag$1('color')
	|| hasFlag$1('colors')
	|| hasFlag$1('color=true')
	|| hasFlag$1('color=always')
) {
	flagForceColor$1 = 1;
}

function envForceColor$1() {
	if ('FORCE_COLOR' in env$1) {
		if (env$1.FORCE_COLOR === 'true') {
			return 1;
		}

		if (env$1.FORCE_COLOR === 'false') {
			return 0;
		}

		return env$1.FORCE_COLOR.length === 0 ? 1 : Math.min(Number.parseInt(env$1.FORCE_COLOR, 10), 3);
	}
}

function translateLevel$1(level) {
	if (level === 0) {
		return false;
	}

	return {
		level,
		hasBasic: true,
		has256: level >= 2,
		has16m: level >= 3,
	};
}

function _supportsColor$1(haveStream, {streamIsTTY, sniffFlags = true} = {}) {
	const noFlagForceColor = envForceColor$1();
	if (noFlagForceColor !== undefined) {
		flagForceColor$1 = noFlagForceColor;
	}

	const forceColor = sniffFlags ? flagForceColor$1 : noFlagForceColor;

	if (forceColor === 0) {
		return 0;
	}

	if (sniffFlags) {
		if (hasFlag$1('color=16m')
			|| hasFlag$1('color=full')
			|| hasFlag$1('color=truecolor')) {
			return 3;
		}

		if (hasFlag$1('color=256')) {
			return 2;
		}
	}

	if (haveStream && !streamIsTTY && forceColor === undefined) {
		return 0;
	}

	const min = forceColor || 0;

	if (env$1.TERM === 'dumb') {
		return min;
	}

	if (process__default["default"].platform === 'win32') {
		// Windows 10 build 10586 is the first Windows release that supports 256 colors.
		// Windows 10 build 14931 is the first release that supports 16m/TrueColor.
		const osRelease = os__default["default"].release().split('.');
		if (
			Number(osRelease[0]) >= 10
			&& Number(osRelease[2]) >= 10_586
		) {
			return Number(osRelease[2]) >= 14_931 ? 3 : 2;
		}

		return 1;
	}

	if ('CI' in env$1) {
		if (['TRAVIS', 'CIRCLECI', 'APPVEYOR', 'GITLAB_CI', 'GITHUB_ACTIONS', 'BUILDKITE', 'DRONE'].some(sign => sign in env$1) || env$1.CI_NAME === 'codeship') {
			return 1;
		}

		return min;
	}

	if ('TEAMCITY_VERSION' in env$1) {
		return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(env$1.TEAMCITY_VERSION) ? 1 : 0;
	}

	// Check for Azure DevOps pipelines
	if ('TF_BUILD' in env$1 && 'AGENT_NAME' in env$1) {
		return 1;
	}

	if (env$1.COLORTERM === 'truecolor') {
		return 3;
	}

	if ('TERM_PROGRAM' in env$1) {
		const version = Number.parseInt((env$1.TERM_PROGRAM_VERSION || '').split('.')[0], 10);

		switch (env$1.TERM_PROGRAM) {
			case 'iTerm.app':
				return version >= 3 ? 3 : 2;
			case 'Apple_Terminal':
				return 2;
			// No default
		}
	}

	if (/-256(color)?$/i.test(env$1.TERM)) {
		return 2;
	}

	if (/^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(env$1.TERM)) {
		return 1;
	}

	if ('COLORTERM' in env$1) {
		return 1;
	}

	return min;
}

function createSupportsColor$1(stream, options = {}) {
	const level = _supportsColor$1(stream, {
		streamIsTTY: stream && stream.isTTY,
		...options,
	});

	return translateLevel$1(level);
}

const supportsColor$1 = {
	stdout: createSupportsColor$1({isTTY: tty__default["default"].isatty(1)}),
	stderr: createSupportsColor$1({isTTY: tty__default["default"].isatty(2)}),
};

// TODO: When targeting Node.js 16, use `String.prototype.replaceAll`.
function stringReplaceAll$1(string, substring, replacer) {
	let index = string.indexOf(substring);
	if (index === -1) {
		return string;
	}

	const substringLength = substring.length;
	let endIndex = 0;
	let returnValue = '';
	do {
		returnValue += string.substr(endIndex, index - endIndex) + substring + replacer;
		endIndex = index + substringLength;
		index = string.indexOf(substring, endIndex);
	} while (index !== -1);

	returnValue += string.slice(endIndex);
	return returnValue;
}

function stringEncaseCRLFWithFirstIndex$1(string, prefix, postfix, index) {
	let endIndex = 0;
	let returnValue = '';
	do {
		const gotCR = string[index - 1] === '\r';
		returnValue += string.substr(endIndex, (gotCR ? index - 1 : index) - endIndex) + prefix + (gotCR ? '\r\n' : '\n') + postfix;
		endIndex = index + 1;
		index = string.indexOf('\n', endIndex);
	} while (index !== -1);

	returnValue += string.slice(endIndex);
	return returnValue;
}

const {stdout: stdoutColor$1, stderr: stderrColor$1} = supportsColor$1;

const GENERATOR$1 = Symbol('GENERATOR');
const STYLER$1 = Symbol('STYLER');
const IS_EMPTY$1 = Symbol('IS_EMPTY');

// `supportsColor.level` → `ansiStyles.color[name]` mapping
const levelMapping$1 = [
	'ansi',
	'ansi',
	'ansi256',
	'ansi16m',
];

const styles$1 = Object.create(null);

const applyOptions$1 = (object, options = {}) => {
	if (options.level && !(Number.isInteger(options.level) && options.level >= 0 && options.level <= 3)) {
		throw new Error('The `level` option should be an integer from 0 to 3');
	}

	// Detect level if not set manually
	const colorLevel = stdoutColor$1 ? stdoutColor$1.level : 0;
	object.level = options.level === undefined ? colorLevel : options.level;
};

const chalkFactory$1 = options => {
	const chalk = (...strings) => strings.join(' ');
	applyOptions$1(chalk, options);

	Object.setPrototypeOf(chalk, createChalk$1.prototype);

	return chalk;
};

function createChalk$1(options) {
	return chalkFactory$1(options);
}

Object.setPrototypeOf(createChalk$1.prototype, Function.prototype);

for (const [styleName, style] of Object.entries(ansiStyles$1)) {
	styles$1[styleName] = {
		get() {
			const builder = createBuilder$1(this, createStyler$1(style.open, style.close, this[STYLER$1]), this[IS_EMPTY$1]);
			Object.defineProperty(this, styleName, {value: builder});
			return builder;
		},
	};
}

styles$1.visible = {
	get() {
		const builder = createBuilder$1(this, this[STYLER$1], true);
		Object.defineProperty(this, 'visible', {value: builder});
		return builder;
	},
};

const getModelAnsi$1 = (model, level, type, ...arguments_) => {
	if (model === 'rgb') {
		if (level === 'ansi16m') {
			return ansiStyles$1[type].ansi16m(...arguments_);
		}

		if (level === 'ansi256') {
			return ansiStyles$1[type].ansi256(ansiStyles$1.rgbToAnsi256(...arguments_));
		}

		return ansiStyles$1[type].ansi(ansiStyles$1.rgbToAnsi(...arguments_));
	}

	if (model === 'hex') {
		return getModelAnsi$1('rgb', level, type, ...ansiStyles$1.hexToRgb(...arguments_));
	}

	return ansiStyles$1[type][model](...arguments_);
};

const usedModels$1 = ['rgb', 'hex', 'ansi256'];

for (const model of usedModels$1) {
	styles$1[model] = {
		get() {
			const {level} = this;
			return function (...arguments_) {
				const styler = createStyler$1(getModelAnsi$1(model, levelMapping$1[level], 'color', ...arguments_), ansiStyles$1.color.close, this[STYLER$1]);
				return createBuilder$1(this, styler, this[IS_EMPTY$1]);
			};
		},
	};

	const bgModel = 'bg' + model[0].toUpperCase() + model.slice(1);
	styles$1[bgModel] = {
		get() {
			const {level} = this;
			return function (...arguments_) {
				const styler = createStyler$1(getModelAnsi$1(model, levelMapping$1[level], 'bgColor', ...arguments_), ansiStyles$1.bgColor.close, this[STYLER$1]);
				return createBuilder$1(this, styler, this[IS_EMPTY$1]);
			};
		},
	};
}

const proto$1 = Object.defineProperties(() => {}, {
	...styles$1,
	level: {
		enumerable: true,
		get() {
			return this[GENERATOR$1].level;
		},
		set(level) {
			this[GENERATOR$1].level = level;
		},
	},
});

const createStyler$1 = (open, close, parent) => {
	let openAll;
	let closeAll;
	if (parent === undefined) {
		openAll = open;
		closeAll = close;
	} else {
		openAll = parent.openAll + open;
		closeAll = close + parent.closeAll;
	}

	return {
		open,
		close,
		openAll,
		closeAll,
		parent,
	};
};

const createBuilder$1 = (self, _styler, _isEmpty) => {
	// Single argument is hot path, implicit coercion is faster than anything
	// eslint-disable-next-line no-implicit-coercion
	const builder = (...arguments_) => applyStyle$1(builder, (arguments_.length === 1) ? ('' + arguments_[0]) : arguments_.join(' '));

	// We alter the prototype because we must return a function, but there is
	// no way to create a function with a different prototype
	Object.setPrototypeOf(builder, proto$1);

	builder[GENERATOR$1] = self;
	builder[STYLER$1] = _styler;
	builder[IS_EMPTY$1] = _isEmpty;

	return builder;
};

const applyStyle$1 = (self, string) => {
	if (self.level <= 0 || !string) {
		return self[IS_EMPTY$1] ? '' : string;
	}

	let styler = self[STYLER$1];

	if (styler === undefined) {
		return string;
	}

	const {openAll, closeAll} = styler;
	if (string.includes('\u001B')) {
		while (styler !== undefined) {
			// Replace any instances already present with a re-opening code
			// otherwise only the part of the string until said closing code
			// will be colored, and the rest will simply be 'plain'.
			string = stringReplaceAll$1(string, styler.close, styler.open);

			styler = styler.parent;
		}
	}

	// We can move both next actions out of loop, because remaining actions in loop won't have
	// any/visible effect on parts we add here. Close the styling before a linebreak and reopen
	// after next line to fix a bleed issue on macOS: https://github.com/chalk/chalk/pull/92
	const lfIndex = string.indexOf('\n');
	if (lfIndex !== -1) {
		string = stringEncaseCRLFWithFirstIndex$1(string, closeAll, openAll, lfIndex);
	}

	return openAll + string + closeAll;
};

Object.defineProperties(createChalk$1.prototype, styles$1);

const chalk$1 = createChalk$1();
createChalk$1({level: stderrColor$1 ? stderrColor$1.level : 0});

function isUnicodeSupported$1() {
	if (process__default["default"].platform !== 'win32') {
		return process__default["default"].env.TERM !== 'linux'; // Linux console (kernel)
	}

	return Boolean(process__default["default"].env.CI)
		|| Boolean(process__default["default"].env.WT_SESSION) // Windows Terminal
		|| process__default["default"].env.ConEmuTask === '{cmd::Cmder}' // ConEmu and cmder
		|| process__default["default"].env.TERM_PROGRAM === 'vscode'
		|| process__default["default"].env.TERM === 'xterm-256color'
		|| process__default["default"].env.TERM === 'alacritty'
		|| process__default["default"].env.TERMINAL_EMULATOR === 'JetBrains-JediTerm';
}

const main$1 = {
	info: chalk$1.blue('ℹ'),
	success: chalk$1.green('✔'),
	warning: chalk$1.yellow('⚠'),
	error: chalk$1.red('✖'),
};

const fallback = {
	info: chalk$1.blue('i'),
	success: chalk$1.green('√'),
	warning: chalk$1.yellow('‼'),
	error: chalk$1.red('×'),
};

const logSymbols = isUnicodeSupported$1() ? main$1 : fallback;

class TimeoutError extends Error {
	constructor(message) {
		super(message);
		this.name = 'TimeoutError';
	}
}

function pTimeout(promise, milliseconds, fallback, options) {
	let timer;
	const cancelablePromise = new Promise((resolve, reject) => {
		if (typeof milliseconds !== 'number' || Math.sign(milliseconds) !== 1) {
			throw new TypeError(`Expected \`milliseconds\` to be a positive number, got \`${milliseconds}\``);
		}

		if (milliseconds === Number.POSITIVE_INFINITY) {
			resolve(promise);
			return;
		}

		options = {
			customTimers: {setTimeout, clearTimeout},
			...options
		};

		timer = options.customTimers.setTimeout.call(undefined, () => {
			if (typeof fallback === 'function') {
				try {
					resolve(fallback());
				} catch (error) {
					reject(error);
				}

				return;
			}

			const message = typeof fallback === 'string' ? fallback : `Promise timed out after ${milliseconds} milliseconds`;
			const timeoutError = fallback instanceof Error ? fallback : new TimeoutError(message);

			if (typeof promise.cancel === 'function') {
				promise.cancel();
			}

			reject(timeoutError);
		}, milliseconds);

		(async () => {
			try {
				resolve(await promise);
			} catch (error) {
				reject(error);
			} finally {
				options.customTimers.clearTimeout.call(undefined, timer);
			}
		})();
	});

	cancelablePromise.clear = () => {
		clearTimeout(timer);
		timer = undefined;
	};

	return cancelablePromise;
}

async function pWaitFor(condition, options = {}) {
	const {
		interval = 20,
		timeout = Number.POSITIVE_INFINITY,
		before = true
	} = options;

	let retryTimeout;

	const promise = new Promise((resolve, reject) => {
		const check = async () => {
			try {
				const value = await condition();

				if (typeof value !== 'boolean') {
					throw new TypeError('Expected condition to return a boolean');
				}

				if (value === true) {
					resolve();
				} else {
					retryTimeout = setTimeout(check, interval);
				}
			} catch (error) {
				reject(error);
			}
		};

		if (before) {
			check();
		} else {
			retryTimeout = setTimeout(check, interval);
		}
	});

	if (timeout !== Number.POSITIVE_INFINITY) {
		try {
			return await pTimeout(promise, timeout);
		} catch (error) {
			if (retryTimeout) {
				clearTimeout(retryTimeout);
			}

			throw error;
		}
	}

	return promise;
}

var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

var execa$1 = {exports: {}};

var crossSpawn$1 = {exports: {}};

var windows;
var hasRequiredWindows;

function requireWindows () {
	if (hasRequiredWindows) return windows;
	hasRequiredWindows = 1;
	windows = isexe;
	isexe.sync = sync;

	var fs = require$$0__default["default"];

	function checkPathExt (path, options) {
	  var pathext = options.pathExt !== undefined ?
	    options.pathExt : process.env.PATHEXT;

	  if (!pathext) {
	    return true
	  }

	  pathext = pathext.split(';');
	  if (pathext.indexOf('') !== -1) {
	    return true
	  }
	  for (var i = 0; i < pathext.length; i++) {
	    var p = pathext[i].toLowerCase();
	    if (p && path.substr(-p.length).toLowerCase() === p) {
	      return true
	    }
	  }
	  return false
	}

	function checkStat (stat, path, options) {
	  if (!stat.isSymbolicLink() && !stat.isFile()) {
	    return false
	  }
	  return checkPathExt(path, options)
	}

	function isexe (path, options, cb) {
	  fs.stat(path, function (er, stat) {
	    cb(er, er ? false : checkStat(stat, path, options));
	  });
	}

	function sync (path, options) {
	  return checkStat(fs.statSync(path), path, options)
	}
	return windows;
}

var mode;
var hasRequiredMode;

function requireMode () {
	if (hasRequiredMode) return mode;
	hasRequiredMode = 1;
	mode = isexe;
	isexe.sync = sync;

	var fs = require$$0__default["default"];

	function isexe (path, options, cb) {
	  fs.stat(path, function (er, stat) {
	    cb(er, er ? false : checkStat(stat, options));
	  });
	}

	function sync (path, options) {
	  return checkStat(fs.statSync(path), options)
	}

	function checkStat (stat, options) {
	  return stat.isFile() && checkMode(stat, options)
	}

	function checkMode (stat, options) {
	  var mod = stat.mode;
	  var uid = stat.uid;
	  var gid = stat.gid;

	  var myUid = options.uid !== undefined ?
	    options.uid : process.getuid && process.getuid();
	  var myGid = options.gid !== undefined ?
	    options.gid : process.getgid && process.getgid();

	  var u = parseInt('100', 8);
	  var g = parseInt('010', 8);
	  var o = parseInt('001', 8);
	  var ug = u | g;

	  var ret = (mod & o) ||
	    (mod & g) && gid === myGid ||
	    (mod & u) && uid === myUid ||
	    (mod & ug) && myUid === 0;

	  return ret
	}
	return mode;
}

var core$1;
if (process.platform === 'win32' || commonjsGlobal.TESTING_WINDOWS) {
  core$1 = requireWindows();
} else {
  core$1 = requireMode();
}

var isexe_1 = isexe$1;
isexe$1.sync = sync;

function isexe$1 (path, options, cb) {
  if (typeof options === 'function') {
    cb = options;
    options = {};
  }

  if (!cb) {
    if (typeof Promise !== 'function') {
      throw new TypeError('callback not provided')
    }

    return new Promise(function (resolve, reject) {
      isexe$1(path, options || {}, function (er, is) {
        if (er) {
          reject(er);
        } else {
          resolve(is);
        }
      });
    })
  }

  core$1(path, options || {}, function (er, is) {
    // ignore EACCES because that just means we aren't allowed to run it
    if (er) {
      if (er.code === 'EACCES' || options && options.ignoreErrors) {
        er = null;
        is = false;
      }
    }
    cb(er, is);
  });
}

function sync (path, options) {
  // my kingdom for a filtered catch
  try {
    return core$1.sync(path, options || {})
  } catch (er) {
    if (options && options.ignoreErrors || er.code === 'EACCES') {
      return false
    } else {
      throw er
    }
  }
}

const isWindows = process.platform === 'win32' ||
    process.env.OSTYPE === 'cygwin' ||
    process.env.OSTYPE === 'msys';

const path$3 = require$$0__default$1["default"];
const COLON = isWindows ? ';' : ':';
const isexe = isexe_1;

const getNotFoundError = (cmd) =>
  Object.assign(new Error(`not found: ${cmd}`), { code: 'ENOENT' });

const getPathInfo = (cmd, opt) => {
  const colon = opt.colon || COLON;

  // If it has a slash, then we don't bother searching the pathenv.
  // just check the file itself, and that's it.
  const pathEnv = cmd.match(/\//) || isWindows && cmd.match(/\\/) ? ['']
    : (
      [
        // windows always checks the cwd first
        ...(isWindows ? [process.cwd()] : []),
        ...(opt.path || process.env.PATH ||
          /* istanbul ignore next: very unusual */ '').split(colon),
      ]
    );
  const pathExtExe = isWindows
    ? opt.pathExt || process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM'
    : '';
  const pathExt = isWindows ? pathExtExe.split(colon) : [''];

  if (isWindows) {
    if (cmd.indexOf('.') !== -1 && pathExt[0] !== '')
      pathExt.unshift('');
  }

  return {
    pathEnv,
    pathExt,
    pathExtExe,
  }
};

const which$1 = (cmd, opt, cb) => {
  if (typeof opt === 'function') {
    cb = opt;
    opt = {};
  }
  if (!opt)
    opt = {};

  const { pathEnv, pathExt, pathExtExe } = getPathInfo(cmd, opt);
  const found = [];

  const step = i => new Promise((resolve, reject) => {
    if (i === pathEnv.length)
      return opt.all && found.length ? resolve(found)
        : reject(getNotFoundError(cmd))

    const ppRaw = pathEnv[i];
    const pathPart = /^".*"$/.test(ppRaw) ? ppRaw.slice(1, -1) : ppRaw;

    const pCmd = path$3.join(pathPart, cmd);
    const p = !pathPart && /^\.[\\\/]/.test(cmd) ? cmd.slice(0, 2) + pCmd
      : pCmd;

    resolve(subStep(p, i, 0));
  });

  const subStep = (p, i, ii) => new Promise((resolve, reject) => {
    if (ii === pathExt.length)
      return resolve(step(i + 1))
    const ext = pathExt[ii];
    isexe(p + ext, { pathExt: pathExtExe }, (er, is) => {
      if (!er && is) {
        if (opt.all)
          found.push(p + ext);
        else
          return resolve(p + ext)
      }
      return resolve(subStep(p, i, ii + 1))
    });
  });

  return cb ? step(0).then(res => cb(null, res), cb) : step(0)
};

const whichSync = (cmd, opt) => {
  opt = opt || {};

  const { pathEnv, pathExt, pathExtExe } = getPathInfo(cmd, opt);
  const found = [];

  for (let i = 0; i < pathEnv.length; i ++) {
    const ppRaw = pathEnv[i];
    const pathPart = /^".*"$/.test(ppRaw) ? ppRaw.slice(1, -1) : ppRaw;

    const pCmd = path$3.join(pathPart, cmd);
    const p = !pathPart && /^\.[\\\/]/.test(cmd) ? cmd.slice(0, 2) + pCmd
      : pCmd;

    for (let j = 0; j < pathExt.length; j ++) {
      const cur = p + pathExt[j];
      try {
        const is = isexe.sync(cur, { pathExt: pathExtExe });
        if (is) {
          if (opt.all)
            found.push(cur);
          else
            return cur
        }
      } catch (ex) {}
    }
  }

  if (opt.all && found.length)
    return found

  if (opt.nothrow)
    return null

  throw getNotFoundError(cmd)
};

var which_1 = which$1;
which$1.sync = whichSync;

var pathKey$1 = {exports: {}};

const pathKey = (options = {}) => {
	const environment = options.env || process.env;
	const platform = options.platform || process.platform;

	if (platform !== 'win32') {
		return 'PATH';
	}

	return Object.keys(environment).reverse().find(key => key.toUpperCase() === 'PATH') || 'Path';
};

pathKey$1.exports = pathKey;
// TODO: Remove this for the next major release
pathKey$1.exports.default = pathKey;

const path$2 = require$$0__default$1["default"];
const which = which_1;
const getPathKey = pathKey$1.exports;

function resolveCommandAttempt(parsed, withoutPathExt) {
    const env = parsed.options.env || process.env;
    const cwd = process.cwd();
    const hasCustomCwd = parsed.options.cwd != null;
    // Worker threads do not have process.chdir()
    const shouldSwitchCwd = hasCustomCwd && process.chdir !== undefined && !process.chdir.disabled;

    // If a custom `cwd` was specified, we need to change the process cwd
    // because `which` will do stat calls but does not support a custom cwd
    if (shouldSwitchCwd) {
        try {
            process.chdir(parsed.options.cwd);
        } catch (err) {
            /* Empty */
        }
    }

    let resolved;

    try {
        resolved = which.sync(parsed.command, {
            path: env[getPathKey({ env })],
            pathExt: withoutPathExt ? path$2.delimiter : undefined,
        });
    } catch (e) {
        /* Empty */
    } finally {
        if (shouldSwitchCwd) {
            process.chdir(cwd);
        }
    }

    // If we successfully resolved, ensure that an absolute path is returned
    // Note that when a custom `cwd` was used, we need to resolve to an absolute path based on it
    if (resolved) {
        resolved = path$2.resolve(hasCustomCwd ? parsed.options.cwd : '', resolved);
    }

    return resolved;
}

function resolveCommand$1(parsed) {
    return resolveCommandAttempt(parsed) || resolveCommandAttempt(parsed, true);
}

var resolveCommand_1 = resolveCommand$1;

var _escape = {};

// See http://www.robvanderwoude.com/escapechars.php
const metaCharsRegExp = /([()\][%!^"`<>&|;, *?])/g;

function escapeCommand(arg) {
    // Escape meta chars
    arg = arg.replace(metaCharsRegExp, '^$1');

    return arg;
}

function escapeArgument(arg, doubleEscapeMetaChars) {
    // Convert to string
    arg = `${arg}`;

    // Algorithm below is based on https://qntm.org/cmd

    // Sequence of backslashes followed by a double quote:
    // double up all the backslashes and escape the double quote
    arg = arg.replace(/(\\*)"/g, '$1$1\\"');

    // Sequence of backslashes followed by the end of the string
    // (which will become a double quote later):
    // double up all the backslashes
    arg = arg.replace(/(\\*)$/, '$1$1');

    // All other backslashes occur literally

    // Quote the whole thing:
    arg = `"${arg}"`;

    // Escape meta chars
    arg = arg.replace(metaCharsRegExp, '^$1');

    // Double escape meta chars if necessary
    if (doubleEscapeMetaChars) {
        arg = arg.replace(metaCharsRegExp, '^$1');
    }

    return arg;
}

_escape.command = escapeCommand;
_escape.argument = escapeArgument;

var shebangRegex$1 = /^#!(.*)/;

const shebangRegex = shebangRegex$1;

var shebangCommand$1 = (string = '') => {
	const match = string.match(shebangRegex);

	if (!match) {
		return null;
	}

	const [path, argument] = match[0].replace(/#! ?/, '').split(' ');
	const binary = path.split('/').pop();

	if (binary === 'env') {
		return argument;
	}

	return argument ? `${binary} ${argument}` : binary;
};

const fs = require$$0__default["default"];
const shebangCommand = shebangCommand$1;

function readShebang$1(command) {
    // Read the first 150 bytes from the file
    const size = 150;
    const buffer = Buffer.alloc(size);

    let fd;

    try {
        fd = fs.openSync(command, 'r');
        fs.readSync(fd, buffer, 0, size, 0);
        fs.closeSync(fd);
    } catch (e) { /* Empty */ }

    // Attempt to extract shebang (null is returned if not a shebang)
    return shebangCommand(buffer.toString());
}

var readShebang_1 = readShebang$1;

const path$1 = require$$0__default$1["default"];
const resolveCommand = resolveCommand_1;
const escape = _escape;
const readShebang = readShebang_1;

const isWin$2 = process.platform === 'win32';
const isExecutableRegExp = /\.(?:com|exe)$/i;
const isCmdShimRegExp = /node_modules[\\/].bin[\\/][^\\/]+\.cmd$/i;

function detectShebang(parsed) {
    parsed.file = resolveCommand(parsed);

    const shebang = parsed.file && readShebang(parsed.file);

    if (shebang) {
        parsed.args.unshift(parsed.file);
        parsed.command = shebang;

        return resolveCommand(parsed);
    }

    return parsed.file;
}

function parseNonShell(parsed) {
    if (!isWin$2) {
        return parsed;
    }

    // Detect & add support for shebangs
    const commandFile = detectShebang(parsed);

    // We don't need a shell if the command filename is an executable
    const needsShell = !isExecutableRegExp.test(commandFile);

    // If a shell is required, use cmd.exe and take care of escaping everything correctly
    // Note that `forceShell` is an hidden option used only in tests
    if (parsed.options.forceShell || needsShell) {
        // Need to double escape meta chars if the command is a cmd-shim located in `node_modules/.bin/`
        // The cmd-shim simply calls execute the package bin file with NodeJS, proxying any argument
        // Because the escape of metachars with ^ gets interpreted when the cmd.exe is first called,
        // we need to double escape them
        const needsDoubleEscapeMetaChars = isCmdShimRegExp.test(commandFile);

        // Normalize posix paths into OS compatible paths (e.g.: foo/bar -> foo\bar)
        // This is necessary otherwise it will always fail with ENOENT in those cases
        parsed.command = path$1.normalize(parsed.command);

        // Escape command & arguments
        parsed.command = escape.command(parsed.command);
        parsed.args = parsed.args.map((arg) => escape.argument(arg, needsDoubleEscapeMetaChars));

        const shellCommand = [parsed.command].concat(parsed.args).join(' ');

        parsed.args = ['/d', '/s', '/c', `"${shellCommand}"`];
        parsed.command = process.env.comspec || 'cmd.exe';
        parsed.options.windowsVerbatimArguments = true; // Tell node's spawn that the arguments are already escaped
    }

    return parsed;
}

function parse$1(command, args, options) {
    // Normalize arguments, similar to nodejs
    if (args && !Array.isArray(args)) {
        options = args;
        args = null;
    }

    args = args ? args.slice(0) : []; // Clone array to avoid changing the original
    options = Object.assign({}, options); // Clone object to avoid changing the original

    // Build our parsed object
    const parsed = {
        command,
        args,
        options,
        file: undefined,
        original: {
            command,
            args,
        },
    };

    // Delegate further parsing to shell or non-shell
    return options.shell ? parsed : parseNonShell(parsed);
}

var parse_1 = parse$1;

const isWin$1 = process.platform === 'win32';

function notFoundError(original, syscall) {
    return Object.assign(new Error(`${syscall} ${original.command} ENOENT`), {
        code: 'ENOENT',
        errno: 'ENOENT',
        syscall: `${syscall} ${original.command}`,
        path: original.command,
        spawnargs: original.args,
    });
}

function hookChildProcess(cp, parsed) {
    if (!isWin$1) {
        return;
    }

    const originalEmit = cp.emit;

    cp.emit = function (name, arg1) {
        // If emitting "exit" event and exit code is 1, we need to check if
        // the command exists and emit an "error" instead
        // See https://github.com/IndigoUnited/node-cross-spawn/issues/16
        if (name === 'exit') {
            const err = verifyENOENT(arg1, parsed);

            if (err) {
                return originalEmit.call(cp, 'error', err);
            }
        }

        return originalEmit.apply(cp, arguments); // eslint-disable-line prefer-rest-params
    };
}

function verifyENOENT(status, parsed) {
    if (isWin$1 && status === 1 && !parsed.file) {
        return notFoundError(parsed.original, 'spawn');
    }

    return null;
}

function verifyENOENTSync(status, parsed) {
    if (isWin$1 && status === 1 && !parsed.file) {
        return notFoundError(parsed.original, 'spawnSync');
    }

    return null;
}

var enoent$1 = {
    hookChildProcess,
    verifyENOENT,
    verifyENOENTSync,
    notFoundError,
};

const cp = require$$0__default$2["default"];
const parse = parse_1;
const enoent = enoent$1;

function spawn(command, args, options) {
    // Parse the arguments
    const parsed = parse(command, args, options);

    // Spawn the child process
    const spawned = cp.spawn(parsed.command, parsed.args, parsed.options);

    // Hook into child process "exit" event to emit an error if the command
    // does not exists, see: https://github.com/IndigoUnited/node-cross-spawn/issues/16
    enoent.hookChildProcess(spawned, parsed);

    return spawned;
}

function spawnSync(command, args, options) {
    // Parse the arguments
    const parsed = parse(command, args, options);

    // Spawn the child process
    const result = cp.spawnSync(parsed.command, parsed.args, parsed.options);

    // Analyze if the command does not exist, see: https://github.com/IndigoUnited/node-cross-spawn/issues/16
    result.error = result.error || enoent.verifyENOENTSync(result.status, parsed);

    return result;
}

crossSpawn$1.exports = spawn;
crossSpawn$1.exports.spawn = spawn;
crossSpawn$1.exports.sync = spawnSync;

crossSpawn$1.exports._parse = parse;
crossSpawn$1.exports._enoent = enoent;

var stripFinalNewline$1 = input => {
	const LF = typeof input === 'string' ? '\n' : '\n'.charCodeAt();
	const CR = typeof input === 'string' ? '\r' : '\r'.charCodeAt();

	if (input[input.length - 1] === LF) {
		input = input.slice(0, input.length - 1);
	}

	if (input[input.length - 1] === CR) {
		input = input.slice(0, input.length - 1);
	}

	return input;
};

var npmRunPath$1 = {exports: {}};

(function (module) {
	const path = require$$0__default$1["default"];
	const pathKey = pathKey$1.exports;

	const npmRunPath = options => {
		options = {
			cwd: process.cwd(),
			path: process.env[pathKey()],
			execPath: process.execPath,
			...options
		};

		let previous;
		let cwdPath = path.resolve(options.cwd);
		const result = [];

		while (previous !== cwdPath) {
			result.push(path.join(cwdPath, 'node_modules/.bin'));
			previous = cwdPath;
			cwdPath = path.resolve(cwdPath, '..');
		}

		// Ensure the running `node` binary is used
		const execPathDir = path.resolve(options.cwd, options.execPath, '..');
		result.push(execPathDir);

		return result.concat(options.path).join(path.delimiter);
	};

	module.exports = npmRunPath;
	// TODO: Remove this for the next major release
	module.exports.default = npmRunPath;

	module.exports.env = options => {
		options = {
			env: process.env,
			...options
		};

		const env = {...options.env};
		const path = pathKey({env});

		options.path = env[path];
		env[path] = module.exports(options);

		return env;
	};
} (npmRunPath$1));

var onetime$5 = {exports: {}};

var mimicFn$5 = {exports: {}};

const mimicFn$4 = (to, from) => {
	for (const prop of Reflect.ownKeys(from)) {
		Object.defineProperty(to, prop, Object.getOwnPropertyDescriptor(from, prop));
	}

	return to;
};

mimicFn$5.exports = mimicFn$4;
// TODO: Remove this for the next major release
mimicFn$5.exports.default = mimicFn$4;

const mimicFn$3 = mimicFn$5.exports;

const calledFunctions$2 = new WeakMap();

const onetime$4 = (function_, options = {}) => {
	if (typeof function_ !== 'function') {
		throw new TypeError('Expected a function');
	}

	let returnValue;
	let callCount = 0;
	const functionName = function_.displayName || function_.name || '<anonymous>';

	const onetime = function (...arguments_) {
		calledFunctions$2.set(onetime, ++callCount);

		if (callCount === 1) {
			returnValue = function_.apply(this, arguments_);
			function_ = null;
		} else if (options.throw === true) {
			throw new Error(`Function \`${functionName}\` can only be called once`);
		}

		return returnValue;
	};

	mimicFn$3(onetime, function_);
	calledFunctions$2.set(onetime, callCount);

	return onetime;
};

onetime$5.exports = onetime$4;
// TODO: Remove this for the next major release
onetime$5.exports.default = onetime$4;

onetime$5.exports.callCount = function_ => {
	if (!calledFunctions$2.has(function_)) {
		throw new Error(`The given function \`${function_.name}\` is not wrapped by the \`onetime\` package`);
	}

	return calledFunctions$2.get(function_);
};

var main = {};

var signals$2 = {};

var core = {};

Object.defineProperty(core,"__esModule",{value:true});core.SIGNALS=void 0;

const SIGNALS=[
{
name:"SIGHUP",
number:1,
action:"terminate",
description:"Terminal closed",
standard:"posix"},

{
name:"SIGINT",
number:2,
action:"terminate",
description:"User interruption with CTRL-C",
standard:"ansi"},

{
name:"SIGQUIT",
number:3,
action:"core",
description:"User interruption with CTRL-\\",
standard:"posix"},

{
name:"SIGILL",
number:4,
action:"core",
description:"Invalid machine instruction",
standard:"ansi"},

{
name:"SIGTRAP",
number:5,
action:"core",
description:"Debugger breakpoint",
standard:"posix"},

{
name:"SIGABRT",
number:6,
action:"core",
description:"Aborted",
standard:"ansi"},

{
name:"SIGIOT",
number:6,
action:"core",
description:"Aborted",
standard:"bsd"},

{
name:"SIGBUS",
number:7,
action:"core",
description:
"Bus error due to misaligned, non-existing address or paging error",
standard:"bsd"},

{
name:"SIGEMT",
number:7,
action:"terminate",
description:"Command should be emulated but is not implemented",
standard:"other"},

{
name:"SIGFPE",
number:8,
action:"core",
description:"Floating point arithmetic error",
standard:"ansi"},

{
name:"SIGKILL",
number:9,
action:"terminate",
description:"Forced termination",
standard:"posix",
forced:true},

{
name:"SIGUSR1",
number:10,
action:"terminate",
description:"Application-specific signal",
standard:"posix"},

{
name:"SIGSEGV",
number:11,
action:"core",
description:"Segmentation fault",
standard:"ansi"},

{
name:"SIGUSR2",
number:12,
action:"terminate",
description:"Application-specific signal",
standard:"posix"},

{
name:"SIGPIPE",
number:13,
action:"terminate",
description:"Broken pipe or socket",
standard:"posix"},

{
name:"SIGALRM",
number:14,
action:"terminate",
description:"Timeout or timer",
standard:"posix"},

{
name:"SIGTERM",
number:15,
action:"terminate",
description:"Termination",
standard:"ansi"},

{
name:"SIGSTKFLT",
number:16,
action:"terminate",
description:"Stack is empty or overflowed",
standard:"other"},

{
name:"SIGCHLD",
number:17,
action:"ignore",
description:"Child process terminated, paused or unpaused",
standard:"posix"},

{
name:"SIGCLD",
number:17,
action:"ignore",
description:"Child process terminated, paused or unpaused",
standard:"other"},

{
name:"SIGCONT",
number:18,
action:"unpause",
description:"Unpaused",
standard:"posix",
forced:true},

{
name:"SIGSTOP",
number:19,
action:"pause",
description:"Paused",
standard:"posix",
forced:true},

{
name:"SIGTSTP",
number:20,
action:"pause",
description:"Paused using CTRL-Z or \"suspend\"",
standard:"posix"},

{
name:"SIGTTIN",
number:21,
action:"pause",
description:"Background process cannot read terminal input",
standard:"posix"},

{
name:"SIGBREAK",
number:21,
action:"terminate",
description:"User interruption with CTRL-BREAK",
standard:"other"},

{
name:"SIGTTOU",
number:22,
action:"pause",
description:"Background process cannot write to terminal output",
standard:"posix"},

{
name:"SIGURG",
number:23,
action:"ignore",
description:"Socket received out-of-band data",
standard:"bsd"},

{
name:"SIGXCPU",
number:24,
action:"core",
description:"Process timed out",
standard:"bsd"},

{
name:"SIGXFSZ",
number:25,
action:"core",
description:"File too big",
standard:"bsd"},

{
name:"SIGVTALRM",
number:26,
action:"terminate",
description:"Timeout or timer",
standard:"bsd"},

{
name:"SIGPROF",
number:27,
action:"terminate",
description:"Timeout or timer",
standard:"bsd"},

{
name:"SIGWINCH",
number:28,
action:"ignore",
description:"Terminal window size changed",
standard:"bsd"},

{
name:"SIGIO",
number:29,
action:"terminate",
description:"I/O is available",
standard:"other"},

{
name:"SIGPOLL",
number:29,
action:"terminate",
description:"Watched event",
standard:"other"},

{
name:"SIGINFO",
number:29,
action:"ignore",
description:"Request for process information",
standard:"other"},

{
name:"SIGPWR",
number:30,
action:"terminate",
description:"Device running out of power",
standard:"systemv"},

{
name:"SIGSYS",
number:31,
action:"core",
description:"Invalid system call",
standard:"other"},

{
name:"SIGUNUSED",
number:31,
action:"terminate",
description:"Invalid system call",
standard:"other"}];core.SIGNALS=SIGNALS;

var realtime = {};

Object.defineProperty(realtime,"__esModule",{value:true});realtime.SIGRTMAX=realtime.getRealtimeSignals=void 0;
const getRealtimeSignals=function(){
const length=SIGRTMAX-SIGRTMIN+1;
return Array.from({length},getRealtimeSignal);
};realtime.getRealtimeSignals=getRealtimeSignals;

const getRealtimeSignal=function(value,index){
return {
name:`SIGRT${index+1}`,
number:SIGRTMIN+index,
action:"terminate",
description:"Application-specific signal (realtime)",
standard:"posix"};

};

const SIGRTMIN=34;
const SIGRTMAX=64;realtime.SIGRTMAX=SIGRTMAX;

Object.defineProperty(signals$2,"__esModule",{value:true});signals$2.getSignals=void 0;var _os$1=require$$0__default$3["default"];

var _core=core;
var _realtime$1=realtime;



const getSignals=function(){
const realtimeSignals=(0, _realtime$1.getRealtimeSignals)();
const signals=[..._core.SIGNALS,...realtimeSignals].map(normalizeSignal);
return signals;
};signals$2.getSignals=getSignals;







const normalizeSignal=function({
name,
number:defaultNumber,
description,
action,
forced=false,
standard})
{
const{
signals:{[name]:constantSignal}}=
_os$1.constants;
const supported=constantSignal!==undefined;
const number=supported?constantSignal:defaultNumber;
return {name,number,description,supported,action,forced,standard};
};

Object.defineProperty(main,"__esModule",{value:true});main.signalsByNumber=main.signalsByName=void 0;var _os=require$$0__default$3["default"];

var _signals=signals$2;
var _realtime=realtime;



const getSignalsByName=function(){
const signals=(0, _signals.getSignals)();
return signals.reduce(getSignalByName,{});
};

const getSignalByName=function(
signalByNameMemo,
{name,number,description,supported,action,forced,standard})
{
return {
...signalByNameMemo,
[name]:{name,number,description,supported,action,forced,standard}};

};

const signalsByName$1=getSignalsByName();main.signalsByName=signalsByName$1;




const getSignalsByNumber=function(){
const signals=(0, _signals.getSignals)();
const length=_realtime.SIGRTMAX+1;
const signalsA=Array.from({length},(value,number)=>
getSignalByNumber(number,signals));

return Object.assign({},...signalsA);
};

const getSignalByNumber=function(number,signals){
const signal=findSignalByNumber(number,signals);

if(signal===undefined){
return {};
}

const{name,description,supported,action,forced,standard}=signal;
return {
[number]:{
name,
number,
description,
supported,
action,
forced,
standard}};


};



const findSignalByNumber=function(number,signals){
const signal=signals.find(({name})=>_os.constants.signals[name]===number);

if(signal!==undefined){
return signal;
}

return signals.find(signalA=>signalA.number===number);
};

const signalsByNumber=getSignalsByNumber();main.signalsByNumber=signalsByNumber;

const {signalsByName} = main;

const getErrorPrefix = ({timedOut, timeout, errorCode, signal, signalDescription, exitCode, isCanceled}) => {
	if (timedOut) {
		return `timed out after ${timeout} milliseconds`;
	}

	if (isCanceled) {
		return 'was canceled';
	}

	if (errorCode !== undefined) {
		return `failed with ${errorCode}`;
	}

	if (signal !== undefined) {
		return `was killed with ${signal} (${signalDescription})`;
	}

	if (exitCode !== undefined) {
		return `failed with exit code ${exitCode}`;
	}

	return 'failed';
};

const makeError$1 = ({
	stdout,
	stderr,
	all,
	error,
	signal,
	exitCode,
	command,
	escapedCommand,
	timedOut,
	isCanceled,
	killed,
	parsed: {options: {timeout}}
}) => {
	// `signal` and `exitCode` emitted on `spawned.on('exit')` event can be `null`.
	// We normalize them to `undefined`
	exitCode = exitCode === null ? undefined : exitCode;
	signal = signal === null ? undefined : signal;
	const signalDescription = signal === undefined ? undefined : signalsByName[signal].description;

	const errorCode = error && error.code;

	const prefix = getErrorPrefix({timedOut, timeout, errorCode, signal, signalDescription, exitCode, isCanceled});
	const execaMessage = `Command ${prefix}: ${command}`;
	const isError = Object.prototype.toString.call(error) === '[object Error]';
	const shortMessage = isError ? `${execaMessage}\n${error.message}` : execaMessage;
	const message = [shortMessage, stderr, stdout].filter(Boolean).join('\n');

	if (isError) {
		error.originalMessage = error.message;
		error.message = message;
	} else {
		error = new Error(message);
	}

	error.shortMessage = shortMessage;
	error.command = command;
	error.escapedCommand = escapedCommand;
	error.exitCode = exitCode;
	error.signal = signal;
	error.signalDescription = signalDescription;
	error.stdout = stdout;
	error.stderr = stderr;

	if (all !== undefined) {
		error.all = all;
	}

	if ('bufferedData' in error) {
		delete error.bufferedData;
	}

	error.failed = true;
	error.timedOut = Boolean(timedOut);
	error.isCanceled = isCanceled;
	error.killed = killed && !timedOut;

	return error;
};

var error = makeError$1;

var stdio = {exports: {}};

const aliases = ['stdin', 'stdout', 'stderr'];

const hasAlias = options => aliases.some(alias => options[alias] !== undefined);

const normalizeStdio$1 = options => {
	if (!options) {
		return;
	}

	const {stdio} = options;

	if (stdio === undefined) {
		return aliases.map(alias => options[alias]);
	}

	if (hasAlias(options)) {
		throw new Error(`It's not possible to provide \`stdio\` in combination with one of ${aliases.map(alias => `\`${alias}\``).join(', ')}`);
	}

	if (typeof stdio === 'string') {
		return stdio;
	}

	if (!Array.isArray(stdio)) {
		throw new TypeError(`Expected \`stdio\` to be of type \`string\` or \`Array\`, got \`${typeof stdio}\``);
	}

	const length = Math.max(stdio.length, aliases.length);
	return Array.from({length}, (value, index) => stdio[index]);
};

stdio.exports = normalizeStdio$1;

// `ipc` is pushed unless it is already present
stdio.exports.node = options => {
	const stdio = normalizeStdio$1(options);

	if (stdio === 'ipc') {
		return 'ipc';
	}

	if (stdio === undefined || typeof stdio === 'string') {
		return [stdio, stdio, stdio, 'ipc'];
	}

	if (stdio.includes('ipc')) {
		return stdio;
	}

	return [...stdio, 'ipc'];
};

var signalExit = {exports: {}};

var signals$1 = {exports: {}};

var hasRequiredSignals;

function requireSignals () {
	if (hasRequiredSignals) return signals$1.exports;
	hasRequiredSignals = 1;
	(function (module) {
		// This is not the set of all possible signals.
		//
		// It IS, however, the set of all signals that trigger
		// an exit on either Linux or BSD systems.  Linux is a
		// superset of the signal names supported on BSD, and
		// the unknown signals just fail to register, so we can
		// catch that easily enough.
		//
		// Don't bother with SIGKILL.  It's uncatchable, which
		// means that we can't fire any callbacks anyway.
		//
		// If a user does happen to register a handler on a non-
		// fatal signal like SIGWINCH or something, and then
		// exit, it'll end up firing `process.emit('exit')`, so
		// the handler will be fired anyway.
		//
		// SIGBUS, SIGFPE, SIGSEGV and SIGILL, when not raised
		// artificially, inherently leave the process in a
		// state from which it is not safe to try and enter JS
		// listeners.
		module.exports = [
		  'SIGABRT',
		  'SIGALRM',
		  'SIGHUP',
		  'SIGINT',
		  'SIGTERM'
		];

		if (process.platform !== 'win32') {
		  module.exports.push(
		    'SIGVTALRM',
		    'SIGXCPU',
		    'SIGXFSZ',
		    'SIGUSR2',
		    'SIGTRAP',
		    'SIGSYS',
		    'SIGQUIT',
		    'SIGIOT'
		    // should detect profiler and enable/disable accordingly.
		    // see #21
		    // 'SIGPROF'
		  );
		}

		if (process.platform === 'linux') {
		  module.exports.push(
		    'SIGIO',
		    'SIGPOLL',
		    'SIGPWR',
		    'SIGSTKFLT',
		    'SIGUNUSED'
		  );
		}
} (signals$1));
	return signals$1.exports;
}

// Note: since nyc uses this module to output coverage, any lines
// that are in the direct sync flow of nyc's outputCoverage are
// ignored, since we can never get coverage for them.
// grab a reference to node's real process object right away
var process$1 = commonjsGlobal.process;

const processOk = function (process) {
  return process &&
    typeof process === 'object' &&
    typeof process.removeListener === 'function' &&
    typeof process.emit === 'function' &&
    typeof process.reallyExit === 'function' &&
    typeof process.listeners === 'function' &&
    typeof process.kill === 'function' &&
    typeof process.pid === 'number' &&
    typeof process.on === 'function'
};

// some kind of non-node environment, just no-op
/* istanbul ignore if */
if (!processOk(process$1)) {
  signalExit.exports = function () {
    return function () {}
  };
} else {
  var assert = require$$0__default$4["default"];
  var signals = requireSignals();
  var isWin = /^win/i.test(process$1.platform);

  var EE = require$$2__default["default"];
  /* istanbul ignore if */
  if (typeof EE !== 'function') {
    EE = EE.EventEmitter;
  }

  var emitter;
  if (process$1.__signal_exit_emitter__) {
    emitter = process$1.__signal_exit_emitter__;
  } else {
    emitter = process$1.__signal_exit_emitter__ = new EE();
    emitter.count = 0;
    emitter.emitted = {};
  }

  // Because this emitter is a global, we have to check to see if a
  // previous version of this library failed to enable infinite listeners.
  // I know what you're about to say.  But literally everything about
  // signal-exit is a compromise with evil.  Get used to it.
  if (!emitter.infinite) {
    emitter.setMaxListeners(Infinity);
    emitter.infinite = true;
  }

  signalExit.exports = function (cb, opts) {
    /* istanbul ignore if */
    if (!processOk(commonjsGlobal.process)) {
      return function () {}
    }
    assert.equal(typeof cb, 'function', 'a callback must be provided for exit handler');

    if (loaded === false) {
      load();
    }

    var ev = 'exit';
    if (opts && opts.alwaysLast) {
      ev = 'afterexit';
    }

    var remove = function () {
      emitter.removeListener(ev, cb);
      if (emitter.listeners('exit').length === 0 &&
          emitter.listeners('afterexit').length === 0) {
        unload();
      }
    };
    emitter.on(ev, cb);

    return remove
  };

  var unload = function unload () {
    if (!loaded || !processOk(commonjsGlobal.process)) {
      return
    }
    loaded = false;

    signals.forEach(function (sig) {
      try {
        process$1.removeListener(sig, sigListeners[sig]);
      } catch (er) {}
    });
    process$1.emit = originalProcessEmit;
    process$1.reallyExit = originalProcessReallyExit;
    emitter.count -= 1;
  };
  signalExit.exports.unload = unload;

  var emit = function emit (event, code, signal) {
    /* istanbul ignore if */
    if (emitter.emitted[event]) {
      return
    }
    emitter.emitted[event] = true;
    emitter.emit(event, code, signal);
  };

  // { <signal>: <listener fn>, ... }
  var sigListeners = {};
  signals.forEach(function (sig) {
    sigListeners[sig] = function listener () {
      /* istanbul ignore if */
      if (!processOk(commonjsGlobal.process)) {
        return
      }
      // If there are no other listeners, an exit is coming!
      // Simplest way: remove us and then re-send the signal.
      // We know that this will kill the process, so we can
      // safely emit now.
      var listeners = process$1.listeners(sig);
      if (listeners.length === emitter.count) {
        unload();
        emit('exit', null, sig);
        /* istanbul ignore next */
        emit('afterexit', null, sig);
        /* istanbul ignore next */
        if (isWin && sig === 'SIGHUP') {
          // "SIGHUP" throws an `ENOSYS` error on Windows,
          // so use a supported signal instead
          sig = 'SIGINT';
        }
        /* istanbul ignore next */
        process$1.kill(process$1.pid, sig);
      }
    };
  });

  signalExit.exports.signals = function () {
    return signals
  };

  var loaded = false;

  var load = function load () {
    if (loaded || !processOk(commonjsGlobal.process)) {
      return
    }
    loaded = true;

    // This is the number of onSignalExit's that are in play.
    // It's important so that we can count the correct number of
    // listeners on signals, and don't wait for the other one to
    // handle it instead of us.
    emitter.count += 1;

    signals = signals.filter(function (sig) {
      try {
        process$1.on(sig, sigListeners[sig]);
        return true
      } catch (er) {
        return false
      }
    });

    process$1.emit = processEmit;
    process$1.reallyExit = processReallyExit;
  };
  signalExit.exports.load = load;

  var originalProcessReallyExit = process$1.reallyExit;
  var processReallyExit = function processReallyExit (code) {
    /* istanbul ignore if */
    if (!processOk(commonjsGlobal.process)) {
      return
    }
    process$1.exitCode = code || /* istanbul ignore next */ 0;
    emit('exit', process$1.exitCode, null);
    /* istanbul ignore next */
    emit('afterexit', process$1.exitCode, null);
    /* istanbul ignore next */
    originalProcessReallyExit.call(process$1, process$1.exitCode);
  };

  var originalProcessEmit = process$1.emit;
  var processEmit = function processEmit (ev, arg) {
    if (ev === 'exit' && processOk(commonjsGlobal.process)) {
      /* istanbul ignore else */
      if (arg !== undefined) {
        process$1.exitCode = arg;
      }
      var ret = originalProcessEmit.apply(this, arguments);
      /* istanbul ignore next */
      emit('exit', process$1.exitCode, null);
      /* istanbul ignore next */
      emit('afterexit', process$1.exitCode, null);
      /* istanbul ignore next */
      return ret
    } else {
      return originalProcessEmit.apply(this, arguments)
    }
  };
}

const os = require$$0__default$3["default"];
const onExit = signalExit.exports;

const DEFAULT_FORCE_KILL_TIMEOUT = 1000 * 5;

// Monkey-patches `childProcess.kill()` to add `forceKillAfterTimeout` behavior
const spawnedKill$1 = (kill, signal = 'SIGTERM', options = {}) => {
	const killResult = kill(signal);
	setKillTimeout(kill, signal, options, killResult);
	return killResult;
};

const setKillTimeout = (kill, signal, options, killResult) => {
	if (!shouldForceKill(signal, options, killResult)) {
		return;
	}

	const timeout = getForceKillAfterTimeout(options);
	const t = setTimeout(() => {
		kill('SIGKILL');
	}, timeout);

	// Guarded because there's no `.unref()` when `execa` is used in the renderer
	// process in Electron. This cannot be tested since we don't run tests in
	// Electron.
	// istanbul ignore else
	if (t.unref) {
		t.unref();
	}
};

const shouldForceKill = (signal, {forceKillAfterTimeout}, killResult) => {
	return isSigterm(signal) && forceKillAfterTimeout !== false && killResult;
};

const isSigterm = signal => {
	return signal === os.constants.signals.SIGTERM ||
		(typeof signal === 'string' && signal.toUpperCase() === 'SIGTERM');
};

const getForceKillAfterTimeout = ({forceKillAfterTimeout = true}) => {
	if (forceKillAfterTimeout === true) {
		return DEFAULT_FORCE_KILL_TIMEOUT;
	}

	if (!Number.isFinite(forceKillAfterTimeout) || forceKillAfterTimeout < 0) {
		throw new TypeError(`Expected the \`forceKillAfterTimeout\` option to be a non-negative integer, got \`${forceKillAfterTimeout}\` (${typeof forceKillAfterTimeout})`);
	}

	return forceKillAfterTimeout;
};

// `childProcess.cancel()`
const spawnedCancel$1 = (spawned, context) => {
	const killResult = spawned.kill();

	if (killResult) {
		context.isCanceled = true;
	}
};

const timeoutKill = (spawned, signal, reject) => {
	spawned.kill(signal);
	reject(Object.assign(new Error('Timed out'), {timedOut: true, signal}));
};

// `timeout` option handling
const setupTimeout$1 = (spawned, {timeout, killSignal = 'SIGTERM'}, spawnedPromise) => {
	if (timeout === 0 || timeout === undefined) {
		return spawnedPromise;
	}

	let timeoutId;
	const timeoutPromise = new Promise((resolve, reject) => {
		timeoutId = setTimeout(() => {
			timeoutKill(spawned, killSignal, reject);
		}, timeout);
	});

	const safeSpawnedPromise = spawnedPromise.finally(() => {
		clearTimeout(timeoutId);
	});

	return Promise.race([timeoutPromise, safeSpawnedPromise]);
};

const validateTimeout$1 = ({timeout}) => {
	if (timeout !== undefined && (!Number.isFinite(timeout) || timeout < 0)) {
		throw new TypeError(`Expected the \`timeout\` option to be a non-negative integer, got \`${timeout}\` (${typeof timeout})`);
	}
};

// `cleanup` option handling
const setExitHandler$1 = async (spawned, {cleanup, detached}, timedPromise) => {
	if (!cleanup || detached) {
		return timedPromise;
	}

	const removeExitHandler = onExit(() => {
		spawned.kill();
	});

	return timedPromise.finally(() => {
		removeExitHandler();
	});
};

var kill = {
	spawnedKill: spawnedKill$1,
	spawnedCancel: spawnedCancel$1,
	setupTimeout: setupTimeout$1,
	validateTimeout: validateTimeout$1,
	setExitHandler: setExitHandler$1
};

const isStream$1 = stream =>
	stream !== null &&
	typeof stream === 'object' &&
	typeof stream.pipe === 'function';

isStream$1.writable = stream =>
	isStream$1(stream) &&
	stream.writable !== false &&
	typeof stream._write === 'function' &&
	typeof stream._writableState === 'object';

isStream$1.readable = stream =>
	isStream$1(stream) &&
	stream.readable !== false &&
	typeof stream._read === 'function' &&
	typeof stream._readableState === 'object';

isStream$1.duplex = stream =>
	isStream$1.writable(stream) &&
	isStream$1.readable(stream);

isStream$1.transform = stream =>
	isStream$1.duplex(stream) &&
	typeof stream._transform === 'function';

var isStream_1 = isStream$1;

var getStream$2 = {exports: {}};

const {PassThrough: PassThroughStream} = require$$0__default$5["default"];

var bufferStream$1 = options => {
	options = {...options};

	const {array} = options;
	let {encoding} = options;
	const isBuffer = encoding === 'buffer';
	let objectMode = false;

	if (array) {
		objectMode = !(encoding || isBuffer);
	} else {
		encoding = encoding || 'utf8';
	}

	if (isBuffer) {
		encoding = null;
	}

	const stream = new PassThroughStream({objectMode});

	if (encoding) {
		stream.setEncoding(encoding);
	}

	let length = 0;
	const chunks = [];

	stream.on('data', chunk => {
		chunks.push(chunk);

		if (objectMode) {
			length = chunks.length;
		} else {
			length += chunk.length;
		}
	});

	stream.getBufferedValue = () => {
		if (array) {
			return chunks;
		}

		return isBuffer ? Buffer.concat(chunks, length) : chunks.join('');
	};

	stream.getBufferedLength = () => length;

	return stream;
};

const {constants: BufferConstants} = require$$0__default$6["default"];
const stream$2 = require$$0__default$5["default"];
const {promisify} = require$$2__default$1["default"];
const bufferStream = bufferStream$1;

const streamPipelinePromisified = promisify(stream$2.pipeline);

class MaxBufferError extends Error {
	constructor() {
		super('maxBuffer exceeded');
		this.name = 'MaxBufferError';
	}
}

async function getStream$1(inputStream, options) {
	if (!inputStream) {
		throw new Error('Expected a stream');
	}

	options = {
		maxBuffer: Infinity,
		...options
	};

	const {maxBuffer} = options;
	const stream = bufferStream(options);

	await new Promise((resolve, reject) => {
		const rejectPromise = error => {
			// Don't retrieve an oversized buffer.
			if (error && stream.getBufferedLength() <= BufferConstants.MAX_LENGTH) {
				error.bufferedData = stream.getBufferedValue();
			}

			reject(error);
		};

		(async () => {
			try {
				await streamPipelinePromisified(inputStream, stream);
				resolve();
			} catch (error) {
				rejectPromise(error);
			}
		})();

		stream.on('data', () => {
			if (stream.getBufferedLength() > maxBuffer) {
				rejectPromise(new MaxBufferError());
			}
		});
	});

	return stream.getBufferedValue();
}

getStream$2.exports = getStream$1;
getStream$2.exports.buffer = (stream, options) => getStream$1(stream, {...options, encoding: 'buffer'});
getStream$2.exports.array = (stream, options) => getStream$1(stream, {...options, array: true});
getStream$2.exports.MaxBufferError = MaxBufferError;

const { PassThrough } = require$$0__default$5["default"];

var mergeStream$1 = function (/*streams...*/) {
  var sources = [];
  var output  = new PassThrough({objectMode: true});

  output.setMaxListeners(0);

  output.add = add;
  output.isEmpty = isEmpty;

  output.on('unpipe', remove);

  Array.prototype.slice.call(arguments).forEach(add);

  return output

  function add (source) {
    if (Array.isArray(source)) {
      source.forEach(add);
      return this
    }

    sources.push(source);
    source.once('end', remove.bind(null, source));
    source.once('error', output.emit.bind(output, 'error'));
    source.pipe(output, {end: false});
    return this
  }

  function isEmpty () {
    return sources.length == 0;
  }

  function remove (source) {
    sources = sources.filter(function (it) { return it !== source });
    if (!sources.length && output.readable) { output.end(); }
  }
};

const isStream = isStream_1;
const getStream = getStream$2.exports;
const mergeStream = mergeStream$1;

// `input` option
const handleInput$1 = (spawned, input) => {
	// Checking for stdin is workaround for https://github.com/nodejs/node/issues/26852
	// @todo remove `|| spawned.stdin === undefined` once we drop support for Node.js <=12.2.0
	if (input === undefined || spawned.stdin === undefined) {
		return;
	}

	if (isStream(input)) {
		input.pipe(spawned.stdin);
	} else {
		spawned.stdin.end(input);
	}
};

// `all` interleaves `stdout` and `stderr`
const makeAllStream$1 = (spawned, {all}) => {
	if (!all || (!spawned.stdout && !spawned.stderr)) {
		return;
	}

	const mixed = mergeStream();

	if (spawned.stdout) {
		mixed.add(spawned.stdout);
	}

	if (spawned.stderr) {
		mixed.add(spawned.stderr);
	}

	return mixed;
};

// On failure, `result.stdout|stderr|all` should contain the currently buffered stream
const getBufferedData = async (stream, streamPromise) => {
	if (!stream) {
		return;
	}

	stream.destroy();

	try {
		return await streamPromise;
	} catch (error) {
		return error.bufferedData;
	}
};

const getStreamPromise = (stream, {encoding, buffer, maxBuffer}) => {
	if (!stream || !buffer) {
		return;
	}

	if (encoding) {
		return getStream(stream, {encoding, maxBuffer});
	}

	return getStream.buffer(stream, {maxBuffer});
};

// Retrieve result of child process: exit code, signal, error, streams (stdout/stderr/all)
const getSpawnedResult$1 = async ({stdout, stderr, all}, {encoding, buffer, maxBuffer}, processDone) => {
	const stdoutPromise = getStreamPromise(stdout, {encoding, buffer, maxBuffer});
	const stderrPromise = getStreamPromise(stderr, {encoding, buffer, maxBuffer});
	const allPromise = getStreamPromise(all, {encoding, buffer, maxBuffer: maxBuffer * 2});

	try {
		return await Promise.all([processDone, stdoutPromise, stderrPromise, allPromise]);
	} catch (error) {
		return Promise.all([
			{error, signal: error.signal, timedOut: error.timedOut},
			getBufferedData(stdout, stdoutPromise),
			getBufferedData(stderr, stderrPromise),
			getBufferedData(all, allPromise)
		]);
	}
};

const validateInputSync$1 = ({input}) => {
	if (isStream(input)) {
		throw new TypeError('The `input` option cannot be a stream in sync mode');
	}
};

var stream$1 = {
	handleInput: handleInput$1,
	makeAllStream: makeAllStream$1,
	getSpawnedResult: getSpawnedResult$1,
	validateInputSync: validateInputSync$1
};

const nativePromisePrototype = (async () => {})().constructor.prototype;
const descriptors = ['then', 'catch', 'finally'].map(property => [
	property,
	Reflect.getOwnPropertyDescriptor(nativePromisePrototype, property)
]);

// The return value is a mixin of `childProcess` and `Promise`
const mergePromise$1 = (spawned, promise) => {
	for (const [property, descriptor] of descriptors) {
		// Starting the main `promise` is deferred to avoid consuming streams
		const value = typeof promise === 'function' ?
			(...args) => Reflect.apply(descriptor.value, promise(), args) :
			descriptor.value.bind(promise);

		Reflect.defineProperty(spawned, property, {...descriptor, value});
	}

	return spawned;
};

// Use promises instead of `child_process` events
const getSpawnedPromise$1 = spawned => {
	return new Promise((resolve, reject) => {
		spawned.on('exit', (exitCode, signal) => {
			resolve({exitCode, signal});
		});

		spawned.on('error', error => {
			reject(error);
		});

		if (spawned.stdin) {
			spawned.stdin.on('error', error => {
				reject(error);
			});
		}
	});
};

var promise = {
	mergePromise: mergePromise$1,
	getSpawnedPromise: getSpawnedPromise$1
};

const normalizeArgs = (file, args = []) => {
	if (!Array.isArray(args)) {
		return [file];
	}

	return [file, ...args];
};

const NO_ESCAPE_REGEXP = /^[\w.-]+$/;
const DOUBLE_QUOTES_REGEXP = /"/g;

const escapeArg = arg => {
	if (typeof arg !== 'string' || NO_ESCAPE_REGEXP.test(arg)) {
		return arg;
	}

	return `"${arg.replace(DOUBLE_QUOTES_REGEXP, '\\"')}"`;
};

const joinCommand$1 = (file, args) => {
	return normalizeArgs(file, args).join(' ');
};

const getEscapedCommand$1 = (file, args) => {
	return normalizeArgs(file, args).map(arg => escapeArg(arg)).join(' ');
};

const SPACES_REGEXP = / +/g;

// Handle `execa.command()`
const parseCommand$1 = command => {
	const tokens = [];
	for (const token of command.trim().split(SPACES_REGEXP)) {
		// Allow spaces to be escaped by a backslash if not meant as a delimiter
		const previousToken = tokens[tokens.length - 1];
		if (previousToken && previousToken.endsWith('\\')) {
			// Merge previous token with current one
			tokens[tokens.length - 1] = `${previousToken.slice(0, -1)} ${token}`;
		} else {
			tokens.push(token);
		}
	}

	return tokens;
};

var command = {
	joinCommand: joinCommand$1,
	getEscapedCommand: getEscapedCommand$1,
	parseCommand: parseCommand$1
};

const path = require$$0__default$1["default"];
const childProcess = require$$0__default$2["default"];
const crossSpawn = crossSpawn$1.exports;
const stripFinalNewline = stripFinalNewline$1;
const npmRunPath = npmRunPath$1.exports;
const onetime$3 = onetime$5.exports;
const makeError = error;
const normalizeStdio = stdio.exports;
const {spawnedKill, spawnedCancel, setupTimeout, validateTimeout, setExitHandler} = kill;
const {handleInput, getSpawnedResult, makeAllStream, validateInputSync} = stream$1;
const {mergePromise, getSpawnedPromise} = promise;
const {joinCommand, parseCommand, getEscapedCommand} = command;

const DEFAULT_MAX_BUFFER = 1000 * 1000 * 100;

const getEnv = ({env: envOption, extendEnv, preferLocal, localDir, execPath}) => {
	const env = extendEnv ? {...process.env, ...envOption} : envOption;

	if (preferLocal) {
		return npmRunPath.env({env, cwd: localDir, execPath});
	}

	return env;
};

const handleArguments = (file, args, options = {}) => {
	const parsed = crossSpawn._parse(file, args, options);
	file = parsed.command;
	args = parsed.args;
	options = parsed.options;

	options = {
		maxBuffer: DEFAULT_MAX_BUFFER,
		buffer: true,
		stripFinalNewline: true,
		extendEnv: true,
		preferLocal: false,
		localDir: options.cwd || process.cwd(),
		execPath: process.execPath,
		encoding: 'utf8',
		reject: true,
		cleanup: true,
		all: false,
		windowsHide: true,
		...options
	};

	options.env = getEnv(options);

	options.stdio = normalizeStdio(options);

	if (process.platform === 'win32' && path.basename(file, '.exe') === 'cmd') {
		// #116
		args.unshift('/q');
	}

	return {file, args, options, parsed};
};

const handleOutput = (options, value, error) => {
	if (typeof value !== 'string' && !Buffer.isBuffer(value)) {
		// When `execa.sync()` errors, we normalize it to '' to mimic `execa()`
		return error === undefined ? undefined : '';
	}

	if (options.stripFinalNewline) {
		return stripFinalNewline(value);
	}

	return value;
};

const execa = (file, args, options) => {
	const parsed = handleArguments(file, args, options);
	const command = joinCommand(file, args);
	const escapedCommand = getEscapedCommand(file, args);

	validateTimeout(parsed.options);

	let spawned;
	try {
		spawned = childProcess.spawn(parsed.file, parsed.args, parsed.options);
	} catch (error) {
		// Ensure the returned error is always both a promise and a child process
		const dummySpawned = new childProcess.ChildProcess();
		const errorPromise = Promise.reject(makeError({
			error,
			stdout: '',
			stderr: '',
			all: '',
			command,
			escapedCommand,
			parsed,
			timedOut: false,
			isCanceled: false,
			killed: false
		}));
		return mergePromise(dummySpawned, errorPromise);
	}

	const spawnedPromise = getSpawnedPromise(spawned);
	const timedPromise = setupTimeout(spawned, parsed.options, spawnedPromise);
	const processDone = setExitHandler(spawned, parsed.options, timedPromise);

	const context = {isCanceled: false};

	spawned.kill = spawnedKill.bind(null, spawned.kill.bind(spawned));
	spawned.cancel = spawnedCancel.bind(null, spawned, context);

	const handlePromise = async () => {
		const [{error, exitCode, signal, timedOut}, stdoutResult, stderrResult, allResult] = await getSpawnedResult(spawned, parsed.options, processDone);
		const stdout = handleOutput(parsed.options, stdoutResult);
		const stderr = handleOutput(parsed.options, stderrResult);
		const all = handleOutput(parsed.options, allResult);

		if (error || exitCode !== 0 || signal !== null) {
			const returnedError = makeError({
				error,
				exitCode,
				signal,
				stdout,
				stderr,
				all,
				command,
				escapedCommand,
				parsed,
				timedOut,
				isCanceled: context.isCanceled,
				killed: spawned.killed
			});

			if (!parsed.options.reject) {
				return returnedError;
			}

			throw returnedError;
		}

		return {
			command,
			escapedCommand,
			exitCode: 0,
			stdout,
			stderr,
			all,
			failed: false,
			timedOut: false,
			isCanceled: false,
			killed: false
		};
	};

	const handlePromiseOnce = onetime$3(handlePromise);

	handleInput(spawned, parsed.options.input);

	spawned.all = makeAllStream(spawned, parsed.options);

	return mergePromise(spawned, handlePromiseOnce);
};

execa$1.exports = execa;

execa$1.exports.sync = (file, args, options) => {
	const parsed = handleArguments(file, args, options);
	const command = joinCommand(file, args);
	const escapedCommand = getEscapedCommand(file, args);

	validateInputSync(parsed.options);

	let result;
	try {
		result = childProcess.spawnSync(parsed.file, parsed.args, parsed.options);
	} catch (error) {
		throw makeError({
			error,
			stdout: '',
			stderr: '',
			all: '',
			command,
			escapedCommand,
			parsed,
			timedOut: false,
			isCanceled: false,
			killed: false
		});
	}

	const stdout = handleOutput(parsed.options, result.stdout, result.error);
	const stderr = handleOutput(parsed.options, result.stderr, result.error);

	if (result.error || result.status !== 0 || result.signal !== null) {
		const error = makeError({
			stdout,
			stderr,
			error: result.error,
			signal: result.signal,
			exitCode: result.status,
			command,
			escapedCommand,
			parsed,
			timedOut: result.error && result.error.code === 'ETIMEDOUT',
			isCanceled: false,
			killed: result.signal !== null
		});

		if (!parsed.options.reject) {
			return error;
		}

		throw error;
	}

	return {
		command,
		escapedCommand,
		exitCode: 0,
		stdout,
		stderr,
		failed: false,
		timedOut: false,
		isCanceled: false,
		killed: false
	};
};

execa$1.exports.command = (command, options) => {
	const [file, ...args] = parseCommand(command);
	return execa(file, args, options);
};

execa$1.exports.commandSync = (command, options) => {
	const [file, ...args] = parseCommand(command);
	return execa.sync(file, args, options);
};

execa$1.exports.node = (scriptPath, args, options = {}) => {
	if (args && !Array.isArray(args) && typeof args === 'object') {
		options = args;
		args = [];
	}

	const stdio = normalizeStdio.node(options);
	const defaultExecArgv = process.execArgv.filter(arg => !arg.startsWith('--inspect'));

	const {
		nodePath = process.execPath,
		nodeOptions = defaultExecArgv
	} = options;

	return execa(
		nodePath,
		[
			...nodeOptions,
			scriptPath,
			...(Array.isArray(args) ? args : [])
		],
		{
			...options,
			stdin: undefined,
			stdout: undefined,
			stderr: undefined,
			stdio,
			shell: false
		}
	);
};

async function runAppleScript(script) {
	if (process__default["default"].platform !== 'darwin') {
		throw new Error('macOS only');
	}

	const {stdout} = await execa$1.exports('osascript', ['-e', script]);
	return stdout;
}

const copyProperty = (to, from, property, ignoreNonConfigurable) => {
	// `Function#length` should reflect the parameters of `to` not `from` since we keep its body.
	// `Function#prototype` is non-writable and non-configurable so can never be modified.
	if (property === 'length' || property === 'prototype') {
		return;
	}

	// `Function#arguments` and `Function#caller` should not be copied. They were reported to be present in `Reflect.ownKeys` for some devices in React Native (#41), so we explicitly ignore them here.
	if (property === 'arguments' || property === 'caller') {
		return;
	}

	const toDescriptor = Object.getOwnPropertyDescriptor(to, property);
	const fromDescriptor = Object.getOwnPropertyDescriptor(from, property);

	if (!canCopyProperty(toDescriptor, fromDescriptor) && ignoreNonConfigurable) {
		return;
	}

	Object.defineProperty(to, property, fromDescriptor);
};

// `Object.defineProperty()` throws if the property exists, is not configurable and either:
// - one its descriptors is changed
// - it is non-writable and its value is changed
const canCopyProperty = function (toDescriptor, fromDescriptor) {
	return toDescriptor === undefined || toDescriptor.configurable || (
		toDescriptor.writable === fromDescriptor.writable &&
		toDescriptor.enumerable === fromDescriptor.enumerable &&
		toDescriptor.configurable === fromDescriptor.configurable &&
		(toDescriptor.writable || toDescriptor.value === fromDescriptor.value)
	);
};

const changePrototype = (to, from) => {
	const fromPrototype = Object.getPrototypeOf(from);
	if (fromPrototype === Object.getPrototypeOf(to)) {
		return;
	}

	Object.setPrototypeOf(to, fromPrototype);
};

const wrappedToString = (withName, fromBody) => `/* Wrapped ${withName}*/\n${fromBody}`;

const toStringDescriptor = Object.getOwnPropertyDescriptor(Function.prototype, 'toString');
const toStringName = Object.getOwnPropertyDescriptor(Function.prototype.toString, 'name');

// We call `from.toString()` early (not lazily) to ensure `from` can be garbage collected.
// We use `bind()` instead of a closure for the same reason.
// Calling `from.toString()` early also allows caching it in case `to.toString()` is called several times.
const changeToString = (to, from, name) => {
	const withName = name === '' ? '' : `with ${name.trim()}() `;
	const newToString = wrappedToString.bind(null, withName, from.toString());
	// Ensure `to.toString.toString` is non-enumerable and has the same `same`
	Object.defineProperty(newToString, 'name', toStringName);
	Object.defineProperty(to, 'toString', {...toStringDescriptor, value: newToString});
};

function mimicFunction(to, from, {ignoreNonConfigurable = false} = {}) {
	const {name} = to;

	for (const property of Reflect.ownKeys(from)) {
		copyProperty(to, from, property, ignoreNonConfigurable);
	}

	changePrototype(to, from);
	changeToString(to, from, name);

	return to;
}

const calledFunctions$1 = new WeakMap();

const onetime$2 = (function_, options = {}) => {
	if (typeof function_ !== 'function') {
		throw new TypeError('Expected a function');
	}

	let returnValue;
	let callCount = 0;
	const functionName = function_.displayName || function_.name || '<anonymous>';

	const onetime = function (...arguments_) {
		calledFunctions$1.set(onetime, ++callCount);

		if (callCount === 1) {
			returnValue = function_.apply(this, arguments_);
			function_ = null;
		} else if (options.throw === true) {
			throw new Error(`Function \`${functionName}\` can only be called once`);
		}

		return returnValue;
	};

	mimicFunction(onetime, function_);
	calledFunctions$1.set(onetime, callCount);

	return onetime;
};

onetime$2.callCount = function_ => {
	if (!calledFunctions$1.has(function_)) {
		throw new Error(`The given function \`${function_.name}\` is not wrapped by the \`onetime\` package`);
	}

	return calledFunctions$1.get(function_);
};

const ANSI_BACKGROUND_OFFSET = 10;

const wrapAnsi16 = (offset = 0) => code => `\u001B[${code + offset}m`;

const wrapAnsi256 = (offset = 0) => code => `\u001B[${38 + offset};5;${code}m`;

const wrapAnsi16m = (offset = 0) => (red, green, blue) => `\u001B[${38 + offset};2;${red};${green};${blue}m`;

function assembleStyles() {
	const codes = new Map();
	const styles = {
		modifier: {
			reset: [0, 0],
			// 21 isn't widely supported and 22 does the same thing
			bold: [1, 22],
			dim: [2, 22],
			italic: [3, 23],
			underline: [4, 24],
			overline: [53, 55],
			inverse: [7, 27],
			hidden: [8, 28],
			strikethrough: [9, 29],
		},
		color: {
			black: [30, 39],
			red: [31, 39],
			green: [32, 39],
			yellow: [33, 39],
			blue: [34, 39],
			magenta: [35, 39],
			cyan: [36, 39],
			white: [37, 39],

			// Bright color
			blackBright: [90, 39],
			redBright: [91, 39],
			greenBright: [92, 39],
			yellowBright: [93, 39],
			blueBright: [94, 39],
			magentaBright: [95, 39],
			cyanBright: [96, 39],
			whiteBright: [97, 39],
		},
		bgColor: {
			bgBlack: [40, 49],
			bgRed: [41, 49],
			bgGreen: [42, 49],
			bgYellow: [43, 49],
			bgBlue: [44, 49],
			bgMagenta: [45, 49],
			bgCyan: [46, 49],
			bgWhite: [47, 49],

			// Bright color
			bgBlackBright: [100, 49],
			bgRedBright: [101, 49],
			bgGreenBright: [102, 49],
			bgYellowBright: [103, 49],
			bgBlueBright: [104, 49],
			bgMagentaBright: [105, 49],
			bgCyanBright: [106, 49],
			bgWhiteBright: [107, 49],
		},
	};

	// Alias bright black as gray (and grey)
	styles.color.gray = styles.color.blackBright;
	styles.bgColor.bgGray = styles.bgColor.bgBlackBright;
	styles.color.grey = styles.color.blackBright;
	styles.bgColor.bgGrey = styles.bgColor.bgBlackBright;

	for (const [groupName, group] of Object.entries(styles)) {
		for (const [styleName, style] of Object.entries(group)) {
			styles[styleName] = {
				open: `\u001B[${style[0]}m`,
				close: `\u001B[${style[1]}m`,
			};

			group[styleName] = styles[styleName];

			codes.set(style[0], style[1]);
		}

		Object.defineProperty(styles, groupName, {
			value: group,
			enumerable: false,
		});
	}

	Object.defineProperty(styles, 'codes', {
		value: codes,
		enumerable: false,
	});

	styles.color.close = '\u001B[39m';
	styles.bgColor.close = '\u001B[49m';

	styles.color.ansi = wrapAnsi16();
	styles.color.ansi256 = wrapAnsi256();
	styles.color.ansi16m = wrapAnsi16m();
	styles.bgColor.ansi = wrapAnsi16(ANSI_BACKGROUND_OFFSET);
	styles.bgColor.ansi256 = wrapAnsi256(ANSI_BACKGROUND_OFFSET);
	styles.bgColor.ansi16m = wrapAnsi16m(ANSI_BACKGROUND_OFFSET);

	// From https://github.com/Qix-/color-convert/blob/3f0e0d4e92e235796ccb17f6e85c72094a651f49/conversions.js
	Object.defineProperties(styles, {
		rgbToAnsi256: {
			value: (red, green, blue) => {
				// We use the extended greyscale palette here, with the exception of
				// black and white. normal palette only has 4 greyscale shades.
				if (red === green && green === blue) {
					if (red < 8) {
						return 16;
					}

					if (red > 248) {
						return 231;
					}

					return Math.round(((red - 8) / 247) * 24) + 232;
				}

				return 16
					+ (36 * Math.round(red / 255 * 5))
					+ (6 * Math.round(green / 255 * 5))
					+ Math.round(blue / 255 * 5);
			},
			enumerable: false,
		},
		hexToRgb: {
			value: hex => {
				const matches = /(?<colorString>[a-f\d]{6}|[a-f\d]{3})/i.exec(hex.toString(16));
				if (!matches) {
					return [0, 0, 0];
				}

				let {colorString} = matches.groups;

				if (colorString.length === 3) {
					colorString = [...colorString].map(character => character + character).join('');
				}

				const integer = Number.parseInt(colorString, 16);

				return [
					/* eslint-disable no-bitwise */
					(integer >> 16) & 0xFF,
					(integer >> 8) & 0xFF,
					integer & 0xFF,
					/* eslint-enable no-bitwise */
				];
			},
			enumerable: false,
		},
		hexToAnsi256: {
			value: hex => styles.rgbToAnsi256(...styles.hexToRgb(hex)),
			enumerable: false,
		},
		ansi256ToAnsi: {
			value: code => {
				if (code < 8) {
					return 30 + code;
				}

				if (code < 16) {
					return 90 + (code - 8);
				}

				let red;
				let green;
				let blue;

				if (code >= 232) {
					red = (((code - 232) * 10) + 8) / 255;
					green = red;
					blue = red;
				} else {
					code -= 16;

					const remainder = code % 36;

					red = Math.floor(code / 36) / 5;
					green = Math.floor(remainder / 6) / 5;
					blue = (remainder % 6) / 5;
				}

				const value = Math.max(red, green, blue) * 2;

				if (value === 0) {
					return 30;
				}

				// eslint-disable-next-line no-bitwise
				let result = 30 + ((Math.round(blue) << 2) | (Math.round(green) << 1) | Math.round(red));

				if (value === 2) {
					result += 60;
				}

				return result;
			},
			enumerable: false,
		},
		rgbToAnsi: {
			value: (red, green, blue) => styles.ansi256ToAnsi(styles.rgbToAnsi256(red, green, blue)),
			enumerable: false,
		},
		hexToAnsi: {
			value: hex => styles.ansi256ToAnsi(styles.hexToAnsi256(hex)),
			enumerable: false,
		},
	});

	return styles;
}

const ansiStyles = assembleStyles();

// From: https://github.com/sindresorhus/has-flag/blob/main/index.js
function hasFlag(flag, argv = process__default["default"].argv) {
	const prefix = flag.startsWith('-') ? '' : (flag.length === 1 ? '-' : '--');
	const position = argv.indexOf(prefix + flag);
	const terminatorPosition = argv.indexOf('--');
	return position !== -1 && (terminatorPosition === -1 || position < terminatorPosition);
}

const {env} = process__default["default"];

let flagForceColor;
if (
	hasFlag('no-color')
	|| hasFlag('no-colors')
	|| hasFlag('color=false')
	|| hasFlag('color=never')
) {
	flagForceColor = 0;
} else if (
	hasFlag('color')
	|| hasFlag('colors')
	|| hasFlag('color=true')
	|| hasFlag('color=always')
) {
	flagForceColor = 1;
}

function envForceColor() {
	if ('FORCE_COLOR' in env) {
		if (env.FORCE_COLOR === 'true') {
			return 1;
		}

		if (env.FORCE_COLOR === 'false') {
			return 0;
		}

		return env.FORCE_COLOR.length === 0 ? 1 : Math.min(Number.parseInt(env.FORCE_COLOR, 10), 3);
	}
}

function translateLevel(level) {
	if (level === 0) {
		return false;
	}

	return {
		level,
		hasBasic: true,
		has256: level >= 2,
		has16m: level >= 3,
	};
}

function _supportsColor(haveStream, {streamIsTTY, sniffFlags = true} = {}) {
	const noFlagForceColor = envForceColor();
	if (noFlagForceColor !== undefined) {
		flagForceColor = noFlagForceColor;
	}

	const forceColor = sniffFlags ? flagForceColor : noFlagForceColor;

	if (forceColor === 0) {
		return 0;
	}

	if (sniffFlags) {
		if (hasFlag('color=16m')
			|| hasFlag('color=full')
			|| hasFlag('color=truecolor')) {
			return 3;
		}

		if (hasFlag('color=256')) {
			return 2;
		}
	}

	if (haveStream && !streamIsTTY && forceColor === undefined) {
		return 0;
	}

	const min = forceColor || 0;

	if (env.TERM === 'dumb') {
		return min;
	}

	if (process__default["default"].platform === 'win32') {
		// Windows 10 build 10586 is the first Windows release that supports 256 colors.
		// Windows 10 build 14931 is the first release that supports 16m/TrueColor.
		const osRelease = os__default["default"].release().split('.');
		if (
			Number(osRelease[0]) >= 10
			&& Number(osRelease[2]) >= 10_586
		) {
			return Number(osRelease[2]) >= 14_931 ? 3 : 2;
		}

		return 1;
	}

	if ('CI' in env) {
		if (['TRAVIS', 'CIRCLECI', 'APPVEYOR', 'GITLAB_CI', 'GITHUB_ACTIONS', 'BUILDKITE', 'DRONE'].some(sign => sign in env) || env.CI_NAME === 'codeship') {
			return 1;
		}

		return min;
	}

	if ('TEAMCITY_VERSION' in env) {
		return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(env.TEAMCITY_VERSION) ? 1 : 0;
	}

	// Check for Azure DevOps pipelines
	if ('TF_BUILD' in env && 'AGENT_NAME' in env) {
		return 1;
	}

	if (env.COLORTERM === 'truecolor') {
		return 3;
	}

	if ('TERM_PROGRAM' in env) {
		const version = Number.parseInt((env.TERM_PROGRAM_VERSION || '').split('.')[0], 10);

		switch (env.TERM_PROGRAM) {
			case 'iTerm.app':
				return version >= 3 ? 3 : 2;
			case 'Apple_Terminal':
				return 2;
			// No default
		}
	}

	if (/-256(color)?$/i.test(env.TERM)) {
		return 2;
	}

	if (/^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(env.TERM)) {
		return 1;
	}

	if ('COLORTERM' in env) {
		return 1;
	}

	return min;
}

function createSupportsColor(stream, options = {}) {
	const level = _supportsColor(stream, {
		streamIsTTY: stream && stream.isTTY,
		...options,
	});

	return translateLevel(level);
}

const supportsColor = {
	stdout: createSupportsColor({isTTY: tty__default["default"].isatty(1)}),
	stderr: createSupportsColor({isTTY: tty__default["default"].isatty(2)}),
};

// TODO: When targeting Node.js 16, use `String.prototype.replaceAll`.
function stringReplaceAll(string, substring, replacer) {
	let index = string.indexOf(substring);
	if (index === -1) {
		return string;
	}

	const substringLength = substring.length;
	let endIndex = 0;
	let returnValue = '';
	do {
		returnValue += string.substr(endIndex, index - endIndex) + substring + replacer;
		endIndex = index + substringLength;
		index = string.indexOf(substring, endIndex);
	} while (index !== -1);

	returnValue += string.slice(endIndex);
	return returnValue;
}

function stringEncaseCRLFWithFirstIndex(string, prefix, postfix, index) {
	let endIndex = 0;
	let returnValue = '';
	do {
		const gotCR = string[index - 1] === '\r';
		returnValue += string.substr(endIndex, (gotCR ? index - 1 : index) - endIndex) + prefix + (gotCR ? '\r\n' : '\n') + postfix;
		endIndex = index + 1;
		index = string.indexOf('\n', endIndex);
	} while (index !== -1);

	returnValue += string.slice(endIndex);
	return returnValue;
}

const {stdout: stdoutColor, stderr: stderrColor} = supportsColor;

const GENERATOR = Symbol('GENERATOR');
const STYLER = Symbol('STYLER');
const IS_EMPTY = Symbol('IS_EMPTY');

// `supportsColor.level` → `ansiStyles.color[name]` mapping
const levelMapping = [
	'ansi',
	'ansi',
	'ansi256',
	'ansi16m',
];

const styles = Object.create(null);

const applyOptions = (object, options = {}) => {
	if (options.level && !(Number.isInteger(options.level) && options.level >= 0 && options.level <= 3)) {
		throw new Error('The `level` option should be an integer from 0 to 3');
	}

	// Detect level if not set manually
	const colorLevel = stdoutColor ? stdoutColor.level : 0;
	object.level = options.level === undefined ? colorLevel : options.level;
};

const chalkFactory = options => {
	const chalk = (...strings) => strings.join(' ');
	applyOptions(chalk, options);

	Object.setPrototypeOf(chalk, createChalk.prototype);

	return chalk;
};

function createChalk(options) {
	return chalkFactory(options);
}

Object.setPrototypeOf(createChalk.prototype, Function.prototype);

for (const [styleName, style] of Object.entries(ansiStyles)) {
	styles[styleName] = {
		get() {
			const builder = createBuilder(this, createStyler(style.open, style.close, this[STYLER]), this[IS_EMPTY]);
			Object.defineProperty(this, styleName, {value: builder});
			return builder;
		},
	};
}

styles.visible = {
	get() {
		const builder = createBuilder(this, this[STYLER], true);
		Object.defineProperty(this, 'visible', {value: builder});
		return builder;
	},
};

const getModelAnsi = (model, level, type, ...arguments_) => {
	if (model === 'rgb') {
		if (level === 'ansi16m') {
			return ansiStyles[type].ansi16m(...arguments_);
		}

		if (level === 'ansi256') {
			return ansiStyles[type].ansi256(ansiStyles.rgbToAnsi256(...arguments_));
		}

		return ansiStyles[type].ansi(ansiStyles.rgbToAnsi(...arguments_));
	}

	if (model === 'hex') {
		return getModelAnsi('rgb', level, type, ...ansiStyles.hexToRgb(...arguments_));
	}

	return ansiStyles[type][model](...arguments_);
};

const usedModels = ['rgb', 'hex', 'ansi256'];

for (const model of usedModels) {
	styles[model] = {
		get() {
			const {level} = this;
			return function (...arguments_) {
				const styler = createStyler(getModelAnsi(model, levelMapping[level], 'color', ...arguments_), ansiStyles.color.close, this[STYLER]);
				return createBuilder(this, styler, this[IS_EMPTY]);
			};
		},
	};

	const bgModel = 'bg' + model[0].toUpperCase() + model.slice(1);
	styles[bgModel] = {
		get() {
			const {level} = this;
			return function (...arguments_) {
				const styler = createStyler(getModelAnsi(model, levelMapping[level], 'bgColor', ...arguments_), ansiStyles.bgColor.close, this[STYLER]);
				return createBuilder(this, styler, this[IS_EMPTY]);
			};
		},
	};
}

const proto = Object.defineProperties(() => {}, {
	...styles,
	level: {
		enumerable: true,
		get() {
			return this[GENERATOR].level;
		},
		set(level) {
			this[GENERATOR].level = level;
		},
	},
});

const createStyler = (open, close, parent) => {
	let openAll;
	let closeAll;
	if (parent === undefined) {
		openAll = open;
		closeAll = close;
	} else {
		openAll = parent.openAll + open;
		closeAll = close + parent.closeAll;
	}

	return {
		open,
		close,
		openAll,
		closeAll,
		parent,
	};
};

const createBuilder = (self, _styler, _isEmpty) => {
	// Single argument is hot path, implicit coercion is faster than anything
	// eslint-disable-next-line no-implicit-coercion
	const builder = (...arguments_) => applyStyle(builder, (arguments_.length === 1) ? ('' + arguments_[0]) : arguments_.join(' '));

	// We alter the prototype because we must return a function, but there is
	// no way to create a function with a different prototype
	Object.setPrototypeOf(builder, proto);

	builder[GENERATOR] = self;
	builder[STYLER] = _styler;
	builder[IS_EMPTY] = _isEmpty;

	return builder;
};

const applyStyle = (self, string) => {
	if (self.level <= 0 || !string) {
		return self[IS_EMPTY] ? '' : string;
	}

	let styler = self[STYLER];

	if (styler === undefined) {
		return string;
	}

	const {openAll, closeAll} = styler;
	if (string.includes('\u001B')) {
		while (styler !== undefined) {
			// Replace any instances already present with a re-opening code
			// otherwise only the part of the string until said closing code
			// will be colored, and the rest will simply be 'plain'.
			string = stringReplaceAll(string, styler.close, styler.open);

			styler = styler.parent;
		}
	}

	// We can move both next actions out of loop, because remaining actions in loop won't have
	// any/visible effect on parts we add here. Close the styling before a linebreak and reopen
	// after next line to fix a bleed issue on macOS: https://github.com/chalk/chalk/pull/92
	const lfIndex = string.indexOf('\n');
	if (lfIndex !== -1) {
		string = stringEncaseCRLFWithFirstIndex(string, closeAll, openAll, lfIndex);
	}

	return openAll + string + closeAll;
};

Object.defineProperties(createChalk.prototype, styles);

const chalk = createChalk();
createChalk({level: stderrColor ? stderrColor.level : 0});

var onetime$1 = {exports: {}};

var mimicFn$2 = {exports: {}};

const mimicFn$1 = (to, from) => {
	for (const prop of Reflect.ownKeys(from)) {
		Object.defineProperty(to, prop, Object.getOwnPropertyDescriptor(from, prop));
	}

	return to;
};

mimicFn$2.exports = mimicFn$1;
// TODO: Remove this for the next major release
mimicFn$2.exports.default = mimicFn$1;

const mimicFn = mimicFn$2.exports;

const calledFunctions = new WeakMap();

const onetime = (function_, options = {}) => {
	if (typeof function_ !== 'function') {
		throw new TypeError('Expected a function');
	}

	let returnValue;
	let callCount = 0;
	const functionName = function_.displayName || function_.name || '<anonymous>';

	const onetime = function (...arguments_) {
		calledFunctions.set(onetime, ++callCount);

		if (callCount === 1) {
			returnValue = function_.apply(this, arguments_);
			function_ = null;
		} else if (options.throw === true) {
			throw new Error(`Function \`${functionName}\` can only be called once`);
		}

		return returnValue;
	};

	mimicFn(onetime, function_);
	calledFunctions.set(onetime, callCount);

	return onetime;
};

onetime$1.exports = onetime;
// TODO: Remove this for the next major release
onetime$1.exports.default = onetime;

onetime$1.exports.callCount = function_ => {
	if (!calledFunctions.has(function_)) {
		throw new Error(`The given function \`${function_.name}\` is not wrapped by the \`onetime\` package`);
	}

	return calledFunctions.get(function_);
};

const restoreCursor = onetime$1.exports(() => {
	signalExit.exports(() => {
		process__default["default"].stderr.write('\u001B[?25h');
	}, {alwaysLast: true});
});

let isHidden = false;

const cliCursor = {};

cliCursor.show = (writableStream = process__default["default"].stderr) => {
	if (!writableStream.isTTY) {
		return;
	}

	isHidden = false;
	writableStream.write('\u001B[?25h');
};

cliCursor.hide = (writableStream = process__default["default"].stderr) => {
	if (!writableStream.isTTY) {
		return;
	}

	restoreCursor();
	isHidden = true;
	writableStream.write('\u001B[?25l');
};

cliCursor.toggle = (force, writableStream) => {
	if (force !== undefined) {
		isHidden = force;
	}

	if (isHidden) {
		cliCursor.show(writableStream);
	} else {
		cliCursor.hide(writableStream);
	}
};

var dots = {
	interval: 80,
	frames: [
		"⠋",
		"⠙",
		"⠹",
		"⠸",
		"⠼",
		"⠴",
		"⠦",
		"⠧",
		"⠇",
		"⠏"
	]
};
var dots2 = {
	interval: 80,
	frames: [
		"⣾",
		"⣽",
		"⣻",
		"⢿",
		"⡿",
		"⣟",
		"⣯",
		"⣷"
	]
};
var dots3 = {
	interval: 80,
	frames: [
		"⠋",
		"⠙",
		"⠚",
		"⠞",
		"⠖",
		"⠦",
		"⠴",
		"⠲",
		"⠳",
		"⠓"
	]
};
var dots4 = {
	interval: 80,
	frames: [
		"⠄",
		"⠆",
		"⠇",
		"⠋",
		"⠙",
		"⠸",
		"⠰",
		"⠠",
		"⠰",
		"⠸",
		"⠙",
		"⠋",
		"⠇",
		"⠆"
	]
};
var dots5 = {
	interval: 80,
	frames: [
		"⠋",
		"⠙",
		"⠚",
		"⠒",
		"⠂",
		"⠂",
		"⠒",
		"⠲",
		"⠴",
		"⠦",
		"⠖",
		"⠒",
		"⠐",
		"⠐",
		"⠒",
		"⠓",
		"⠋"
	]
};
var dots6 = {
	interval: 80,
	frames: [
		"⠁",
		"⠉",
		"⠙",
		"⠚",
		"⠒",
		"⠂",
		"⠂",
		"⠒",
		"⠲",
		"⠴",
		"⠤",
		"⠄",
		"⠄",
		"⠤",
		"⠴",
		"⠲",
		"⠒",
		"⠂",
		"⠂",
		"⠒",
		"⠚",
		"⠙",
		"⠉",
		"⠁"
	]
};
var dots7 = {
	interval: 80,
	frames: [
		"⠈",
		"⠉",
		"⠋",
		"⠓",
		"⠒",
		"⠐",
		"⠐",
		"⠒",
		"⠖",
		"⠦",
		"⠤",
		"⠠",
		"⠠",
		"⠤",
		"⠦",
		"⠖",
		"⠒",
		"⠐",
		"⠐",
		"⠒",
		"⠓",
		"⠋",
		"⠉",
		"⠈"
	]
};
var dots8 = {
	interval: 80,
	frames: [
		"⠁",
		"⠁",
		"⠉",
		"⠙",
		"⠚",
		"⠒",
		"⠂",
		"⠂",
		"⠒",
		"⠲",
		"⠴",
		"⠤",
		"⠄",
		"⠄",
		"⠤",
		"⠠",
		"⠠",
		"⠤",
		"⠦",
		"⠖",
		"⠒",
		"⠐",
		"⠐",
		"⠒",
		"⠓",
		"⠋",
		"⠉",
		"⠈",
		"⠈"
	]
};
var dots9 = {
	interval: 80,
	frames: [
		"⢹",
		"⢺",
		"⢼",
		"⣸",
		"⣇",
		"⡧",
		"⡗",
		"⡏"
	]
};
var dots10 = {
	interval: 80,
	frames: [
		"⢄",
		"⢂",
		"⢁",
		"⡁",
		"⡈",
		"⡐",
		"⡠"
	]
};
var dots11 = {
	interval: 100,
	frames: [
		"⠁",
		"⠂",
		"⠄",
		"⡀",
		"⢀",
		"⠠",
		"⠐",
		"⠈"
	]
};
var dots12 = {
	interval: 80,
	frames: [
		"⢀⠀",
		"⡀⠀",
		"⠄⠀",
		"⢂⠀",
		"⡂⠀",
		"⠅⠀",
		"⢃⠀",
		"⡃⠀",
		"⠍⠀",
		"⢋⠀",
		"⡋⠀",
		"⠍⠁",
		"⢋⠁",
		"⡋⠁",
		"⠍⠉",
		"⠋⠉",
		"⠋⠉",
		"⠉⠙",
		"⠉⠙",
		"⠉⠩",
		"⠈⢙",
		"⠈⡙",
		"⢈⠩",
		"⡀⢙",
		"⠄⡙",
		"⢂⠩",
		"⡂⢘",
		"⠅⡘",
		"⢃⠨",
		"⡃⢐",
		"⠍⡐",
		"⢋⠠",
		"⡋⢀",
		"⠍⡁",
		"⢋⠁",
		"⡋⠁",
		"⠍⠉",
		"⠋⠉",
		"⠋⠉",
		"⠉⠙",
		"⠉⠙",
		"⠉⠩",
		"⠈⢙",
		"⠈⡙",
		"⠈⠩",
		"⠀⢙",
		"⠀⡙",
		"⠀⠩",
		"⠀⢘",
		"⠀⡘",
		"⠀⠨",
		"⠀⢐",
		"⠀⡐",
		"⠀⠠",
		"⠀⢀",
		"⠀⡀"
	]
};
var dots8Bit = {
	interval: 80,
	frames: [
		"⠀",
		"⠁",
		"⠂",
		"⠃",
		"⠄",
		"⠅",
		"⠆",
		"⠇",
		"⡀",
		"⡁",
		"⡂",
		"⡃",
		"⡄",
		"⡅",
		"⡆",
		"⡇",
		"⠈",
		"⠉",
		"⠊",
		"⠋",
		"⠌",
		"⠍",
		"⠎",
		"⠏",
		"⡈",
		"⡉",
		"⡊",
		"⡋",
		"⡌",
		"⡍",
		"⡎",
		"⡏",
		"⠐",
		"⠑",
		"⠒",
		"⠓",
		"⠔",
		"⠕",
		"⠖",
		"⠗",
		"⡐",
		"⡑",
		"⡒",
		"⡓",
		"⡔",
		"⡕",
		"⡖",
		"⡗",
		"⠘",
		"⠙",
		"⠚",
		"⠛",
		"⠜",
		"⠝",
		"⠞",
		"⠟",
		"⡘",
		"⡙",
		"⡚",
		"⡛",
		"⡜",
		"⡝",
		"⡞",
		"⡟",
		"⠠",
		"⠡",
		"⠢",
		"⠣",
		"⠤",
		"⠥",
		"⠦",
		"⠧",
		"⡠",
		"⡡",
		"⡢",
		"⡣",
		"⡤",
		"⡥",
		"⡦",
		"⡧",
		"⠨",
		"⠩",
		"⠪",
		"⠫",
		"⠬",
		"⠭",
		"⠮",
		"⠯",
		"⡨",
		"⡩",
		"⡪",
		"⡫",
		"⡬",
		"⡭",
		"⡮",
		"⡯",
		"⠰",
		"⠱",
		"⠲",
		"⠳",
		"⠴",
		"⠵",
		"⠶",
		"⠷",
		"⡰",
		"⡱",
		"⡲",
		"⡳",
		"⡴",
		"⡵",
		"⡶",
		"⡷",
		"⠸",
		"⠹",
		"⠺",
		"⠻",
		"⠼",
		"⠽",
		"⠾",
		"⠿",
		"⡸",
		"⡹",
		"⡺",
		"⡻",
		"⡼",
		"⡽",
		"⡾",
		"⡿",
		"⢀",
		"⢁",
		"⢂",
		"⢃",
		"⢄",
		"⢅",
		"⢆",
		"⢇",
		"⣀",
		"⣁",
		"⣂",
		"⣃",
		"⣄",
		"⣅",
		"⣆",
		"⣇",
		"⢈",
		"⢉",
		"⢊",
		"⢋",
		"⢌",
		"⢍",
		"⢎",
		"⢏",
		"⣈",
		"⣉",
		"⣊",
		"⣋",
		"⣌",
		"⣍",
		"⣎",
		"⣏",
		"⢐",
		"⢑",
		"⢒",
		"⢓",
		"⢔",
		"⢕",
		"⢖",
		"⢗",
		"⣐",
		"⣑",
		"⣒",
		"⣓",
		"⣔",
		"⣕",
		"⣖",
		"⣗",
		"⢘",
		"⢙",
		"⢚",
		"⢛",
		"⢜",
		"⢝",
		"⢞",
		"⢟",
		"⣘",
		"⣙",
		"⣚",
		"⣛",
		"⣜",
		"⣝",
		"⣞",
		"⣟",
		"⢠",
		"⢡",
		"⢢",
		"⢣",
		"⢤",
		"⢥",
		"⢦",
		"⢧",
		"⣠",
		"⣡",
		"⣢",
		"⣣",
		"⣤",
		"⣥",
		"⣦",
		"⣧",
		"⢨",
		"⢩",
		"⢪",
		"⢫",
		"⢬",
		"⢭",
		"⢮",
		"⢯",
		"⣨",
		"⣩",
		"⣪",
		"⣫",
		"⣬",
		"⣭",
		"⣮",
		"⣯",
		"⢰",
		"⢱",
		"⢲",
		"⢳",
		"⢴",
		"⢵",
		"⢶",
		"⢷",
		"⣰",
		"⣱",
		"⣲",
		"⣳",
		"⣴",
		"⣵",
		"⣶",
		"⣷",
		"⢸",
		"⢹",
		"⢺",
		"⢻",
		"⢼",
		"⢽",
		"⢾",
		"⢿",
		"⣸",
		"⣹",
		"⣺",
		"⣻",
		"⣼",
		"⣽",
		"⣾",
		"⣿"
	]
};
var line = {
	interval: 130,
	frames: [
		"-",
		"\\",
		"|",
		"/"
	]
};
var line2 = {
	interval: 100,
	frames: [
		"⠂",
		"-",
		"–",
		"—",
		"–",
		"-"
	]
};
var pipe = {
	interval: 100,
	frames: [
		"┤",
		"┘",
		"┴",
		"└",
		"├",
		"┌",
		"┬",
		"┐"
	]
};
var simpleDots = {
	interval: 400,
	frames: [
		".  ",
		".. ",
		"...",
		"   "
	]
};
var simpleDotsScrolling = {
	interval: 200,
	frames: [
		".  ",
		".. ",
		"...",
		" ..",
		"  .",
		"   "
	]
};
var star = {
	interval: 70,
	frames: [
		"✶",
		"✸",
		"✹",
		"✺",
		"✹",
		"✷"
	]
};
var star2 = {
	interval: 80,
	frames: [
		"+",
		"x",
		"*"
	]
};
var flip = {
	interval: 70,
	frames: [
		"_",
		"_",
		"_",
		"-",
		"`",
		"`",
		"'",
		"´",
		"-",
		"_",
		"_",
		"_"
	]
};
var hamburger = {
	interval: 100,
	frames: [
		"☱",
		"☲",
		"☴"
	]
};
var growVertical = {
	interval: 120,
	frames: [
		"▁",
		"▃",
		"▄",
		"▅",
		"▆",
		"▇",
		"▆",
		"▅",
		"▄",
		"▃"
	]
};
var growHorizontal = {
	interval: 120,
	frames: [
		"▏",
		"▎",
		"▍",
		"▌",
		"▋",
		"▊",
		"▉",
		"▊",
		"▋",
		"▌",
		"▍",
		"▎"
	]
};
var balloon = {
	interval: 140,
	frames: [
		" ",
		".",
		"o",
		"O",
		"@",
		"*",
		" "
	]
};
var balloon2 = {
	interval: 120,
	frames: [
		".",
		"o",
		"O",
		"°",
		"O",
		"o",
		"."
	]
};
var noise = {
	interval: 100,
	frames: [
		"▓",
		"▒",
		"░"
	]
};
var bounce = {
	interval: 120,
	frames: [
		"⠁",
		"⠂",
		"⠄",
		"⠂"
	]
};
var boxBounce = {
	interval: 120,
	frames: [
		"▖",
		"▘",
		"▝",
		"▗"
	]
};
var boxBounce2 = {
	interval: 100,
	frames: [
		"▌",
		"▀",
		"▐",
		"▄"
	]
};
var triangle = {
	interval: 50,
	frames: [
		"◢",
		"◣",
		"◤",
		"◥"
	]
};
var arc = {
	interval: 100,
	frames: [
		"◜",
		"◠",
		"◝",
		"◞",
		"◡",
		"◟"
	]
};
var circle = {
	interval: 120,
	frames: [
		"◡",
		"⊙",
		"◠"
	]
};
var squareCorners = {
	interval: 180,
	frames: [
		"◰",
		"◳",
		"◲",
		"◱"
	]
};
var circleQuarters = {
	interval: 120,
	frames: [
		"◴",
		"◷",
		"◶",
		"◵"
	]
};
var circleHalves = {
	interval: 50,
	frames: [
		"◐",
		"◓",
		"◑",
		"◒"
	]
};
var squish = {
	interval: 100,
	frames: [
		"╫",
		"╪"
	]
};
var toggle = {
	interval: 250,
	frames: [
		"⊶",
		"⊷"
	]
};
var toggle2 = {
	interval: 80,
	frames: [
		"▫",
		"▪"
	]
};
var toggle3 = {
	interval: 120,
	frames: [
		"□",
		"■"
	]
};
var toggle4 = {
	interval: 100,
	frames: [
		"■",
		"□",
		"▪",
		"▫"
	]
};
var toggle5 = {
	interval: 100,
	frames: [
		"▮",
		"▯"
	]
};
var toggle6 = {
	interval: 300,
	frames: [
		"ဝ",
		"၀"
	]
};
var toggle7 = {
	interval: 80,
	frames: [
		"⦾",
		"⦿"
	]
};
var toggle8 = {
	interval: 100,
	frames: [
		"◍",
		"◌"
	]
};
var toggle9 = {
	interval: 100,
	frames: [
		"◉",
		"◎"
	]
};
var toggle10 = {
	interval: 100,
	frames: [
		"㊂",
		"㊀",
		"㊁"
	]
};
var toggle11 = {
	interval: 50,
	frames: [
		"⧇",
		"⧆"
	]
};
var toggle12 = {
	interval: 120,
	frames: [
		"☗",
		"☖"
	]
};
var toggle13 = {
	interval: 80,
	frames: [
		"=",
		"*",
		"-"
	]
};
var arrow = {
	interval: 100,
	frames: [
		"←",
		"↖",
		"↑",
		"↗",
		"→",
		"↘",
		"↓",
		"↙"
	]
};
var arrow2 = {
	interval: 80,
	frames: [
		"⬆️ ",
		"↗️ ",
		"➡️ ",
		"↘️ ",
		"⬇️ ",
		"↙️ ",
		"⬅️ ",
		"↖️ "
	]
};
var arrow3 = {
	interval: 120,
	frames: [
		"▹▹▹▹▹",
		"▸▹▹▹▹",
		"▹▸▹▹▹",
		"▹▹▸▹▹",
		"▹▹▹▸▹",
		"▹▹▹▹▸"
	]
};
var bouncingBar = {
	interval: 80,
	frames: [
		"[    ]",
		"[=   ]",
		"[==  ]",
		"[=== ]",
		"[ ===]",
		"[  ==]",
		"[   =]",
		"[    ]",
		"[   =]",
		"[  ==]",
		"[ ===]",
		"[====]",
		"[=== ]",
		"[==  ]",
		"[=   ]"
	]
};
var bouncingBall = {
	interval: 80,
	frames: [
		"( ●    )",
		"(  ●   )",
		"(   ●  )",
		"(    ● )",
		"(     ●)",
		"(    ● )",
		"(   ●  )",
		"(  ●   )",
		"( ●    )",
		"(●     )"
	]
};
var smiley = {
	interval: 200,
	frames: [
		"😄 ",
		"😝 "
	]
};
var monkey = {
	interval: 300,
	frames: [
		"🙈 ",
		"🙈 ",
		"🙉 ",
		"🙊 "
	]
};
var hearts = {
	interval: 100,
	frames: [
		"💛 ",
		"💙 ",
		"💜 ",
		"💚 ",
		"❤️ "
	]
};
var clock = {
	interval: 100,
	frames: [
		"🕛 ",
		"🕐 ",
		"🕑 ",
		"🕒 ",
		"🕓 ",
		"🕔 ",
		"🕕 ",
		"🕖 ",
		"🕗 ",
		"🕘 ",
		"🕙 ",
		"🕚 "
	]
};
var earth = {
	interval: 180,
	frames: [
		"🌍 ",
		"🌎 ",
		"🌏 "
	]
};
var material = {
	interval: 17,
	frames: [
		"█▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁",
		"██▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁",
		"███▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁",
		"████▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁",
		"██████▁▁▁▁▁▁▁▁▁▁▁▁▁▁",
		"██████▁▁▁▁▁▁▁▁▁▁▁▁▁▁",
		"███████▁▁▁▁▁▁▁▁▁▁▁▁▁",
		"████████▁▁▁▁▁▁▁▁▁▁▁▁",
		"█████████▁▁▁▁▁▁▁▁▁▁▁",
		"█████████▁▁▁▁▁▁▁▁▁▁▁",
		"██████████▁▁▁▁▁▁▁▁▁▁",
		"███████████▁▁▁▁▁▁▁▁▁",
		"█████████████▁▁▁▁▁▁▁",
		"██████████████▁▁▁▁▁▁",
		"██████████████▁▁▁▁▁▁",
		"▁██████████████▁▁▁▁▁",
		"▁██████████████▁▁▁▁▁",
		"▁██████████████▁▁▁▁▁",
		"▁▁██████████████▁▁▁▁",
		"▁▁▁██████████████▁▁▁",
		"▁▁▁▁█████████████▁▁▁",
		"▁▁▁▁██████████████▁▁",
		"▁▁▁▁██████████████▁▁",
		"▁▁▁▁▁██████████████▁",
		"▁▁▁▁▁██████████████▁",
		"▁▁▁▁▁██████████████▁",
		"▁▁▁▁▁▁██████████████",
		"▁▁▁▁▁▁██████████████",
		"▁▁▁▁▁▁▁█████████████",
		"▁▁▁▁▁▁▁█████████████",
		"▁▁▁▁▁▁▁▁████████████",
		"▁▁▁▁▁▁▁▁████████████",
		"▁▁▁▁▁▁▁▁▁███████████",
		"▁▁▁▁▁▁▁▁▁███████████",
		"▁▁▁▁▁▁▁▁▁▁██████████",
		"▁▁▁▁▁▁▁▁▁▁██████████",
		"▁▁▁▁▁▁▁▁▁▁▁▁████████",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁███████",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁▁██████",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁█████",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁█████",
		"█▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁████",
		"██▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁███",
		"██▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁███",
		"███▁▁▁▁▁▁▁▁▁▁▁▁▁▁███",
		"████▁▁▁▁▁▁▁▁▁▁▁▁▁▁██",
		"█████▁▁▁▁▁▁▁▁▁▁▁▁▁▁█",
		"█████▁▁▁▁▁▁▁▁▁▁▁▁▁▁█",
		"██████▁▁▁▁▁▁▁▁▁▁▁▁▁█",
		"████████▁▁▁▁▁▁▁▁▁▁▁▁",
		"█████████▁▁▁▁▁▁▁▁▁▁▁",
		"█████████▁▁▁▁▁▁▁▁▁▁▁",
		"█████████▁▁▁▁▁▁▁▁▁▁▁",
		"█████████▁▁▁▁▁▁▁▁▁▁▁",
		"███████████▁▁▁▁▁▁▁▁▁",
		"████████████▁▁▁▁▁▁▁▁",
		"████████████▁▁▁▁▁▁▁▁",
		"██████████████▁▁▁▁▁▁",
		"██████████████▁▁▁▁▁▁",
		"▁██████████████▁▁▁▁▁",
		"▁██████████████▁▁▁▁▁",
		"▁▁▁█████████████▁▁▁▁",
		"▁▁▁▁▁████████████▁▁▁",
		"▁▁▁▁▁████████████▁▁▁",
		"▁▁▁▁▁▁███████████▁▁▁",
		"▁▁▁▁▁▁▁▁█████████▁▁▁",
		"▁▁▁▁▁▁▁▁█████████▁▁▁",
		"▁▁▁▁▁▁▁▁▁█████████▁▁",
		"▁▁▁▁▁▁▁▁▁█████████▁▁",
		"▁▁▁▁▁▁▁▁▁▁█████████▁",
		"▁▁▁▁▁▁▁▁▁▁▁████████▁",
		"▁▁▁▁▁▁▁▁▁▁▁████████▁",
		"▁▁▁▁▁▁▁▁▁▁▁▁███████▁",
		"▁▁▁▁▁▁▁▁▁▁▁▁███████▁",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁███████",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁███████",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁█████",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁████",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁████",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁████",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁███",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁███",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁██",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁██",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁██",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁█",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁█",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁█",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁"
	]
};
var moon = {
	interval: 80,
	frames: [
		"🌑 ",
		"🌒 ",
		"🌓 ",
		"🌔 ",
		"🌕 ",
		"🌖 ",
		"🌗 ",
		"🌘 "
	]
};
var runner = {
	interval: 140,
	frames: [
		"🚶 ",
		"🏃 "
	]
};
var pong = {
	interval: 80,
	frames: [
		"▐⠂       ▌",
		"▐⠈       ▌",
		"▐ ⠂      ▌",
		"▐ ⠠      ▌",
		"▐  ⡀     ▌",
		"▐  ⠠     ▌",
		"▐   ⠂    ▌",
		"▐   ⠈    ▌",
		"▐    ⠂   ▌",
		"▐    ⠠   ▌",
		"▐     ⡀  ▌",
		"▐     ⠠  ▌",
		"▐      ⠂ ▌",
		"▐      ⠈ ▌",
		"▐       ⠂▌",
		"▐       ⠠▌",
		"▐       ⡀▌",
		"▐      ⠠ ▌",
		"▐      ⠂ ▌",
		"▐     ⠈  ▌",
		"▐     ⠂  ▌",
		"▐    ⠠   ▌",
		"▐    ⡀   ▌",
		"▐   ⠠    ▌",
		"▐   ⠂    ▌",
		"▐  ⠈     ▌",
		"▐  ⠂     ▌",
		"▐ ⠠      ▌",
		"▐ ⡀      ▌",
		"▐⠠       ▌"
	]
};
var shark = {
	interval: 120,
	frames: [
		"▐|\\____________▌",
		"▐_|\\___________▌",
		"▐__|\\__________▌",
		"▐___|\\_________▌",
		"▐____|\\________▌",
		"▐_____|\\_______▌",
		"▐______|\\______▌",
		"▐_______|\\_____▌",
		"▐________|\\____▌",
		"▐_________|\\___▌",
		"▐__________|\\__▌",
		"▐___________|\\_▌",
		"▐____________|\\▌",
		"▐____________/|▌",
		"▐___________/|_▌",
		"▐__________/|__▌",
		"▐_________/|___▌",
		"▐________/|____▌",
		"▐_______/|_____▌",
		"▐______/|______▌",
		"▐_____/|_______▌",
		"▐____/|________▌",
		"▐___/|_________▌",
		"▐__/|__________▌",
		"▐_/|___________▌",
		"▐/|____________▌"
	]
};
var dqpb = {
	interval: 100,
	frames: [
		"d",
		"q",
		"p",
		"b"
	]
};
var weather = {
	interval: 100,
	frames: [
		"☀️ ",
		"☀️ ",
		"☀️ ",
		"🌤 ",
		"⛅️ ",
		"🌥 ",
		"☁️ ",
		"🌧 ",
		"🌨 ",
		"🌧 ",
		"🌨 ",
		"🌧 ",
		"🌨 ",
		"⛈ ",
		"🌨 ",
		"🌧 ",
		"🌨 ",
		"☁️ ",
		"🌥 ",
		"⛅️ ",
		"🌤 ",
		"☀️ ",
		"☀️ "
	]
};
var christmas = {
	interval: 400,
	frames: [
		"🌲",
		"🎄"
	]
};
var grenade = {
	interval: 80,
	frames: [
		"،  ",
		"′  ",
		" ´ ",
		" ‾ ",
		"  ⸌",
		"  ⸊",
		"  |",
		"  ⁎",
		"  ⁕",
		" ෴ ",
		"  ⁓",
		"   ",
		"   ",
		"   "
	]
};
var point = {
	interval: 125,
	frames: [
		"∙∙∙",
		"●∙∙",
		"∙●∙",
		"∙∙●",
		"∙∙∙"
	]
};
var layer = {
	interval: 150,
	frames: [
		"-",
		"=",
		"≡"
	]
};
var betaWave = {
	interval: 80,
	frames: [
		"ρββββββ",
		"βρβββββ",
		"ββρββββ",
		"βββρβββ",
		"ββββρββ",
		"βββββρβ",
		"ββββββρ"
	]
};
var fingerDance = {
	interval: 160,
	frames: [
		"🤘 ",
		"🤟 ",
		"🖖 ",
		"✋ ",
		"🤚 ",
		"👆 "
	]
};
var fistBump = {
	interval: 80,
	frames: [
		"🤜　　　　🤛 ",
		"🤜　　　　🤛 ",
		"🤜　　　　🤛 ",
		"　🤜　　🤛　 ",
		"　　🤜🤛　　 ",
		"　🤜✨🤛　　 ",
		"🤜　✨　🤛　 "
	]
};
var soccerHeader = {
	interval: 80,
	frames: [
		" 🧑⚽️       🧑 ",
		"🧑  ⚽️      🧑 ",
		"🧑   ⚽️     🧑 ",
		"🧑    ⚽️    🧑 ",
		"🧑     ⚽️   🧑 ",
		"🧑      ⚽️  🧑 ",
		"🧑       ⚽️🧑  ",
		"🧑      ⚽️  🧑 ",
		"🧑     ⚽️   🧑 ",
		"🧑    ⚽️    🧑 ",
		"🧑   ⚽️     🧑 ",
		"🧑  ⚽️      🧑 "
	]
};
var mindblown = {
	interval: 160,
	frames: [
		"😐 ",
		"😐 ",
		"😮 ",
		"😮 ",
		"😦 ",
		"😦 ",
		"😧 ",
		"😧 ",
		"🤯 ",
		"💥 ",
		"✨ ",
		"　 ",
		"　 ",
		"　 "
	]
};
var speaker = {
	interval: 160,
	frames: [
		"🔈 ",
		"🔉 ",
		"🔊 ",
		"🔉 "
	]
};
var orangePulse = {
	interval: 100,
	frames: [
		"🔸 ",
		"🔶 ",
		"🟠 ",
		"🟠 ",
		"🔶 "
	]
};
var bluePulse = {
	interval: 100,
	frames: [
		"🔹 ",
		"🔷 ",
		"🔵 ",
		"🔵 ",
		"🔷 "
	]
};
var orangeBluePulse = {
	interval: 100,
	frames: [
		"🔸 ",
		"🔶 ",
		"🟠 ",
		"🟠 ",
		"🔶 ",
		"🔹 ",
		"🔷 ",
		"🔵 ",
		"🔵 ",
		"🔷 "
	]
};
var timeTravel = {
	interval: 100,
	frames: [
		"🕛 ",
		"🕚 ",
		"🕙 ",
		"🕘 ",
		"🕗 ",
		"🕖 ",
		"🕕 ",
		"🕔 ",
		"🕓 ",
		"🕒 ",
		"🕑 ",
		"🕐 "
	]
};
var aesthetic = {
	interval: 80,
	frames: [
		"▰▱▱▱▱▱▱",
		"▰▰▱▱▱▱▱",
		"▰▰▰▱▱▱▱",
		"▰▰▰▰▱▱▱",
		"▰▰▰▰▰▱▱",
		"▰▰▰▰▰▰▱",
		"▰▰▰▰▰▰▰",
		"▰▱▱▱▱▱▱"
	]
};
var require$$0 = {
	dots: dots,
	dots2: dots2,
	dots3: dots3,
	dots4: dots4,
	dots5: dots5,
	dots6: dots6,
	dots7: dots7,
	dots8: dots8,
	dots9: dots9,
	dots10: dots10,
	dots11: dots11,
	dots12: dots12,
	dots8Bit: dots8Bit,
	line: line,
	line2: line2,
	pipe: pipe,
	simpleDots: simpleDots,
	simpleDotsScrolling: simpleDotsScrolling,
	star: star,
	star2: star2,
	flip: flip,
	hamburger: hamburger,
	growVertical: growVertical,
	growHorizontal: growHorizontal,
	balloon: balloon,
	balloon2: balloon2,
	noise: noise,
	bounce: bounce,
	boxBounce: boxBounce,
	boxBounce2: boxBounce2,
	triangle: triangle,
	arc: arc,
	circle: circle,
	squareCorners: squareCorners,
	circleQuarters: circleQuarters,
	circleHalves: circleHalves,
	squish: squish,
	toggle: toggle,
	toggle2: toggle2,
	toggle3: toggle3,
	toggle4: toggle4,
	toggle5: toggle5,
	toggle6: toggle6,
	toggle7: toggle7,
	toggle8: toggle8,
	toggle9: toggle9,
	toggle10: toggle10,
	toggle11: toggle11,
	toggle12: toggle12,
	toggle13: toggle13,
	arrow: arrow,
	arrow2: arrow2,
	arrow3: arrow3,
	bouncingBar: bouncingBar,
	bouncingBall: bouncingBall,
	smiley: smiley,
	monkey: monkey,
	hearts: hearts,
	clock: clock,
	earth: earth,
	material: material,
	moon: moon,
	runner: runner,
	pong: pong,
	shark: shark,
	dqpb: dqpb,
	weather: weather,
	christmas: christmas,
	grenade: grenade,
	point: point,
	layer: layer,
	betaWave: betaWave,
	fingerDance: fingerDance,
	fistBump: fistBump,
	soccerHeader: soccerHeader,
	mindblown: mindblown,
	speaker: speaker,
	orangePulse: orangePulse,
	bluePulse: bluePulse,
	orangeBluePulse: orangeBluePulse,
	timeTravel: timeTravel,
	aesthetic: aesthetic
};

const spinners = Object.assign({}, require$$0); // eslint-disable-line import/extensions

const spinnersList = Object.keys(spinners);

Object.defineProperty(spinners, 'random', {
	get() {
		const randomIndex = Math.floor(Math.random() * spinnersList.length);
		const spinnerName = spinnersList[randomIndex];
		return spinners[spinnerName];
	}
});

var cliSpinners = spinners;

function ansiRegex({onlyFirst = false} = {}) {
	const pattern = [
	    '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
		'(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))'
	].join('|');

	return new RegExp(pattern, onlyFirst ? undefined : 'g');
}

function stripAnsi(string) {
	if (typeof string !== 'string') {
		throw new TypeError(`Expected a \`string\`, got \`${typeof string}\``);
	}

	return string.replace(ansiRegex(), '');
}

var wcwidth$1 = {exports: {}};

var clone$1 = {exports: {}};

(function (module) {
	var clone = (function() {

	/**
	 * Clones (copies) an Object using deep copying.
	 *
	 * This function supports circular references by default, but if you are certain
	 * there are no circular references in your object, you can save some CPU time
	 * by calling clone(obj, false).
	 *
	 * Caution: if `circular` is false and `parent` contains circular references,
	 * your program may enter an infinite loop and crash.
	 *
	 * @param `parent` - the object to be cloned
	 * @param `circular` - set to true if the object to be cloned may contain
	 *    circular references. (optional - true by default)
	 * @param `depth` - set to a number if the object is only to be cloned to
	 *    a particular depth. (optional - defaults to Infinity)
	 * @param `prototype` - sets the prototype to be used when cloning an object.
	 *    (optional - defaults to parent prototype).
	*/
	function clone(parent, circular, depth, prototype) {
	  if (typeof circular === 'object') {
	    depth = circular.depth;
	    prototype = circular.prototype;
	    circular = circular.circular;
	  }
	  // maintain two arrays for circular references, where corresponding parents
	  // and children have the same index
	  var allParents = [];
	  var allChildren = [];

	  var useBuffer = typeof Buffer != 'undefined';

	  if (typeof circular == 'undefined')
	    circular = true;

	  if (typeof depth == 'undefined')
	    depth = Infinity;

	  // recurse this function so we don't reset allParents and allChildren
	  function _clone(parent, depth) {
	    // cloning null always returns null
	    if (parent === null)
	      return null;

	    if (depth == 0)
	      return parent;

	    var child;
	    var proto;
	    if (typeof parent != 'object') {
	      return parent;
	    }

	    if (clone.__isArray(parent)) {
	      child = [];
	    } else if (clone.__isRegExp(parent)) {
	      child = new RegExp(parent.source, __getRegExpFlags(parent));
	      if (parent.lastIndex) child.lastIndex = parent.lastIndex;
	    } else if (clone.__isDate(parent)) {
	      child = new Date(parent.getTime());
	    } else if (useBuffer && Buffer.isBuffer(parent)) {
	      if (Buffer.allocUnsafe) {
	        // Node.js >= 4.5.0
	        child = Buffer.allocUnsafe(parent.length);
	      } else {
	        // Older Node.js versions
	        child = new Buffer(parent.length);
	      }
	      parent.copy(child);
	      return child;
	    } else {
	      if (typeof prototype == 'undefined') {
	        proto = Object.getPrototypeOf(parent);
	        child = Object.create(proto);
	      }
	      else {
	        child = Object.create(prototype);
	        proto = prototype;
	      }
	    }

	    if (circular) {
	      var index = allParents.indexOf(parent);

	      if (index != -1) {
	        return allChildren[index];
	      }
	      allParents.push(parent);
	      allChildren.push(child);
	    }

	    for (var i in parent) {
	      var attrs;
	      if (proto) {
	        attrs = Object.getOwnPropertyDescriptor(proto, i);
	      }

	      if (attrs && attrs.set == null) {
	        continue;
	      }
	      child[i] = _clone(parent[i], depth - 1);
	    }

	    return child;
	  }

	  return _clone(parent, depth);
	}

	/**
	 * Simple flat clone using prototype, accepts only objects, usefull for property
	 * override on FLAT configuration object (no nested props).
	 *
	 * USE WITH CAUTION! This may not behave as you wish if you do not know how this
	 * works.
	 */
	clone.clonePrototype = function clonePrototype(parent) {
	  if (parent === null)
	    return null;

	  var c = function () {};
	  c.prototype = parent;
	  return new c();
	};

	// private utility functions

	function __objToStr(o) {
	  return Object.prototype.toString.call(o);
	}	clone.__objToStr = __objToStr;

	function __isDate(o) {
	  return typeof o === 'object' && __objToStr(o) === '[object Date]';
	}	clone.__isDate = __isDate;

	function __isArray(o) {
	  return typeof o === 'object' && __objToStr(o) === '[object Array]';
	}	clone.__isArray = __isArray;

	function __isRegExp(o) {
	  return typeof o === 'object' && __objToStr(o) === '[object RegExp]';
	}	clone.__isRegExp = __isRegExp;

	function __getRegExpFlags(re) {
	  var flags = '';
	  if (re.global) flags += 'g';
	  if (re.ignoreCase) flags += 'i';
	  if (re.multiline) flags += 'm';
	  return flags;
	}	clone.__getRegExpFlags = __getRegExpFlags;

	return clone;
	})();

	if (module.exports) {
	  module.exports = clone;
	}
} (clone$1));

var clone = clone$1.exports;

var defaults$1 = function(options, defaults) {
  options = options || {};

  Object.keys(defaults).forEach(function(key) {
    if (typeof options[key] === 'undefined') {
      options[key] = clone(defaults[key]);
    }
  });

  return options;
};

var combining$1 = [
    [ 0x0300, 0x036F ], [ 0x0483, 0x0486 ], [ 0x0488, 0x0489 ],
    [ 0x0591, 0x05BD ], [ 0x05BF, 0x05BF ], [ 0x05C1, 0x05C2 ],
    [ 0x05C4, 0x05C5 ], [ 0x05C7, 0x05C7 ], [ 0x0600, 0x0603 ],
    [ 0x0610, 0x0615 ], [ 0x064B, 0x065E ], [ 0x0670, 0x0670 ],
    [ 0x06D6, 0x06E4 ], [ 0x06E7, 0x06E8 ], [ 0x06EA, 0x06ED ],
    [ 0x070F, 0x070F ], [ 0x0711, 0x0711 ], [ 0x0730, 0x074A ],
    [ 0x07A6, 0x07B0 ], [ 0x07EB, 0x07F3 ], [ 0x0901, 0x0902 ],
    [ 0x093C, 0x093C ], [ 0x0941, 0x0948 ], [ 0x094D, 0x094D ],
    [ 0x0951, 0x0954 ], [ 0x0962, 0x0963 ], [ 0x0981, 0x0981 ],
    [ 0x09BC, 0x09BC ], [ 0x09C1, 0x09C4 ], [ 0x09CD, 0x09CD ],
    [ 0x09E2, 0x09E3 ], [ 0x0A01, 0x0A02 ], [ 0x0A3C, 0x0A3C ],
    [ 0x0A41, 0x0A42 ], [ 0x0A47, 0x0A48 ], [ 0x0A4B, 0x0A4D ],
    [ 0x0A70, 0x0A71 ], [ 0x0A81, 0x0A82 ], [ 0x0ABC, 0x0ABC ],
    [ 0x0AC1, 0x0AC5 ], [ 0x0AC7, 0x0AC8 ], [ 0x0ACD, 0x0ACD ],
    [ 0x0AE2, 0x0AE3 ], [ 0x0B01, 0x0B01 ], [ 0x0B3C, 0x0B3C ],
    [ 0x0B3F, 0x0B3F ], [ 0x0B41, 0x0B43 ], [ 0x0B4D, 0x0B4D ],
    [ 0x0B56, 0x0B56 ], [ 0x0B82, 0x0B82 ], [ 0x0BC0, 0x0BC0 ],
    [ 0x0BCD, 0x0BCD ], [ 0x0C3E, 0x0C40 ], [ 0x0C46, 0x0C48 ],
    [ 0x0C4A, 0x0C4D ], [ 0x0C55, 0x0C56 ], [ 0x0CBC, 0x0CBC ],
    [ 0x0CBF, 0x0CBF ], [ 0x0CC6, 0x0CC6 ], [ 0x0CCC, 0x0CCD ],
    [ 0x0CE2, 0x0CE3 ], [ 0x0D41, 0x0D43 ], [ 0x0D4D, 0x0D4D ],
    [ 0x0DCA, 0x0DCA ], [ 0x0DD2, 0x0DD4 ], [ 0x0DD6, 0x0DD6 ],
    [ 0x0E31, 0x0E31 ], [ 0x0E34, 0x0E3A ], [ 0x0E47, 0x0E4E ],
    [ 0x0EB1, 0x0EB1 ], [ 0x0EB4, 0x0EB9 ], [ 0x0EBB, 0x0EBC ],
    [ 0x0EC8, 0x0ECD ], [ 0x0F18, 0x0F19 ], [ 0x0F35, 0x0F35 ],
    [ 0x0F37, 0x0F37 ], [ 0x0F39, 0x0F39 ], [ 0x0F71, 0x0F7E ],
    [ 0x0F80, 0x0F84 ], [ 0x0F86, 0x0F87 ], [ 0x0F90, 0x0F97 ],
    [ 0x0F99, 0x0FBC ], [ 0x0FC6, 0x0FC6 ], [ 0x102D, 0x1030 ],
    [ 0x1032, 0x1032 ], [ 0x1036, 0x1037 ], [ 0x1039, 0x1039 ],
    [ 0x1058, 0x1059 ], [ 0x1160, 0x11FF ], [ 0x135F, 0x135F ],
    [ 0x1712, 0x1714 ], [ 0x1732, 0x1734 ], [ 0x1752, 0x1753 ],
    [ 0x1772, 0x1773 ], [ 0x17B4, 0x17B5 ], [ 0x17B7, 0x17BD ],
    [ 0x17C6, 0x17C6 ], [ 0x17C9, 0x17D3 ], [ 0x17DD, 0x17DD ],
    [ 0x180B, 0x180D ], [ 0x18A9, 0x18A9 ], [ 0x1920, 0x1922 ],
    [ 0x1927, 0x1928 ], [ 0x1932, 0x1932 ], [ 0x1939, 0x193B ],
    [ 0x1A17, 0x1A18 ], [ 0x1B00, 0x1B03 ], [ 0x1B34, 0x1B34 ],
    [ 0x1B36, 0x1B3A ], [ 0x1B3C, 0x1B3C ], [ 0x1B42, 0x1B42 ],
    [ 0x1B6B, 0x1B73 ], [ 0x1DC0, 0x1DCA ], [ 0x1DFE, 0x1DFF ],
    [ 0x200B, 0x200F ], [ 0x202A, 0x202E ], [ 0x2060, 0x2063 ],
    [ 0x206A, 0x206F ], [ 0x20D0, 0x20EF ], [ 0x302A, 0x302F ],
    [ 0x3099, 0x309A ], [ 0xA806, 0xA806 ], [ 0xA80B, 0xA80B ],
    [ 0xA825, 0xA826 ], [ 0xFB1E, 0xFB1E ], [ 0xFE00, 0xFE0F ],
    [ 0xFE20, 0xFE23 ], [ 0xFEFF, 0xFEFF ], [ 0xFFF9, 0xFFFB ],
    [ 0x10A01, 0x10A03 ], [ 0x10A05, 0x10A06 ], [ 0x10A0C, 0x10A0F ],
    [ 0x10A38, 0x10A3A ], [ 0x10A3F, 0x10A3F ], [ 0x1D167, 0x1D169 ],
    [ 0x1D173, 0x1D182 ], [ 0x1D185, 0x1D18B ], [ 0x1D1AA, 0x1D1AD ],
    [ 0x1D242, 0x1D244 ], [ 0xE0001, 0xE0001 ], [ 0xE0020, 0xE007F ],
    [ 0xE0100, 0xE01EF ]
];

var defaults = defaults$1;
var combining = combining$1;

var DEFAULTS = {
  nul: 0,
  control: 0
};

wcwidth$1.exports = function wcwidth(str) {
  return wcswidth(str, DEFAULTS)
};

wcwidth$1.exports.config = function(opts) {
  opts = defaults(opts || {}, DEFAULTS);
  return function wcwidth(str) {
    return wcswidth(str, opts)
  }
};

/*
 *  The following functions define the column width of an ISO 10646
 *  character as follows:
 *  - The null character (U+0000) has a column width of 0.
 *  - Other C0/C1 control characters and DEL will lead to a return value
 *    of -1.
 *  - Non-spacing and enclosing combining characters (general category
 *    code Mn or Me in the
 *    Unicode database) have a column width of 0.
 *  - SOFT HYPHEN (U+00AD) has a column width of 1.
 *  - Other format characters (general category code Cf in the Unicode
 *    database) and ZERO WIDTH
 *    SPACE (U+200B) have a column width of 0.
 *  - Hangul Jamo medial vowels and final consonants (U+1160-U+11FF)
 *    have a column width of 0.
 *  - Spacing characters in the East Asian Wide (W) or East Asian
 *    Full-width (F) category as
 *    defined in Unicode Technical Report #11 have a column width of 2.
 *  - All remaining characters (including all printable ISO 8859-1 and
 *    WGL4 characters, Unicode control characters, etc.) have a column
 *    width of 1.
 *  This implementation assumes that characters are encoded in ISO 10646.
*/

function wcswidth(str, opts) {
  if (typeof str !== 'string') return wcwidth(str, opts)

  var s = 0;
  for (var i = 0; i < str.length; i++) {
    var n = wcwidth(str.charCodeAt(i), opts);
    if (n < 0) return -1
    s += n;
  }

  return s
}

function wcwidth(ucs, opts) {
  // test for 8-bit control characters
  if (ucs === 0) return opts.nul
  if (ucs < 32 || (ucs >= 0x7f && ucs < 0xa0)) return opts.control

  // binary search in table of non-spacing characters
  if (bisearch(ucs)) return 0

  // if we arrive here, ucs is not a combining or C0/C1 control character
  return 1 +
      (ucs >= 0x1100 &&
       (ucs <= 0x115f ||                       // Hangul Jamo init. consonants
        ucs == 0x2329 || ucs == 0x232a ||
        (ucs >= 0x2e80 && ucs <= 0xa4cf &&
         ucs != 0x303f) ||                     // CJK ... Yi
        (ucs >= 0xac00 && ucs <= 0xd7a3) ||    // Hangul Syllables
        (ucs >= 0xf900 && ucs <= 0xfaff) ||    // CJK Compatibility Ideographs
        (ucs >= 0xfe10 && ucs <= 0xfe19) ||    // Vertical forms
        (ucs >= 0xfe30 && ucs <= 0xfe6f) ||    // CJK Compatibility Forms
        (ucs >= 0xff00 && ucs <= 0xff60) ||    // Fullwidth Forms
        (ucs >= 0xffe0 && ucs <= 0xffe6) ||
        (ucs >= 0x20000 && ucs <= 0x2fffd) ||
        (ucs >= 0x30000 && ucs <= 0x3fffd)));
}

function bisearch(ucs) {
  var min = 0;
  var max = combining.length - 1;
  var mid;

  if (ucs < combining[0][0] || ucs > combining[max][1]) return false

  while (max >= min) {
    mid = Math.floor((min + max) / 2);
    if (ucs > combining[mid][1]) min = mid + 1;
    else if (ucs < combining[mid][0]) max = mid - 1;
    else return true
  }

  return false
}

function isInteractive({stream = process.stdout} = {}) {
	return Boolean(
		stream && stream.isTTY &&
		process.env.TERM !== 'dumb' &&
		!('CI' in process.env)
	);
}

function isUnicodeSupported() {
	if (process__default["default"].platform !== 'win32') {
		return process__default["default"].env.TERM !== 'linux'; // Linux console (kernel)
	}

	return Boolean(process__default["default"].env.CI)
		|| Boolean(process__default["default"].env.WT_SESSION) // Windows Terminal
		|| process__default["default"].env.ConEmuTask === '{cmd::Cmder}' // ConEmu and cmder
		|| process__default["default"].env.TERM_PROGRAM === 'vscode'
		|| process__default["default"].env.TERM === 'xterm-256color'
		|| process__default["default"].env.TERM === 'alacritty'
		|| process__default["default"].env.TERMINAL_EMULATOR === 'JetBrains-JediTerm';
}

var bl = {exports: {}};

var readable = {exports: {}};

var stream = {exports: {}};

var hasRequiredStream;

function requireStream () {
	if (hasRequiredStream) return stream.exports;
	hasRequiredStream = 1;
	(function (module) {
		module.exports = require$$0__default$5["default"];
} (stream));
	return stream.exports;
}

var buffer_list;
var hasRequiredBuffer_list;

function requireBuffer_list () {
	if (hasRequiredBuffer_list) return buffer_list;
	hasRequiredBuffer_list = 1;

	function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

	function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

	function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

	function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

	function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

	function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

	var _require = require$$0__default$6["default"],
	    Buffer = _require.Buffer;

	var _require2 = require$$2__default$1["default"],
	    inspect = _require2.inspect;

	var custom = inspect && inspect.custom || 'inspect';

	function copyBuffer(src, target, offset) {
	  Buffer.prototype.copy.call(src, target, offset);
	}

	buffer_list =
	/*#__PURE__*/
	function () {
	  function BufferList() {
	    _classCallCheck(this, BufferList);

	    this.head = null;
	    this.tail = null;
	    this.length = 0;
	  }

	  _createClass(BufferList, [{
	    key: "push",
	    value: function push(v) {
	      var entry = {
	        data: v,
	        next: null
	      };
	      if (this.length > 0) this.tail.next = entry;else this.head = entry;
	      this.tail = entry;
	      ++this.length;
	    }
	  }, {
	    key: "unshift",
	    value: function unshift(v) {
	      var entry = {
	        data: v,
	        next: this.head
	      };
	      if (this.length === 0) this.tail = entry;
	      this.head = entry;
	      ++this.length;
	    }
	  }, {
	    key: "shift",
	    value: function shift() {
	      if (this.length === 0) return;
	      var ret = this.head.data;
	      if (this.length === 1) this.head = this.tail = null;else this.head = this.head.next;
	      --this.length;
	      return ret;
	    }
	  }, {
	    key: "clear",
	    value: function clear() {
	      this.head = this.tail = null;
	      this.length = 0;
	    }
	  }, {
	    key: "join",
	    value: function join(s) {
	      if (this.length === 0) return '';
	      var p = this.head;
	      var ret = '' + p.data;

	      while (p = p.next) {
	        ret += s + p.data;
	      }

	      return ret;
	    }
	  }, {
	    key: "concat",
	    value: function concat(n) {
	      if (this.length === 0) return Buffer.alloc(0);
	      var ret = Buffer.allocUnsafe(n >>> 0);
	      var p = this.head;
	      var i = 0;

	      while (p) {
	        copyBuffer(p.data, ret, i);
	        i += p.data.length;
	        p = p.next;
	      }

	      return ret;
	    } // Consumes a specified amount of bytes or characters from the buffered data.

	  }, {
	    key: "consume",
	    value: function consume(n, hasStrings) {
	      var ret;

	      if (n < this.head.data.length) {
	        // `slice` is the same for buffers and strings.
	        ret = this.head.data.slice(0, n);
	        this.head.data = this.head.data.slice(n);
	      } else if (n === this.head.data.length) {
	        // First chunk is a perfect match.
	        ret = this.shift();
	      } else {
	        // Result spans more than one buffer.
	        ret = hasStrings ? this._getString(n) : this._getBuffer(n);
	      }

	      return ret;
	    }
	  }, {
	    key: "first",
	    value: function first() {
	      return this.head.data;
	    } // Consumes a specified amount of characters from the buffered data.

	  }, {
	    key: "_getString",
	    value: function _getString(n) {
	      var p = this.head;
	      var c = 1;
	      var ret = p.data;
	      n -= ret.length;

	      while (p = p.next) {
	        var str = p.data;
	        var nb = n > str.length ? str.length : n;
	        if (nb === str.length) ret += str;else ret += str.slice(0, n);
	        n -= nb;

	        if (n === 0) {
	          if (nb === str.length) {
	            ++c;
	            if (p.next) this.head = p.next;else this.head = this.tail = null;
	          } else {
	            this.head = p;
	            p.data = str.slice(nb);
	          }

	          break;
	        }

	        ++c;
	      }

	      this.length -= c;
	      return ret;
	    } // Consumes a specified amount of bytes from the buffered data.

	  }, {
	    key: "_getBuffer",
	    value: function _getBuffer(n) {
	      var ret = Buffer.allocUnsafe(n);
	      var p = this.head;
	      var c = 1;
	      p.data.copy(ret);
	      n -= p.data.length;

	      while (p = p.next) {
	        var buf = p.data;
	        var nb = n > buf.length ? buf.length : n;
	        buf.copy(ret, ret.length - n, 0, nb);
	        n -= nb;

	        if (n === 0) {
	          if (nb === buf.length) {
	            ++c;
	            if (p.next) this.head = p.next;else this.head = this.tail = null;
	          } else {
	            this.head = p;
	            p.data = buf.slice(nb);
	          }

	          break;
	        }

	        ++c;
	      }

	      this.length -= c;
	      return ret;
	    } // Make sure the linked list only shows the minimal necessary information.

	  }, {
	    key: custom,
	    value: function value(_, options) {
	      return inspect(this, _objectSpread({}, options, {
	        // Only inspect one level.
	        depth: 0,
	        // It should not recurse.
	        customInspect: false
	      }));
	    }
	  }]);

	  return BufferList;
	}();
	return buffer_list;
}

var destroy_1;
var hasRequiredDestroy;

function requireDestroy () {
	if (hasRequiredDestroy) return destroy_1;
	hasRequiredDestroy = 1;

	function destroy(err, cb) {
	  var _this = this;

	  var readableDestroyed = this._readableState && this._readableState.destroyed;
	  var writableDestroyed = this._writableState && this._writableState.destroyed;

	  if (readableDestroyed || writableDestroyed) {
	    if (cb) {
	      cb(err);
	    } else if (err) {
	      if (!this._writableState) {
	        process.nextTick(emitErrorNT, this, err);
	      } else if (!this._writableState.errorEmitted) {
	        this._writableState.errorEmitted = true;
	        process.nextTick(emitErrorNT, this, err);
	      }
	    }

	    return this;
	  } // we set destroyed to true before firing error callbacks in order
	  // to make it re-entrance safe in case destroy() is called within callbacks


	  if (this._readableState) {
	    this._readableState.destroyed = true;
	  } // if this is a duplex stream mark the writable part as destroyed as well


	  if (this._writableState) {
	    this._writableState.destroyed = true;
	  }

	  this._destroy(err || null, function (err) {
	    if (!cb && err) {
	      if (!_this._writableState) {
	        process.nextTick(emitErrorAndCloseNT, _this, err);
	      } else if (!_this._writableState.errorEmitted) {
	        _this._writableState.errorEmitted = true;
	        process.nextTick(emitErrorAndCloseNT, _this, err);
	      } else {
	        process.nextTick(emitCloseNT, _this);
	      }
	    } else if (cb) {
	      process.nextTick(emitCloseNT, _this);
	      cb(err);
	    } else {
	      process.nextTick(emitCloseNT, _this);
	    }
	  });

	  return this;
	}

	function emitErrorAndCloseNT(self, err) {
	  emitErrorNT(self, err);
	  emitCloseNT(self);
	}

	function emitCloseNT(self) {
	  if (self._writableState && !self._writableState.emitClose) return;
	  if (self._readableState && !self._readableState.emitClose) return;
	  self.emit('close');
	}

	function undestroy() {
	  if (this._readableState) {
	    this._readableState.destroyed = false;
	    this._readableState.reading = false;
	    this._readableState.ended = false;
	    this._readableState.endEmitted = false;
	  }

	  if (this._writableState) {
	    this._writableState.destroyed = false;
	    this._writableState.ended = false;
	    this._writableState.ending = false;
	    this._writableState.finalCalled = false;
	    this._writableState.prefinished = false;
	    this._writableState.finished = false;
	    this._writableState.errorEmitted = false;
	  }
	}

	function emitErrorNT(self, err) {
	  self.emit('error', err);
	}

	function errorOrDestroy(stream, err) {
	  // We have tests that rely on errors being emitted
	  // in the same tick, so changing this is semver major.
	  // For now when you opt-in to autoDestroy we allow
	  // the error to be emitted nextTick. In a future
	  // semver major update we should change the default to this.
	  var rState = stream._readableState;
	  var wState = stream._writableState;
	  if (rState && rState.autoDestroy || wState && wState.autoDestroy) stream.destroy(err);else stream.emit('error', err);
	}

	destroy_1 = {
	  destroy: destroy,
	  undestroy: undestroy,
	  errorOrDestroy: errorOrDestroy
	};
	return destroy_1;
}

var errors = {};

var hasRequiredErrors;

function requireErrors () {
	if (hasRequiredErrors) return errors;
	hasRequiredErrors = 1;

	const codes = {};

	function createErrorType(code, message, Base) {
	  if (!Base) {
	    Base = Error;
	  }

	  function getMessage (arg1, arg2, arg3) {
	    if (typeof message === 'string') {
	      return message
	    } else {
	      return message(arg1, arg2, arg3)
	    }
	  }

	  class NodeError extends Base {
	    constructor (arg1, arg2, arg3) {
	      super(getMessage(arg1, arg2, arg3));
	    }
	  }

	  NodeError.prototype.name = Base.name;
	  NodeError.prototype.code = code;

	  codes[code] = NodeError;
	}

	// https://github.com/nodejs/node/blob/v10.8.0/lib/internal/errors.js
	function oneOf(expected, thing) {
	  if (Array.isArray(expected)) {
	    const len = expected.length;
	    expected = expected.map((i) => String(i));
	    if (len > 2) {
	      return `one of ${thing} ${expected.slice(0, len - 1).join(', ')}, or ` +
	             expected[len - 1];
	    } else if (len === 2) {
	      return `one of ${thing} ${expected[0]} or ${expected[1]}`;
	    } else {
	      return `of ${thing} ${expected[0]}`;
	    }
	  } else {
	    return `of ${thing} ${String(expected)}`;
	  }
	}

	// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/startsWith
	function startsWith(str, search, pos) {
		return str.substr(!pos || pos < 0 ? 0 : +pos, search.length) === search;
	}

	// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/endsWith
	function endsWith(str, search, this_len) {
		if (this_len === undefined || this_len > str.length) {
			this_len = str.length;
		}
		return str.substring(this_len - search.length, this_len) === search;
	}

	// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/includes
	function includes(str, search, start) {
	  if (typeof start !== 'number') {
	    start = 0;
	  }

	  if (start + search.length > str.length) {
	    return false;
	  } else {
	    return str.indexOf(search, start) !== -1;
	  }
	}

	createErrorType('ERR_INVALID_OPT_VALUE', function (name, value) {
	  return 'The value "' + value + '" is invalid for option "' + name + '"'
	}, TypeError);
	createErrorType('ERR_INVALID_ARG_TYPE', function (name, expected, actual) {
	  // determiner: 'must be' or 'must not be'
	  let determiner;
	  if (typeof expected === 'string' && startsWith(expected, 'not ')) {
	    determiner = 'must not be';
	    expected = expected.replace(/^not /, '');
	  } else {
	    determiner = 'must be';
	  }

	  let msg;
	  if (endsWith(name, ' argument')) {
	    // For cases like 'first argument'
	    msg = `The ${name} ${determiner} ${oneOf(expected, 'type')}`;
	  } else {
	    const type = includes(name, '.') ? 'property' : 'argument';
	    msg = `The "${name}" ${type} ${determiner} ${oneOf(expected, 'type')}`;
	  }

	  msg += `. Received type ${typeof actual}`;
	  return msg;
	}, TypeError);
	createErrorType('ERR_STREAM_PUSH_AFTER_EOF', 'stream.push() after EOF');
	createErrorType('ERR_METHOD_NOT_IMPLEMENTED', function (name) {
	  return 'The ' + name + ' method is not implemented'
	});
	createErrorType('ERR_STREAM_PREMATURE_CLOSE', 'Premature close');
	createErrorType('ERR_STREAM_DESTROYED', function (name) {
	  return 'Cannot call ' + name + ' after a stream was destroyed';
	});
	createErrorType('ERR_MULTIPLE_CALLBACK', 'Callback called multiple times');
	createErrorType('ERR_STREAM_CANNOT_PIPE', 'Cannot pipe, not readable');
	createErrorType('ERR_STREAM_WRITE_AFTER_END', 'write after end');
	createErrorType('ERR_STREAM_NULL_VALUES', 'May not write null values to stream', TypeError);
	createErrorType('ERR_UNKNOWN_ENCODING', function (arg) {
	  return 'Unknown encoding: ' + arg
	}, TypeError);
	createErrorType('ERR_STREAM_UNSHIFT_AFTER_END_EVENT', 'stream.unshift() after end event');

	errors.codes = codes;
	return errors;
}

var state;
var hasRequiredState;

function requireState () {
	if (hasRequiredState) return state;
	hasRequiredState = 1;

	var ERR_INVALID_OPT_VALUE = requireErrors().codes.ERR_INVALID_OPT_VALUE;

	function highWaterMarkFrom(options, isDuplex, duplexKey) {
	  return options.highWaterMark != null ? options.highWaterMark : isDuplex ? options[duplexKey] : null;
	}

	function getHighWaterMark(state, options, duplexKey, isDuplex) {
	  var hwm = highWaterMarkFrom(options, isDuplex, duplexKey);

	  if (hwm != null) {
	    if (!(isFinite(hwm) && Math.floor(hwm) === hwm) || hwm < 0) {
	      var name = isDuplex ? duplexKey : 'highWaterMark';
	      throw new ERR_INVALID_OPT_VALUE(name, hwm);
	    }

	    return Math.floor(hwm);
	  } // Default value


	  return state.objectMode ? 16 : 16 * 1024;
	}

	state = {
	  getHighWaterMark: getHighWaterMark
	};
	return state;
}

var inherits$1 = {exports: {}};

var inherits_browser = {exports: {}};

var hasRequiredInherits_browser;

function requireInherits_browser () {
	if (hasRequiredInherits_browser) return inherits_browser.exports;
	hasRequiredInherits_browser = 1;
	if (typeof Object.create === 'function') {
	  // implementation from standard node.js 'util' module
	  inherits_browser.exports = function inherits(ctor, superCtor) {
	    if (superCtor) {
	      ctor.super_ = superCtor;
	      ctor.prototype = Object.create(superCtor.prototype, {
	        constructor: {
	          value: ctor,
	          enumerable: false,
	          writable: true,
	          configurable: true
	        }
	      });
	    }
	  };
	} else {
	  // old school shim for old browsers
	  inherits_browser.exports = function inherits(ctor, superCtor) {
	    if (superCtor) {
	      ctor.super_ = superCtor;
	      var TempCtor = function () {};
	      TempCtor.prototype = superCtor.prototype;
	      ctor.prototype = new TempCtor();
	      ctor.prototype.constructor = ctor;
	    }
	  };
	}
	return inherits_browser.exports;
}

(function (module) {
	try {
	  var util = require('util');
	  /* istanbul ignore next */
	  if (typeof util.inherits !== 'function') throw '';
	  module.exports = util.inherits;
	} catch (e) {
	  /* istanbul ignore next */
	  module.exports = requireInherits_browser();
	}
} (inherits$1));

var node;
var hasRequiredNode;

function requireNode () {
	if (hasRequiredNode) return node;
	hasRequiredNode = 1;
	/**
	 * For Node.js, simply re-export the core `util.deprecate` function.
	 */

	node = require$$2__default$1["default"].deprecate;
	return node;
}

var _stream_writable;
var hasRequired_stream_writable;

function require_stream_writable () {
	if (hasRequired_stream_writable) return _stream_writable;
	hasRequired_stream_writable = 1;

	_stream_writable = Writable;
	// there will be only 2 of these for each stream


	function CorkedRequest(state) {
	  var _this = this;

	  this.next = null;
	  this.entry = null;

	  this.finish = function () {
	    onCorkedFinish(_this, state);
	  };
	}
	/* </replacement> */

	/*<replacement>*/


	var Duplex;
	/*</replacement>*/

	Writable.WritableState = WritableState;
	/*<replacement>*/

	var internalUtil = {
	  deprecate: requireNode()
	};
	/*</replacement>*/

	/*<replacement>*/

	var Stream = requireStream();
	/*</replacement>*/


	var Buffer = require$$0__default$6["default"].Buffer;

	var OurUint8Array = commonjsGlobal.Uint8Array || function () {};

	function _uint8ArrayToBuffer(chunk) {
	  return Buffer.from(chunk);
	}

	function _isUint8Array(obj) {
	  return Buffer.isBuffer(obj) || obj instanceof OurUint8Array;
	}

	var destroyImpl = requireDestroy();

	var _require = requireState(),
	    getHighWaterMark = _require.getHighWaterMark;

	var _require$codes = requireErrors().codes,
	    ERR_INVALID_ARG_TYPE = _require$codes.ERR_INVALID_ARG_TYPE,
	    ERR_METHOD_NOT_IMPLEMENTED = _require$codes.ERR_METHOD_NOT_IMPLEMENTED,
	    ERR_MULTIPLE_CALLBACK = _require$codes.ERR_MULTIPLE_CALLBACK,
	    ERR_STREAM_CANNOT_PIPE = _require$codes.ERR_STREAM_CANNOT_PIPE,
	    ERR_STREAM_DESTROYED = _require$codes.ERR_STREAM_DESTROYED,
	    ERR_STREAM_NULL_VALUES = _require$codes.ERR_STREAM_NULL_VALUES,
	    ERR_STREAM_WRITE_AFTER_END = _require$codes.ERR_STREAM_WRITE_AFTER_END,
	    ERR_UNKNOWN_ENCODING = _require$codes.ERR_UNKNOWN_ENCODING;

	var errorOrDestroy = destroyImpl.errorOrDestroy;

	inherits$1.exports(Writable, Stream);

	function nop() {}

	function WritableState(options, stream, isDuplex) {
	  Duplex = Duplex || require_stream_duplex();
	  options = options || {}; // Duplex streams are both readable and writable, but share
	  // the same options object.
	  // However, some cases require setting options to different
	  // values for the readable and the writable sides of the duplex stream,
	  // e.g. options.readableObjectMode vs. options.writableObjectMode, etc.

	  if (typeof isDuplex !== 'boolean') isDuplex = stream instanceof Duplex; // object stream flag to indicate whether or not this stream
	  // contains buffers or objects.

	  this.objectMode = !!options.objectMode;
	  if (isDuplex) this.objectMode = this.objectMode || !!options.writableObjectMode; // the point at which write() starts returning false
	  // Note: 0 is a valid value, means that we always return false if
	  // the entire buffer is not flushed immediately on write()

	  this.highWaterMark = getHighWaterMark(this, options, 'writableHighWaterMark', isDuplex); // if _final has been called

	  this.finalCalled = false; // drain event flag.

	  this.needDrain = false; // at the start of calling end()

	  this.ending = false; // when end() has been called, and returned

	  this.ended = false; // when 'finish' is emitted

	  this.finished = false; // has it been destroyed

	  this.destroyed = false; // should we decode strings into buffers before passing to _write?
	  // this is here so that some node-core streams can optimize string
	  // handling at a lower level.

	  var noDecode = options.decodeStrings === false;
	  this.decodeStrings = !noDecode; // Crypto is kind of old and crusty.  Historically, its default string
	  // encoding is 'binary' so we have to make this configurable.
	  // Everything else in the universe uses 'utf8', though.

	  this.defaultEncoding = options.defaultEncoding || 'utf8'; // not an actual buffer we keep track of, but a measurement
	  // of how much we're waiting to get pushed to some underlying
	  // socket or file.

	  this.length = 0; // a flag to see when we're in the middle of a write.

	  this.writing = false; // when true all writes will be buffered until .uncork() call

	  this.corked = 0; // a flag to be able to tell if the onwrite cb is called immediately,
	  // or on a later tick.  We set this to true at first, because any
	  // actions that shouldn't happen until "later" should generally also
	  // not happen before the first write call.

	  this.sync = true; // a flag to know if we're processing previously buffered items, which
	  // may call the _write() callback in the same tick, so that we don't
	  // end up in an overlapped onwrite situation.

	  this.bufferProcessing = false; // the callback that's passed to _write(chunk,cb)

	  this.onwrite = function (er) {
	    onwrite(stream, er);
	  }; // the callback that the user supplies to write(chunk,encoding,cb)


	  this.writecb = null; // the amount that is being written when _write is called.

	  this.writelen = 0;
	  this.bufferedRequest = null;
	  this.lastBufferedRequest = null; // number of pending user-supplied write callbacks
	  // this must be 0 before 'finish' can be emitted

	  this.pendingcb = 0; // emit prefinish if the only thing we're waiting for is _write cbs
	  // This is relevant for synchronous Transform streams

	  this.prefinished = false; // True if the error was already emitted and should not be thrown again

	  this.errorEmitted = false; // Should close be emitted on destroy. Defaults to true.

	  this.emitClose = options.emitClose !== false; // Should .destroy() be called after 'finish' (and potentially 'end')

	  this.autoDestroy = !!options.autoDestroy; // count buffered requests

	  this.bufferedRequestCount = 0; // allocate the first CorkedRequest, there is always
	  // one allocated and free to use, and we maintain at most two

	  this.corkedRequestsFree = new CorkedRequest(this);
	}

	WritableState.prototype.getBuffer = function getBuffer() {
	  var current = this.bufferedRequest;
	  var out = [];

	  while (current) {
	    out.push(current);
	    current = current.next;
	  }

	  return out;
	};

	(function () {
	  try {
	    Object.defineProperty(WritableState.prototype, 'buffer', {
	      get: internalUtil.deprecate(function writableStateBufferGetter() {
	        return this.getBuffer();
	      }, '_writableState.buffer is deprecated. Use _writableState.getBuffer ' + 'instead.', 'DEP0003')
	    });
	  } catch (_) {}
	})(); // Test _writableState for inheritance to account for Duplex streams,
	// whose prototype chain only points to Readable.


	var realHasInstance;

	if (typeof Symbol === 'function' && Symbol.hasInstance && typeof Function.prototype[Symbol.hasInstance] === 'function') {
	  realHasInstance = Function.prototype[Symbol.hasInstance];
	  Object.defineProperty(Writable, Symbol.hasInstance, {
	    value: function value(object) {
	      if (realHasInstance.call(this, object)) return true;
	      if (this !== Writable) return false;
	      return object && object._writableState instanceof WritableState;
	    }
	  });
	} else {
	  realHasInstance = function realHasInstance(object) {
	    return object instanceof this;
	  };
	}

	function Writable(options) {
	  Duplex = Duplex || require_stream_duplex(); // Writable ctor is applied to Duplexes, too.
	  // `realHasInstance` is necessary because using plain `instanceof`
	  // would return false, as no `_writableState` property is attached.
	  // Trying to use the custom `instanceof` for Writable here will also break the
	  // Node.js LazyTransform implementation, which has a non-trivial getter for
	  // `_writableState` that would lead to infinite recursion.
	  // Checking for a Stream.Duplex instance is faster here instead of inside
	  // the WritableState constructor, at least with V8 6.5

	  var isDuplex = this instanceof Duplex;
	  if (!isDuplex && !realHasInstance.call(Writable, this)) return new Writable(options);
	  this._writableState = new WritableState(options, this, isDuplex); // legacy.

	  this.writable = true;

	  if (options) {
	    if (typeof options.write === 'function') this._write = options.write;
	    if (typeof options.writev === 'function') this._writev = options.writev;
	    if (typeof options.destroy === 'function') this._destroy = options.destroy;
	    if (typeof options.final === 'function') this._final = options.final;
	  }

	  Stream.call(this);
	} // Otherwise people can pipe Writable streams, which is just wrong.


	Writable.prototype.pipe = function () {
	  errorOrDestroy(this, new ERR_STREAM_CANNOT_PIPE());
	};

	function writeAfterEnd(stream, cb) {
	  var er = new ERR_STREAM_WRITE_AFTER_END(); // TODO: defer error events consistently everywhere, not just the cb

	  errorOrDestroy(stream, er);
	  process.nextTick(cb, er);
	} // Checks that a user-supplied chunk is valid, especially for the particular
	// mode the stream is in. Currently this means that `null` is never accepted
	// and undefined/non-string values are only allowed in object mode.


	function validChunk(stream, state, chunk, cb) {
	  var er;

	  if (chunk === null) {
	    er = new ERR_STREAM_NULL_VALUES();
	  } else if (typeof chunk !== 'string' && !state.objectMode) {
	    er = new ERR_INVALID_ARG_TYPE('chunk', ['string', 'Buffer'], chunk);
	  }

	  if (er) {
	    errorOrDestroy(stream, er);
	    process.nextTick(cb, er);
	    return false;
	  }

	  return true;
	}

	Writable.prototype.write = function (chunk, encoding, cb) {
	  var state = this._writableState;
	  var ret = false;

	  var isBuf = !state.objectMode && _isUint8Array(chunk);

	  if (isBuf && !Buffer.isBuffer(chunk)) {
	    chunk = _uint8ArrayToBuffer(chunk);
	  }

	  if (typeof encoding === 'function') {
	    cb = encoding;
	    encoding = null;
	  }

	  if (isBuf) encoding = 'buffer';else if (!encoding) encoding = state.defaultEncoding;
	  if (typeof cb !== 'function') cb = nop;
	  if (state.ending) writeAfterEnd(this, cb);else if (isBuf || validChunk(this, state, chunk, cb)) {
	    state.pendingcb++;
	    ret = writeOrBuffer(this, state, isBuf, chunk, encoding, cb);
	  }
	  return ret;
	};

	Writable.prototype.cork = function () {
	  this._writableState.corked++;
	};

	Writable.prototype.uncork = function () {
	  var state = this._writableState;

	  if (state.corked) {
	    state.corked--;
	    if (!state.writing && !state.corked && !state.bufferProcessing && state.bufferedRequest) clearBuffer(this, state);
	  }
	};

	Writable.prototype.setDefaultEncoding = function setDefaultEncoding(encoding) {
	  // node::ParseEncoding() requires lower case.
	  if (typeof encoding === 'string') encoding = encoding.toLowerCase();
	  if (!(['hex', 'utf8', 'utf-8', 'ascii', 'binary', 'base64', 'ucs2', 'ucs-2', 'utf16le', 'utf-16le', 'raw'].indexOf((encoding + '').toLowerCase()) > -1)) throw new ERR_UNKNOWN_ENCODING(encoding);
	  this._writableState.defaultEncoding = encoding;
	  return this;
	};

	Object.defineProperty(Writable.prototype, 'writableBuffer', {
	  // making it explicit this property is not enumerable
	  // because otherwise some prototype manipulation in
	  // userland will fail
	  enumerable: false,
	  get: function get() {
	    return this._writableState && this._writableState.getBuffer();
	  }
	});

	function decodeChunk(state, chunk, encoding) {
	  if (!state.objectMode && state.decodeStrings !== false && typeof chunk === 'string') {
	    chunk = Buffer.from(chunk, encoding);
	  }

	  return chunk;
	}

	Object.defineProperty(Writable.prototype, 'writableHighWaterMark', {
	  // making it explicit this property is not enumerable
	  // because otherwise some prototype manipulation in
	  // userland will fail
	  enumerable: false,
	  get: function get() {
	    return this._writableState.highWaterMark;
	  }
	}); // if we're already writing something, then just put this
	// in the queue, and wait our turn.  Otherwise, call _write
	// If we return false, then we need a drain event, so set that flag.

	function writeOrBuffer(stream, state, isBuf, chunk, encoding, cb) {
	  if (!isBuf) {
	    var newChunk = decodeChunk(state, chunk, encoding);

	    if (chunk !== newChunk) {
	      isBuf = true;
	      encoding = 'buffer';
	      chunk = newChunk;
	    }
	  }

	  var len = state.objectMode ? 1 : chunk.length;
	  state.length += len;
	  var ret = state.length < state.highWaterMark; // we must ensure that previous needDrain will not be reset to false.

	  if (!ret) state.needDrain = true;

	  if (state.writing || state.corked) {
	    var last = state.lastBufferedRequest;
	    state.lastBufferedRequest = {
	      chunk: chunk,
	      encoding: encoding,
	      isBuf: isBuf,
	      callback: cb,
	      next: null
	    };

	    if (last) {
	      last.next = state.lastBufferedRequest;
	    } else {
	      state.bufferedRequest = state.lastBufferedRequest;
	    }

	    state.bufferedRequestCount += 1;
	  } else {
	    doWrite(stream, state, false, len, chunk, encoding, cb);
	  }

	  return ret;
	}

	function doWrite(stream, state, writev, len, chunk, encoding, cb) {
	  state.writelen = len;
	  state.writecb = cb;
	  state.writing = true;
	  state.sync = true;
	  if (state.destroyed) state.onwrite(new ERR_STREAM_DESTROYED('write'));else if (writev) stream._writev(chunk, state.onwrite);else stream._write(chunk, encoding, state.onwrite);
	  state.sync = false;
	}

	function onwriteError(stream, state, sync, er, cb) {
	  --state.pendingcb;

	  if (sync) {
	    // defer the callback if we are being called synchronously
	    // to avoid piling up things on the stack
	    process.nextTick(cb, er); // this can emit finish, and it will always happen
	    // after error

	    process.nextTick(finishMaybe, stream, state);
	    stream._writableState.errorEmitted = true;
	    errorOrDestroy(stream, er);
	  } else {
	    // the caller expect this to happen before if
	    // it is async
	    cb(er);
	    stream._writableState.errorEmitted = true;
	    errorOrDestroy(stream, er); // this can emit finish, but finish must
	    // always follow error

	    finishMaybe(stream, state);
	  }
	}

	function onwriteStateUpdate(state) {
	  state.writing = false;
	  state.writecb = null;
	  state.length -= state.writelen;
	  state.writelen = 0;
	}

	function onwrite(stream, er) {
	  var state = stream._writableState;
	  var sync = state.sync;
	  var cb = state.writecb;
	  if (typeof cb !== 'function') throw new ERR_MULTIPLE_CALLBACK();
	  onwriteStateUpdate(state);
	  if (er) onwriteError(stream, state, sync, er, cb);else {
	    // Check if we're actually ready to finish, but don't emit yet
	    var finished = needFinish(state) || stream.destroyed;

	    if (!finished && !state.corked && !state.bufferProcessing && state.bufferedRequest) {
	      clearBuffer(stream, state);
	    }

	    if (sync) {
	      process.nextTick(afterWrite, stream, state, finished, cb);
	    } else {
	      afterWrite(stream, state, finished, cb);
	    }
	  }
	}

	function afterWrite(stream, state, finished, cb) {
	  if (!finished) onwriteDrain(stream, state);
	  state.pendingcb--;
	  cb();
	  finishMaybe(stream, state);
	} // Must force callback to be called on nextTick, so that we don't
	// emit 'drain' before the write() consumer gets the 'false' return
	// value, and has a chance to attach a 'drain' listener.


	function onwriteDrain(stream, state) {
	  if (state.length === 0 && state.needDrain) {
	    state.needDrain = false;
	    stream.emit('drain');
	  }
	} // if there's something in the buffer waiting, then process it


	function clearBuffer(stream, state) {
	  state.bufferProcessing = true;
	  var entry = state.bufferedRequest;

	  if (stream._writev && entry && entry.next) {
	    // Fast case, write everything using _writev()
	    var l = state.bufferedRequestCount;
	    var buffer = new Array(l);
	    var holder = state.corkedRequestsFree;
	    holder.entry = entry;
	    var count = 0;
	    var allBuffers = true;

	    while (entry) {
	      buffer[count] = entry;
	      if (!entry.isBuf) allBuffers = false;
	      entry = entry.next;
	      count += 1;
	    }

	    buffer.allBuffers = allBuffers;
	    doWrite(stream, state, true, state.length, buffer, '', holder.finish); // doWrite is almost always async, defer these to save a bit of time
	    // as the hot path ends with doWrite

	    state.pendingcb++;
	    state.lastBufferedRequest = null;

	    if (holder.next) {
	      state.corkedRequestsFree = holder.next;
	      holder.next = null;
	    } else {
	      state.corkedRequestsFree = new CorkedRequest(state);
	    }

	    state.bufferedRequestCount = 0;
	  } else {
	    // Slow case, write chunks one-by-one
	    while (entry) {
	      var chunk = entry.chunk;
	      var encoding = entry.encoding;
	      var cb = entry.callback;
	      var len = state.objectMode ? 1 : chunk.length;
	      doWrite(stream, state, false, len, chunk, encoding, cb);
	      entry = entry.next;
	      state.bufferedRequestCount--; // if we didn't call the onwrite immediately, then
	      // it means that we need to wait until it does.
	      // also, that means that the chunk and cb are currently
	      // being processed, so move the buffer counter past them.

	      if (state.writing) {
	        break;
	      }
	    }

	    if (entry === null) state.lastBufferedRequest = null;
	  }

	  state.bufferedRequest = entry;
	  state.bufferProcessing = false;
	}

	Writable.prototype._write = function (chunk, encoding, cb) {
	  cb(new ERR_METHOD_NOT_IMPLEMENTED('_write()'));
	};

	Writable.prototype._writev = null;

	Writable.prototype.end = function (chunk, encoding, cb) {
	  var state = this._writableState;

	  if (typeof chunk === 'function') {
	    cb = chunk;
	    chunk = null;
	    encoding = null;
	  } else if (typeof encoding === 'function') {
	    cb = encoding;
	    encoding = null;
	  }

	  if (chunk !== null && chunk !== undefined) this.write(chunk, encoding); // .end() fully uncorks

	  if (state.corked) {
	    state.corked = 1;
	    this.uncork();
	  } // ignore unnecessary end() calls.


	  if (!state.ending) endWritable(this, state, cb);
	  return this;
	};

	Object.defineProperty(Writable.prototype, 'writableLength', {
	  // making it explicit this property is not enumerable
	  // because otherwise some prototype manipulation in
	  // userland will fail
	  enumerable: false,
	  get: function get() {
	    return this._writableState.length;
	  }
	});

	function needFinish(state) {
	  return state.ending && state.length === 0 && state.bufferedRequest === null && !state.finished && !state.writing;
	}

	function callFinal(stream, state) {
	  stream._final(function (err) {
	    state.pendingcb--;

	    if (err) {
	      errorOrDestroy(stream, err);
	    }

	    state.prefinished = true;
	    stream.emit('prefinish');
	    finishMaybe(stream, state);
	  });
	}

	function prefinish(stream, state) {
	  if (!state.prefinished && !state.finalCalled) {
	    if (typeof stream._final === 'function' && !state.destroyed) {
	      state.pendingcb++;
	      state.finalCalled = true;
	      process.nextTick(callFinal, stream, state);
	    } else {
	      state.prefinished = true;
	      stream.emit('prefinish');
	    }
	  }
	}

	function finishMaybe(stream, state) {
	  var need = needFinish(state);

	  if (need) {
	    prefinish(stream, state);

	    if (state.pendingcb === 0) {
	      state.finished = true;
	      stream.emit('finish');

	      if (state.autoDestroy) {
	        // In case of duplex streams we need a way to detect
	        // if the readable side is ready for autoDestroy as well
	        var rState = stream._readableState;

	        if (!rState || rState.autoDestroy && rState.endEmitted) {
	          stream.destroy();
	        }
	      }
	    }
	  }

	  return need;
	}

	function endWritable(stream, state, cb) {
	  state.ending = true;
	  finishMaybe(stream, state);

	  if (cb) {
	    if (state.finished) process.nextTick(cb);else stream.once('finish', cb);
	  }

	  state.ended = true;
	  stream.writable = false;
	}

	function onCorkedFinish(corkReq, state, err) {
	  var entry = corkReq.entry;
	  corkReq.entry = null;

	  while (entry) {
	    var cb = entry.callback;
	    state.pendingcb--;
	    cb(err);
	    entry = entry.next;
	  } // reuse the free corkReq.


	  state.corkedRequestsFree.next = corkReq;
	}

	Object.defineProperty(Writable.prototype, 'destroyed', {
	  // making it explicit this property is not enumerable
	  // because otherwise some prototype manipulation in
	  // userland will fail
	  enumerable: false,
	  get: function get() {
	    if (this._writableState === undefined) {
	      return false;
	    }

	    return this._writableState.destroyed;
	  },
	  set: function set(value) {
	    // we ignore the value if the stream
	    // has not been initialized yet
	    if (!this._writableState) {
	      return;
	    } // backward compatibility, the user is explicitly
	    // managing destroyed


	    this._writableState.destroyed = value;
	  }
	});
	Writable.prototype.destroy = destroyImpl.destroy;
	Writable.prototype._undestroy = destroyImpl.undestroy;

	Writable.prototype._destroy = function (err, cb) {
	  cb(err);
	};
	return _stream_writable;
}

var _stream_duplex;
var hasRequired_stream_duplex;

function require_stream_duplex () {
	if (hasRequired_stream_duplex) return _stream_duplex;
	hasRequired_stream_duplex = 1;
	/*<replacement>*/

	var objectKeys = Object.keys || function (obj) {
	  var keys = [];

	  for (var key in obj) {
	    keys.push(key);
	  }

	  return keys;
	};
	/*</replacement>*/


	_stream_duplex = Duplex;

	var Readable = require_stream_readable();

	var Writable = require_stream_writable();

	inherits$1.exports(Duplex, Readable);

	{
	  // Allow the keys array to be GC'ed.
	  var keys = objectKeys(Writable.prototype);

	  for (var v = 0; v < keys.length; v++) {
	    var method = keys[v];
	    if (!Duplex.prototype[method]) Duplex.prototype[method] = Writable.prototype[method];
	  }
	}

	function Duplex(options) {
	  if (!(this instanceof Duplex)) return new Duplex(options);
	  Readable.call(this, options);
	  Writable.call(this, options);
	  this.allowHalfOpen = true;

	  if (options) {
	    if (options.readable === false) this.readable = false;
	    if (options.writable === false) this.writable = false;

	    if (options.allowHalfOpen === false) {
	      this.allowHalfOpen = false;
	      this.once('end', onend);
	    }
	  }
	}

	Object.defineProperty(Duplex.prototype, 'writableHighWaterMark', {
	  // making it explicit this property is not enumerable
	  // because otherwise some prototype manipulation in
	  // userland will fail
	  enumerable: false,
	  get: function get() {
	    return this._writableState.highWaterMark;
	  }
	});
	Object.defineProperty(Duplex.prototype, 'writableBuffer', {
	  // making it explicit this property is not enumerable
	  // because otherwise some prototype manipulation in
	  // userland will fail
	  enumerable: false,
	  get: function get() {
	    return this._writableState && this._writableState.getBuffer();
	  }
	});
	Object.defineProperty(Duplex.prototype, 'writableLength', {
	  // making it explicit this property is not enumerable
	  // because otherwise some prototype manipulation in
	  // userland will fail
	  enumerable: false,
	  get: function get() {
	    return this._writableState.length;
	  }
	}); // the no-half-open enforcer

	function onend() {
	  // If the writable side ended, then we're ok.
	  if (this._writableState.ended) return; // no more data can be written.
	  // But allow more writes to happen in this tick.

	  process.nextTick(onEndNT, this);
	}

	function onEndNT(self) {
	  self.end();
	}

	Object.defineProperty(Duplex.prototype, 'destroyed', {
	  // making it explicit this property is not enumerable
	  // because otherwise some prototype manipulation in
	  // userland will fail
	  enumerable: false,
	  get: function get() {
	    if (this._readableState === undefined || this._writableState === undefined) {
	      return false;
	    }

	    return this._readableState.destroyed && this._writableState.destroyed;
	  },
	  set: function set(value) {
	    // we ignore the value if the stream
	    // has not been initialized yet
	    if (this._readableState === undefined || this._writableState === undefined) {
	      return;
	    } // backward compatibility, the user is explicitly
	    // managing destroyed


	    this._readableState.destroyed = value;
	    this._writableState.destroyed = value;
	  }
	});
	return _stream_duplex;
}

var endOfStream;
var hasRequiredEndOfStream;

function requireEndOfStream () {
	if (hasRequiredEndOfStream) return endOfStream;
	hasRequiredEndOfStream = 1;

	var ERR_STREAM_PREMATURE_CLOSE = requireErrors().codes.ERR_STREAM_PREMATURE_CLOSE;

	function once(callback) {
	  var called = false;
	  return function () {
	    if (called) return;
	    called = true;

	    for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
	      args[_key] = arguments[_key];
	    }

	    callback.apply(this, args);
	  };
	}

	function noop() {}

	function isRequest(stream) {
	  return stream.setHeader && typeof stream.abort === 'function';
	}

	function eos(stream, opts, callback) {
	  if (typeof opts === 'function') return eos(stream, null, opts);
	  if (!opts) opts = {};
	  callback = once(callback || noop);
	  var readable = opts.readable || opts.readable !== false && stream.readable;
	  var writable = opts.writable || opts.writable !== false && stream.writable;

	  var onlegacyfinish = function onlegacyfinish() {
	    if (!stream.writable) onfinish();
	  };

	  var writableEnded = stream._writableState && stream._writableState.finished;

	  var onfinish = function onfinish() {
	    writable = false;
	    writableEnded = true;
	    if (!readable) callback.call(stream);
	  };

	  var readableEnded = stream._readableState && stream._readableState.endEmitted;

	  var onend = function onend() {
	    readable = false;
	    readableEnded = true;
	    if (!writable) callback.call(stream);
	  };

	  var onerror = function onerror(err) {
	    callback.call(stream, err);
	  };

	  var onclose = function onclose() {
	    var err;

	    if (readable && !readableEnded) {
	      if (!stream._readableState || !stream._readableState.ended) err = new ERR_STREAM_PREMATURE_CLOSE();
	      return callback.call(stream, err);
	    }

	    if (writable && !writableEnded) {
	      if (!stream._writableState || !stream._writableState.ended) err = new ERR_STREAM_PREMATURE_CLOSE();
	      return callback.call(stream, err);
	    }
	  };

	  var onrequest = function onrequest() {
	    stream.req.on('finish', onfinish);
	  };

	  if (isRequest(stream)) {
	    stream.on('complete', onfinish);
	    stream.on('abort', onclose);
	    if (stream.req) onrequest();else stream.on('request', onrequest);
	  } else if (writable && !stream._writableState) {
	    // legacy streams
	    stream.on('end', onlegacyfinish);
	    stream.on('close', onlegacyfinish);
	  }

	  stream.on('end', onend);
	  stream.on('finish', onfinish);
	  if (opts.error !== false) stream.on('error', onerror);
	  stream.on('close', onclose);
	  return function () {
	    stream.removeListener('complete', onfinish);
	    stream.removeListener('abort', onclose);
	    stream.removeListener('request', onrequest);
	    if (stream.req) stream.req.removeListener('finish', onfinish);
	    stream.removeListener('end', onlegacyfinish);
	    stream.removeListener('close', onlegacyfinish);
	    stream.removeListener('finish', onfinish);
	    stream.removeListener('end', onend);
	    stream.removeListener('error', onerror);
	    stream.removeListener('close', onclose);
	  };
	}

	endOfStream = eos;
	return endOfStream;
}

var async_iterator;
var hasRequiredAsync_iterator;

function requireAsync_iterator () {
	if (hasRequiredAsync_iterator) return async_iterator;
	hasRequiredAsync_iterator = 1;

	var _Object$setPrototypeO;

	function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

	var finished = requireEndOfStream();

	var kLastResolve = Symbol('lastResolve');
	var kLastReject = Symbol('lastReject');
	var kError = Symbol('error');
	var kEnded = Symbol('ended');
	var kLastPromise = Symbol('lastPromise');
	var kHandlePromise = Symbol('handlePromise');
	var kStream = Symbol('stream');

	function createIterResult(value, done) {
	  return {
	    value: value,
	    done: done
	  };
	}

	function readAndResolve(iter) {
	  var resolve = iter[kLastResolve];

	  if (resolve !== null) {
	    var data = iter[kStream].read(); // we defer if data is null
	    // we can be expecting either 'end' or
	    // 'error'

	    if (data !== null) {
	      iter[kLastPromise] = null;
	      iter[kLastResolve] = null;
	      iter[kLastReject] = null;
	      resolve(createIterResult(data, false));
	    }
	  }
	}

	function onReadable(iter) {
	  // we wait for the next tick, because it might
	  // emit an error with process.nextTick
	  process.nextTick(readAndResolve, iter);
	}

	function wrapForNext(lastPromise, iter) {
	  return function (resolve, reject) {
	    lastPromise.then(function () {
	      if (iter[kEnded]) {
	        resolve(createIterResult(undefined, true));
	        return;
	      }

	      iter[kHandlePromise](resolve, reject);
	    }, reject);
	  };
	}

	var AsyncIteratorPrototype = Object.getPrototypeOf(function () {});
	var ReadableStreamAsyncIteratorPrototype = Object.setPrototypeOf((_Object$setPrototypeO = {
	  get stream() {
	    return this[kStream];
	  },

	  next: function next() {
	    var _this = this;

	    // if we have detected an error in the meanwhile
	    // reject straight away
	    var error = this[kError];

	    if (error !== null) {
	      return Promise.reject(error);
	    }

	    if (this[kEnded]) {
	      return Promise.resolve(createIterResult(undefined, true));
	    }

	    if (this[kStream].destroyed) {
	      // We need to defer via nextTick because if .destroy(err) is
	      // called, the error will be emitted via nextTick, and
	      // we cannot guarantee that there is no error lingering around
	      // waiting to be emitted.
	      return new Promise(function (resolve, reject) {
	        process.nextTick(function () {
	          if (_this[kError]) {
	            reject(_this[kError]);
	          } else {
	            resolve(createIterResult(undefined, true));
	          }
	        });
	      });
	    } // if we have multiple next() calls
	    // we will wait for the previous Promise to finish
	    // this logic is optimized to support for await loops,
	    // where next() is only called once at a time


	    var lastPromise = this[kLastPromise];
	    var promise;

	    if (lastPromise) {
	      promise = new Promise(wrapForNext(lastPromise, this));
	    } else {
	      // fast path needed to support multiple this.push()
	      // without triggering the next() queue
	      var data = this[kStream].read();

	      if (data !== null) {
	        return Promise.resolve(createIterResult(data, false));
	      }

	      promise = new Promise(this[kHandlePromise]);
	    }

	    this[kLastPromise] = promise;
	    return promise;
	  }
	}, _defineProperty(_Object$setPrototypeO, Symbol.asyncIterator, function () {
	  return this;
	}), _defineProperty(_Object$setPrototypeO, "return", function _return() {
	  var _this2 = this;

	  // destroy(err, cb) is a private API
	  // we can guarantee we have that here, because we control the
	  // Readable class this is attached to
	  return new Promise(function (resolve, reject) {
	    _this2[kStream].destroy(null, function (err) {
	      if (err) {
	        reject(err);
	        return;
	      }

	      resolve(createIterResult(undefined, true));
	    });
	  });
	}), _Object$setPrototypeO), AsyncIteratorPrototype);

	var createReadableStreamAsyncIterator = function createReadableStreamAsyncIterator(stream) {
	  var _Object$create;

	  var iterator = Object.create(ReadableStreamAsyncIteratorPrototype, (_Object$create = {}, _defineProperty(_Object$create, kStream, {
	    value: stream,
	    writable: true
	  }), _defineProperty(_Object$create, kLastResolve, {
	    value: null,
	    writable: true
	  }), _defineProperty(_Object$create, kLastReject, {
	    value: null,
	    writable: true
	  }), _defineProperty(_Object$create, kError, {
	    value: null,
	    writable: true
	  }), _defineProperty(_Object$create, kEnded, {
	    value: stream._readableState.endEmitted,
	    writable: true
	  }), _defineProperty(_Object$create, kHandlePromise, {
	    value: function value(resolve, reject) {
	      var data = iterator[kStream].read();

	      if (data) {
	        iterator[kLastPromise] = null;
	        iterator[kLastResolve] = null;
	        iterator[kLastReject] = null;
	        resolve(createIterResult(data, false));
	      } else {
	        iterator[kLastResolve] = resolve;
	        iterator[kLastReject] = reject;
	      }
	    },
	    writable: true
	  }), _Object$create));
	  iterator[kLastPromise] = null;
	  finished(stream, function (err) {
	    if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
	      var reject = iterator[kLastReject]; // reject if we are waiting for data in the Promise
	      // returned by next() and store the error

	      if (reject !== null) {
	        iterator[kLastPromise] = null;
	        iterator[kLastResolve] = null;
	        iterator[kLastReject] = null;
	        reject(err);
	      }

	      iterator[kError] = err;
	      return;
	    }

	    var resolve = iterator[kLastResolve];

	    if (resolve !== null) {
	      iterator[kLastPromise] = null;
	      iterator[kLastResolve] = null;
	      iterator[kLastReject] = null;
	      resolve(createIterResult(undefined, true));
	    }

	    iterator[kEnded] = true;
	  });
	  stream.on('readable', onReadable.bind(null, iterator));
	  return iterator;
	};

	async_iterator = createReadableStreamAsyncIterator;
	return async_iterator;
}

var from_1;
var hasRequiredFrom;

function requireFrom () {
	if (hasRequiredFrom) return from_1;
	hasRequiredFrom = 1;

	function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }

	function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }

	function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

	function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

	function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

	var ERR_INVALID_ARG_TYPE = requireErrors().codes.ERR_INVALID_ARG_TYPE;

	function from(Readable, iterable, opts) {
	  var iterator;

	  if (iterable && typeof iterable.next === 'function') {
	    iterator = iterable;
	  } else if (iterable && iterable[Symbol.asyncIterator]) iterator = iterable[Symbol.asyncIterator]();else if (iterable && iterable[Symbol.iterator]) iterator = iterable[Symbol.iterator]();else throw new ERR_INVALID_ARG_TYPE('iterable', ['Iterable'], iterable);

	  var readable = new Readable(_objectSpread({
	    objectMode: true
	  }, opts)); // Reading boolean to protect against _read
	  // being called before last iteration completion.

	  var reading = false;

	  readable._read = function () {
	    if (!reading) {
	      reading = true;
	      next();
	    }
	  };

	  function next() {
	    return _next2.apply(this, arguments);
	  }

	  function _next2() {
	    _next2 = _asyncToGenerator(function* () {
	      try {
	        var _ref = yield iterator.next(),
	            value = _ref.value,
	            done = _ref.done;

	        if (done) {
	          readable.push(null);
	        } else if (readable.push((yield value))) {
	          next();
	        } else {
	          reading = false;
	        }
	      } catch (err) {
	        readable.destroy(err);
	      }
	    });
	    return _next2.apply(this, arguments);
	  }

	  return readable;
	}

	from_1 = from;
	return from_1;
}

var _stream_readable;
var hasRequired_stream_readable;

function require_stream_readable () {
	if (hasRequired_stream_readable) return _stream_readable;
	hasRequired_stream_readable = 1;

	_stream_readable = Readable;
	/*<replacement>*/

	var Duplex;
	/*</replacement>*/

	Readable.ReadableState = ReadableState;
	/*<replacement>*/

	require$$2__default["default"].EventEmitter;

	var EElistenerCount = function EElistenerCount(emitter, type) {
	  return emitter.listeners(type).length;
	};
	/*</replacement>*/

	/*<replacement>*/


	var Stream = requireStream();
	/*</replacement>*/


	var Buffer = require$$0__default$6["default"].Buffer;

	var OurUint8Array = commonjsGlobal.Uint8Array || function () {};

	function _uint8ArrayToBuffer(chunk) {
	  return Buffer.from(chunk);
	}

	function _isUint8Array(obj) {
	  return Buffer.isBuffer(obj) || obj instanceof OurUint8Array;
	}
	/*<replacement>*/


	var debugUtil = require$$2__default$1["default"];

	var debug;

	if (debugUtil && debugUtil.debuglog) {
	  debug = debugUtil.debuglog('stream');
	} else {
	  debug = function debug() {};
	}
	/*</replacement>*/


	var BufferList = requireBuffer_list();

	var destroyImpl = requireDestroy();

	var _require = requireState(),
	    getHighWaterMark = _require.getHighWaterMark;

	var _require$codes = requireErrors().codes,
	    ERR_INVALID_ARG_TYPE = _require$codes.ERR_INVALID_ARG_TYPE,
	    ERR_STREAM_PUSH_AFTER_EOF = _require$codes.ERR_STREAM_PUSH_AFTER_EOF,
	    ERR_METHOD_NOT_IMPLEMENTED = _require$codes.ERR_METHOD_NOT_IMPLEMENTED,
	    ERR_STREAM_UNSHIFT_AFTER_END_EVENT = _require$codes.ERR_STREAM_UNSHIFT_AFTER_END_EVENT; // Lazy loaded to improve the startup performance.


	var StringDecoder;
	var createReadableStreamAsyncIterator;
	var from;

	inherits$1.exports(Readable, Stream);

	var errorOrDestroy = destroyImpl.errorOrDestroy;
	var kProxyEvents = ['error', 'close', 'destroy', 'pause', 'resume'];

	function prependListener(emitter, event, fn) {
	  // Sadly this is not cacheable as some libraries bundle their own
	  // event emitter implementation with them.
	  if (typeof emitter.prependListener === 'function') return emitter.prependListener(event, fn); // This is a hack to make sure that our error handler is attached before any
	  // userland ones.  NEVER DO THIS. This is here only because this code needs
	  // to continue to work with older versions of Node.js that do not include
	  // the prependListener() method. The goal is to eventually remove this hack.

	  if (!emitter._events || !emitter._events[event]) emitter.on(event, fn);else if (Array.isArray(emitter._events[event])) emitter._events[event].unshift(fn);else emitter._events[event] = [fn, emitter._events[event]];
	}

	function ReadableState(options, stream, isDuplex) {
	  Duplex = Duplex || require_stream_duplex();
	  options = options || {}; // Duplex streams are both readable and writable, but share
	  // the same options object.
	  // However, some cases require setting options to different
	  // values for the readable and the writable sides of the duplex stream.
	  // These options can be provided separately as readableXXX and writableXXX.

	  if (typeof isDuplex !== 'boolean') isDuplex = stream instanceof Duplex; // object stream flag. Used to make read(n) ignore n and to
	  // make all the buffer merging and length checks go away

	  this.objectMode = !!options.objectMode;
	  if (isDuplex) this.objectMode = this.objectMode || !!options.readableObjectMode; // the point at which it stops calling _read() to fill the buffer
	  // Note: 0 is a valid value, means "don't call _read preemptively ever"

	  this.highWaterMark = getHighWaterMark(this, options, 'readableHighWaterMark', isDuplex); // A linked list is used to store data chunks instead of an array because the
	  // linked list can remove elements from the beginning faster than
	  // array.shift()

	  this.buffer = new BufferList();
	  this.length = 0;
	  this.pipes = null;
	  this.pipesCount = 0;
	  this.flowing = null;
	  this.ended = false;
	  this.endEmitted = false;
	  this.reading = false; // a flag to be able to tell if the event 'readable'/'data' is emitted
	  // immediately, or on a later tick.  We set this to true at first, because
	  // any actions that shouldn't happen until "later" should generally also
	  // not happen before the first read call.

	  this.sync = true; // whenever we return null, then we set a flag to say
	  // that we're awaiting a 'readable' event emission.

	  this.needReadable = false;
	  this.emittedReadable = false;
	  this.readableListening = false;
	  this.resumeScheduled = false;
	  this.paused = true; // Should close be emitted on destroy. Defaults to true.

	  this.emitClose = options.emitClose !== false; // Should .destroy() be called after 'end' (and potentially 'finish')

	  this.autoDestroy = !!options.autoDestroy; // has it been destroyed

	  this.destroyed = false; // Crypto is kind of old and crusty.  Historically, its default string
	  // encoding is 'binary' so we have to make this configurable.
	  // Everything else in the universe uses 'utf8', though.

	  this.defaultEncoding = options.defaultEncoding || 'utf8'; // the number of writers that are awaiting a drain event in .pipe()s

	  this.awaitDrain = 0; // if true, a maybeReadMore has been scheduled

	  this.readingMore = false;
	  this.decoder = null;
	  this.encoding = null;

	  if (options.encoding) {
	    if (!StringDecoder) StringDecoder = require$$10__default["default"].StringDecoder;
	    this.decoder = new StringDecoder(options.encoding);
	    this.encoding = options.encoding;
	  }
	}

	function Readable(options) {
	  Duplex = Duplex || require_stream_duplex();
	  if (!(this instanceof Readable)) return new Readable(options); // Checking for a Stream.Duplex instance is faster here instead of inside
	  // the ReadableState constructor, at least with V8 6.5

	  var isDuplex = this instanceof Duplex;
	  this._readableState = new ReadableState(options, this, isDuplex); // legacy

	  this.readable = true;

	  if (options) {
	    if (typeof options.read === 'function') this._read = options.read;
	    if (typeof options.destroy === 'function') this._destroy = options.destroy;
	  }

	  Stream.call(this);
	}

	Object.defineProperty(Readable.prototype, 'destroyed', {
	  // making it explicit this property is not enumerable
	  // because otherwise some prototype manipulation in
	  // userland will fail
	  enumerable: false,
	  get: function get() {
	    if (this._readableState === undefined) {
	      return false;
	    }

	    return this._readableState.destroyed;
	  },
	  set: function set(value) {
	    // we ignore the value if the stream
	    // has not been initialized yet
	    if (!this._readableState) {
	      return;
	    } // backward compatibility, the user is explicitly
	    // managing destroyed


	    this._readableState.destroyed = value;
	  }
	});
	Readable.prototype.destroy = destroyImpl.destroy;
	Readable.prototype._undestroy = destroyImpl.undestroy;

	Readable.prototype._destroy = function (err, cb) {
	  cb(err);
	}; // Manually shove something into the read() buffer.
	// This returns true if the highWaterMark has not been hit yet,
	// similar to how Writable.write() returns true if you should
	// write() some more.


	Readable.prototype.push = function (chunk, encoding) {
	  var state = this._readableState;
	  var skipChunkCheck;

	  if (!state.objectMode) {
	    if (typeof chunk === 'string') {
	      encoding = encoding || state.defaultEncoding;

	      if (encoding !== state.encoding) {
	        chunk = Buffer.from(chunk, encoding);
	        encoding = '';
	      }

	      skipChunkCheck = true;
	    }
	  } else {
	    skipChunkCheck = true;
	  }

	  return readableAddChunk(this, chunk, encoding, false, skipChunkCheck);
	}; // Unshift should *always* be something directly out of read()


	Readable.prototype.unshift = function (chunk) {
	  return readableAddChunk(this, chunk, null, true, false);
	};

	function readableAddChunk(stream, chunk, encoding, addToFront, skipChunkCheck) {
	  debug('readableAddChunk', chunk);
	  var state = stream._readableState;

	  if (chunk === null) {
	    state.reading = false;
	    onEofChunk(stream, state);
	  } else {
	    var er;
	    if (!skipChunkCheck) er = chunkInvalid(state, chunk);

	    if (er) {
	      errorOrDestroy(stream, er);
	    } else if (state.objectMode || chunk && chunk.length > 0) {
	      if (typeof chunk !== 'string' && !state.objectMode && Object.getPrototypeOf(chunk) !== Buffer.prototype) {
	        chunk = _uint8ArrayToBuffer(chunk);
	      }

	      if (addToFront) {
	        if (state.endEmitted) errorOrDestroy(stream, new ERR_STREAM_UNSHIFT_AFTER_END_EVENT());else addChunk(stream, state, chunk, true);
	      } else if (state.ended) {
	        errorOrDestroy(stream, new ERR_STREAM_PUSH_AFTER_EOF());
	      } else if (state.destroyed) {
	        return false;
	      } else {
	        state.reading = false;

	        if (state.decoder && !encoding) {
	          chunk = state.decoder.write(chunk);
	          if (state.objectMode || chunk.length !== 0) addChunk(stream, state, chunk, false);else maybeReadMore(stream, state);
	        } else {
	          addChunk(stream, state, chunk, false);
	        }
	      }
	    } else if (!addToFront) {
	      state.reading = false;
	      maybeReadMore(stream, state);
	    }
	  } // We can push more data if we are below the highWaterMark.
	  // Also, if we have no data yet, we can stand some more bytes.
	  // This is to work around cases where hwm=0, such as the repl.


	  return !state.ended && (state.length < state.highWaterMark || state.length === 0);
	}

	function addChunk(stream, state, chunk, addToFront) {
	  if (state.flowing && state.length === 0 && !state.sync) {
	    state.awaitDrain = 0;
	    stream.emit('data', chunk);
	  } else {
	    // update the buffer info.
	    state.length += state.objectMode ? 1 : chunk.length;
	    if (addToFront) state.buffer.unshift(chunk);else state.buffer.push(chunk);
	    if (state.needReadable) emitReadable(stream);
	  }

	  maybeReadMore(stream, state);
	}

	function chunkInvalid(state, chunk) {
	  var er;

	  if (!_isUint8Array(chunk) && typeof chunk !== 'string' && chunk !== undefined && !state.objectMode) {
	    er = new ERR_INVALID_ARG_TYPE('chunk', ['string', 'Buffer', 'Uint8Array'], chunk);
	  }

	  return er;
	}

	Readable.prototype.isPaused = function () {
	  return this._readableState.flowing === false;
	}; // backwards compatibility.


	Readable.prototype.setEncoding = function (enc) {
	  if (!StringDecoder) StringDecoder = require$$10__default["default"].StringDecoder;
	  var decoder = new StringDecoder(enc);
	  this._readableState.decoder = decoder; // If setEncoding(null), decoder.encoding equals utf8

	  this._readableState.encoding = this._readableState.decoder.encoding; // Iterate over current buffer to convert already stored Buffers:

	  var p = this._readableState.buffer.head;
	  var content = '';

	  while (p !== null) {
	    content += decoder.write(p.data);
	    p = p.next;
	  }

	  this._readableState.buffer.clear();

	  if (content !== '') this._readableState.buffer.push(content);
	  this._readableState.length = content.length;
	  return this;
	}; // Don't raise the hwm > 1GB


	var MAX_HWM = 0x40000000;

	function computeNewHighWaterMark(n) {
	  if (n >= MAX_HWM) {
	    // TODO(ronag): Throw ERR_VALUE_OUT_OF_RANGE.
	    n = MAX_HWM;
	  } else {
	    // Get the next highest power of 2 to prevent increasing hwm excessively in
	    // tiny amounts
	    n--;
	    n |= n >>> 1;
	    n |= n >>> 2;
	    n |= n >>> 4;
	    n |= n >>> 8;
	    n |= n >>> 16;
	    n++;
	  }

	  return n;
	} // This function is designed to be inlinable, so please take care when making
	// changes to the function body.


	function howMuchToRead(n, state) {
	  if (n <= 0 || state.length === 0 && state.ended) return 0;
	  if (state.objectMode) return 1;

	  if (n !== n) {
	    // Only flow one buffer at a time
	    if (state.flowing && state.length) return state.buffer.head.data.length;else return state.length;
	  } // If we're asking for more than the current hwm, then raise the hwm.


	  if (n > state.highWaterMark) state.highWaterMark = computeNewHighWaterMark(n);
	  if (n <= state.length) return n; // Don't have enough

	  if (!state.ended) {
	    state.needReadable = true;
	    return 0;
	  }

	  return state.length;
	} // you can override either this method, or the async _read(n) below.


	Readable.prototype.read = function (n) {
	  debug('read', n);
	  n = parseInt(n, 10);
	  var state = this._readableState;
	  var nOrig = n;
	  if (n !== 0) state.emittedReadable = false; // if we're doing read(0) to trigger a readable event, but we
	  // already have a bunch of data in the buffer, then just trigger
	  // the 'readable' event and move on.

	  if (n === 0 && state.needReadable && ((state.highWaterMark !== 0 ? state.length >= state.highWaterMark : state.length > 0) || state.ended)) {
	    debug('read: emitReadable', state.length, state.ended);
	    if (state.length === 0 && state.ended) endReadable(this);else emitReadable(this);
	    return null;
	  }

	  n = howMuchToRead(n, state); // if we've ended, and we're now clear, then finish it up.

	  if (n === 0 && state.ended) {
	    if (state.length === 0) endReadable(this);
	    return null;
	  } // All the actual chunk generation logic needs to be
	  // *below* the call to _read.  The reason is that in certain
	  // synthetic stream cases, such as passthrough streams, _read
	  // may be a completely synchronous operation which may change
	  // the state of the read buffer, providing enough data when
	  // before there was *not* enough.
	  //
	  // So, the steps are:
	  // 1. Figure out what the state of things will be after we do
	  // a read from the buffer.
	  //
	  // 2. If that resulting state will trigger a _read, then call _read.
	  // Note that this may be asynchronous, or synchronous.  Yes, it is
	  // deeply ugly to write APIs this way, but that still doesn't mean
	  // that the Readable class should behave improperly, as streams are
	  // designed to be sync/async agnostic.
	  // Take note if the _read call is sync or async (ie, if the read call
	  // has returned yet), so that we know whether or not it's safe to emit
	  // 'readable' etc.
	  //
	  // 3. Actually pull the requested chunks out of the buffer and return.
	  // if we need a readable event, then we need to do some reading.


	  var doRead = state.needReadable;
	  debug('need readable', doRead); // if we currently have less than the highWaterMark, then also read some

	  if (state.length === 0 || state.length - n < state.highWaterMark) {
	    doRead = true;
	    debug('length less than watermark', doRead);
	  } // however, if we've ended, then there's no point, and if we're already
	  // reading, then it's unnecessary.


	  if (state.ended || state.reading) {
	    doRead = false;
	    debug('reading or ended', doRead);
	  } else if (doRead) {
	    debug('do read');
	    state.reading = true;
	    state.sync = true; // if the length is currently zero, then we *need* a readable event.

	    if (state.length === 0) state.needReadable = true; // call internal read method

	    this._read(state.highWaterMark);

	    state.sync = false; // If _read pushed data synchronously, then `reading` will be false,
	    // and we need to re-evaluate how much data we can return to the user.

	    if (!state.reading) n = howMuchToRead(nOrig, state);
	  }

	  var ret;
	  if (n > 0) ret = fromList(n, state);else ret = null;

	  if (ret === null) {
	    state.needReadable = state.length <= state.highWaterMark;
	    n = 0;
	  } else {
	    state.length -= n;
	    state.awaitDrain = 0;
	  }

	  if (state.length === 0) {
	    // If we have nothing in the buffer, then we want to know
	    // as soon as we *do* get something into the buffer.
	    if (!state.ended) state.needReadable = true; // If we tried to read() past the EOF, then emit end on the next tick.

	    if (nOrig !== n && state.ended) endReadable(this);
	  }

	  if (ret !== null) this.emit('data', ret);
	  return ret;
	};

	function onEofChunk(stream, state) {
	  debug('onEofChunk');
	  if (state.ended) return;

	  if (state.decoder) {
	    var chunk = state.decoder.end();

	    if (chunk && chunk.length) {
	      state.buffer.push(chunk);
	      state.length += state.objectMode ? 1 : chunk.length;
	    }
	  }

	  state.ended = true;

	  if (state.sync) {
	    // if we are sync, wait until next tick to emit the data.
	    // Otherwise we risk emitting data in the flow()
	    // the readable code triggers during a read() call
	    emitReadable(stream);
	  } else {
	    // emit 'readable' now to make sure it gets picked up.
	    state.needReadable = false;

	    if (!state.emittedReadable) {
	      state.emittedReadable = true;
	      emitReadable_(stream);
	    }
	  }
	} // Don't emit readable right away in sync mode, because this can trigger
	// another read() call => stack overflow.  This way, it might trigger
	// a nextTick recursion warning, but that's not so bad.


	function emitReadable(stream) {
	  var state = stream._readableState;
	  debug('emitReadable', state.needReadable, state.emittedReadable);
	  state.needReadable = false;

	  if (!state.emittedReadable) {
	    debug('emitReadable', state.flowing);
	    state.emittedReadable = true;
	    process.nextTick(emitReadable_, stream);
	  }
	}

	function emitReadable_(stream) {
	  var state = stream._readableState;
	  debug('emitReadable_', state.destroyed, state.length, state.ended);

	  if (!state.destroyed && (state.length || state.ended)) {
	    stream.emit('readable');
	    state.emittedReadable = false;
	  } // The stream needs another readable event if
	  // 1. It is not flowing, as the flow mechanism will take
	  //    care of it.
	  // 2. It is not ended.
	  // 3. It is below the highWaterMark, so we can schedule
	  //    another readable later.


	  state.needReadable = !state.flowing && !state.ended && state.length <= state.highWaterMark;
	  flow(stream);
	} // at this point, the user has presumably seen the 'readable' event,
	// and called read() to consume some data.  that may have triggered
	// in turn another _read(n) call, in which case reading = true if
	// it's in progress.
	// However, if we're not ended, or reading, and the length < hwm,
	// then go ahead and try to read some more preemptively.


	function maybeReadMore(stream, state) {
	  if (!state.readingMore) {
	    state.readingMore = true;
	    process.nextTick(maybeReadMore_, stream, state);
	  }
	}

	function maybeReadMore_(stream, state) {
	  // Attempt to read more data if we should.
	  //
	  // The conditions for reading more data are (one of):
	  // - Not enough data buffered (state.length < state.highWaterMark). The loop
	  //   is responsible for filling the buffer with enough data if such data
	  //   is available. If highWaterMark is 0 and we are not in the flowing mode
	  //   we should _not_ attempt to buffer any extra data. We'll get more data
	  //   when the stream consumer calls read() instead.
	  // - No data in the buffer, and the stream is in flowing mode. In this mode
	  //   the loop below is responsible for ensuring read() is called. Failing to
	  //   call read here would abort the flow and there's no other mechanism for
	  //   continuing the flow if the stream consumer has just subscribed to the
	  //   'data' event.
	  //
	  // In addition to the above conditions to keep reading data, the following
	  // conditions prevent the data from being read:
	  // - The stream has ended (state.ended).
	  // - There is already a pending 'read' operation (state.reading). This is a
	  //   case where the the stream has called the implementation defined _read()
	  //   method, but they are processing the call asynchronously and have _not_
	  //   called push() with new data. In this case we skip performing more
	  //   read()s. The execution ends in this method again after the _read() ends
	  //   up calling push() with more data.
	  while (!state.reading && !state.ended && (state.length < state.highWaterMark || state.flowing && state.length === 0)) {
	    var len = state.length;
	    debug('maybeReadMore read 0');
	    stream.read(0);
	    if (len === state.length) // didn't get any data, stop spinning.
	      break;
	  }

	  state.readingMore = false;
	} // abstract method.  to be overridden in specific implementation classes.
	// call cb(er, data) where data is <= n in length.
	// for virtual (non-string, non-buffer) streams, "length" is somewhat
	// arbitrary, and perhaps not very meaningful.


	Readable.prototype._read = function (n) {
	  errorOrDestroy(this, new ERR_METHOD_NOT_IMPLEMENTED('_read()'));
	};

	Readable.prototype.pipe = function (dest, pipeOpts) {
	  var src = this;
	  var state = this._readableState;

	  switch (state.pipesCount) {
	    case 0:
	      state.pipes = dest;
	      break;

	    case 1:
	      state.pipes = [state.pipes, dest];
	      break;

	    default:
	      state.pipes.push(dest);
	      break;
	  }

	  state.pipesCount += 1;
	  debug('pipe count=%d opts=%j', state.pipesCount, pipeOpts);
	  var doEnd = (!pipeOpts || pipeOpts.end !== false) && dest !== process.stdout && dest !== process.stderr;
	  var endFn = doEnd ? onend : unpipe;
	  if (state.endEmitted) process.nextTick(endFn);else src.once('end', endFn);
	  dest.on('unpipe', onunpipe);

	  function onunpipe(readable, unpipeInfo) {
	    debug('onunpipe');

	    if (readable === src) {
	      if (unpipeInfo && unpipeInfo.hasUnpiped === false) {
	        unpipeInfo.hasUnpiped = true;
	        cleanup();
	      }
	    }
	  }

	  function onend() {
	    debug('onend');
	    dest.end();
	  } // when the dest drains, it reduces the awaitDrain counter
	  // on the source.  This would be more elegant with a .once()
	  // handler in flow(), but adding and removing repeatedly is
	  // too slow.


	  var ondrain = pipeOnDrain(src);
	  dest.on('drain', ondrain);
	  var cleanedUp = false;

	  function cleanup() {
	    debug('cleanup'); // cleanup event handlers once the pipe is broken

	    dest.removeListener('close', onclose);
	    dest.removeListener('finish', onfinish);
	    dest.removeListener('drain', ondrain);
	    dest.removeListener('error', onerror);
	    dest.removeListener('unpipe', onunpipe);
	    src.removeListener('end', onend);
	    src.removeListener('end', unpipe);
	    src.removeListener('data', ondata);
	    cleanedUp = true; // if the reader is waiting for a drain event from this
	    // specific writer, then it would cause it to never start
	    // flowing again.
	    // So, if this is awaiting a drain, then we just call it now.
	    // If we don't know, then assume that we are waiting for one.

	    if (state.awaitDrain && (!dest._writableState || dest._writableState.needDrain)) ondrain();
	  }

	  src.on('data', ondata);

	  function ondata(chunk) {
	    debug('ondata');
	    var ret = dest.write(chunk);
	    debug('dest.write', ret);

	    if (ret === false) {
	      // If the user unpiped during `dest.write()`, it is possible
	      // to get stuck in a permanently paused state if that write
	      // also returned false.
	      // => Check whether `dest` is still a piping destination.
	      if ((state.pipesCount === 1 && state.pipes === dest || state.pipesCount > 1 && indexOf(state.pipes, dest) !== -1) && !cleanedUp) {
	        debug('false write response, pause', state.awaitDrain);
	        state.awaitDrain++;
	      }

	      src.pause();
	    }
	  } // if the dest has an error, then stop piping into it.
	  // however, don't suppress the throwing behavior for this.


	  function onerror(er) {
	    debug('onerror', er);
	    unpipe();
	    dest.removeListener('error', onerror);
	    if (EElistenerCount(dest, 'error') === 0) errorOrDestroy(dest, er);
	  } // Make sure our error handler is attached before userland ones.


	  prependListener(dest, 'error', onerror); // Both close and finish should trigger unpipe, but only once.

	  function onclose() {
	    dest.removeListener('finish', onfinish);
	    unpipe();
	  }

	  dest.once('close', onclose);

	  function onfinish() {
	    debug('onfinish');
	    dest.removeListener('close', onclose);
	    unpipe();
	  }

	  dest.once('finish', onfinish);

	  function unpipe() {
	    debug('unpipe');
	    src.unpipe(dest);
	  } // tell the dest that it's being piped to


	  dest.emit('pipe', src); // start the flow if it hasn't been started already.

	  if (!state.flowing) {
	    debug('pipe resume');
	    src.resume();
	  }

	  return dest;
	};

	function pipeOnDrain(src) {
	  return function pipeOnDrainFunctionResult() {
	    var state = src._readableState;
	    debug('pipeOnDrain', state.awaitDrain);
	    if (state.awaitDrain) state.awaitDrain--;

	    if (state.awaitDrain === 0 && EElistenerCount(src, 'data')) {
	      state.flowing = true;
	      flow(src);
	    }
	  };
	}

	Readable.prototype.unpipe = function (dest) {
	  var state = this._readableState;
	  var unpipeInfo = {
	    hasUnpiped: false
	  }; // if we're not piping anywhere, then do nothing.

	  if (state.pipesCount === 0) return this; // just one destination.  most common case.

	  if (state.pipesCount === 1) {
	    // passed in one, but it's not the right one.
	    if (dest && dest !== state.pipes) return this;
	    if (!dest) dest = state.pipes; // got a match.

	    state.pipes = null;
	    state.pipesCount = 0;
	    state.flowing = false;
	    if (dest) dest.emit('unpipe', this, unpipeInfo);
	    return this;
	  } // slow case. multiple pipe destinations.


	  if (!dest) {
	    // remove all.
	    var dests = state.pipes;
	    var len = state.pipesCount;
	    state.pipes = null;
	    state.pipesCount = 0;
	    state.flowing = false;

	    for (var i = 0; i < len; i++) {
	      dests[i].emit('unpipe', this, {
	        hasUnpiped: false
	      });
	    }

	    return this;
	  } // try to find the right one.


	  var index = indexOf(state.pipes, dest);
	  if (index === -1) return this;
	  state.pipes.splice(index, 1);
	  state.pipesCount -= 1;
	  if (state.pipesCount === 1) state.pipes = state.pipes[0];
	  dest.emit('unpipe', this, unpipeInfo);
	  return this;
	}; // set up data events if they are asked for
	// Ensure readable listeners eventually get something


	Readable.prototype.on = function (ev, fn) {
	  var res = Stream.prototype.on.call(this, ev, fn);
	  var state = this._readableState;

	  if (ev === 'data') {
	    // update readableListening so that resume() may be a no-op
	    // a few lines down. This is needed to support once('readable').
	    state.readableListening = this.listenerCount('readable') > 0; // Try start flowing on next tick if stream isn't explicitly paused

	    if (state.flowing !== false) this.resume();
	  } else if (ev === 'readable') {
	    if (!state.endEmitted && !state.readableListening) {
	      state.readableListening = state.needReadable = true;
	      state.flowing = false;
	      state.emittedReadable = false;
	      debug('on readable', state.length, state.reading);

	      if (state.length) {
	        emitReadable(this);
	      } else if (!state.reading) {
	        process.nextTick(nReadingNextTick, this);
	      }
	    }
	  }

	  return res;
	};

	Readable.prototype.addListener = Readable.prototype.on;

	Readable.prototype.removeListener = function (ev, fn) {
	  var res = Stream.prototype.removeListener.call(this, ev, fn);

	  if (ev === 'readable') {
	    // We need to check if there is someone still listening to
	    // readable and reset the state. However this needs to happen
	    // after readable has been emitted but before I/O (nextTick) to
	    // support once('readable', fn) cycles. This means that calling
	    // resume within the same tick will have no
	    // effect.
	    process.nextTick(updateReadableListening, this);
	  }

	  return res;
	};

	Readable.prototype.removeAllListeners = function (ev) {
	  var res = Stream.prototype.removeAllListeners.apply(this, arguments);

	  if (ev === 'readable' || ev === undefined) {
	    // We need to check if there is someone still listening to
	    // readable and reset the state. However this needs to happen
	    // after readable has been emitted but before I/O (nextTick) to
	    // support once('readable', fn) cycles. This means that calling
	    // resume within the same tick will have no
	    // effect.
	    process.nextTick(updateReadableListening, this);
	  }

	  return res;
	};

	function updateReadableListening(self) {
	  var state = self._readableState;
	  state.readableListening = self.listenerCount('readable') > 0;

	  if (state.resumeScheduled && !state.paused) {
	    // flowing needs to be set to true now, otherwise
	    // the upcoming resume will not flow.
	    state.flowing = true; // crude way to check if we should resume
	  } else if (self.listenerCount('data') > 0) {
	    self.resume();
	  }
	}

	function nReadingNextTick(self) {
	  debug('readable nexttick read 0');
	  self.read(0);
	} // pause() and resume() are remnants of the legacy readable stream API
	// If the user uses them, then switch into old mode.


	Readable.prototype.resume = function () {
	  var state = this._readableState;

	  if (!state.flowing) {
	    debug('resume'); // we flow only if there is no one listening
	    // for readable, but we still have to call
	    // resume()

	    state.flowing = !state.readableListening;
	    resume(this, state);
	  }

	  state.paused = false;
	  return this;
	};

	function resume(stream, state) {
	  if (!state.resumeScheduled) {
	    state.resumeScheduled = true;
	    process.nextTick(resume_, stream, state);
	  }
	}

	function resume_(stream, state) {
	  debug('resume', state.reading);

	  if (!state.reading) {
	    stream.read(0);
	  }

	  state.resumeScheduled = false;
	  stream.emit('resume');
	  flow(stream);
	  if (state.flowing && !state.reading) stream.read(0);
	}

	Readable.prototype.pause = function () {
	  debug('call pause flowing=%j', this._readableState.flowing);

	  if (this._readableState.flowing !== false) {
	    debug('pause');
	    this._readableState.flowing = false;
	    this.emit('pause');
	  }

	  this._readableState.paused = true;
	  return this;
	};

	function flow(stream) {
	  var state = stream._readableState;
	  debug('flow', state.flowing);

	  while (state.flowing && stream.read() !== null) {
	  }
	} // wrap an old-style stream as the async data source.
	// This is *not* part of the readable stream interface.
	// It is an ugly unfortunate mess of history.


	Readable.prototype.wrap = function (stream) {
	  var _this = this;

	  var state = this._readableState;
	  var paused = false;
	  stream.on('end', function () {
	    debug('wrapped end');

	    if (state.decoder && !state.ended) {
	      var chunk = state.decoder.end();
	      if (chunk && chunk.length) _this.push(chunk);
	    }

	    _this.push(null);
	  });
	  stream.on('data', function (chunk) {
	    debug('wrapped data');
	    if (state.decoder) chunk = state.decoder.write(chunk); // don't skip over falsy values in objectMode

	    if (state.objectMode && (chunk === null || chunk === undefined)) return;else if (!state.objectMode && (!chunk || !chunk.length)) return;

	    var ret = _this.push(chunk);

	    if (!ret) {
	      paused = true;
	      stream.pause();
	    }
	  }); // proxy all the other methods.
	  // important when wrapping filters and duplexes.

	  for (var i in stream) {
	    if (this[i] === undefined && typeof stream[i] === 'function') {
	      this[i] = function methodWrap(method) {
	        return function methodWrapReturnFunction() {
	          return stream[method].apply(stream, arguments);
	        };
	      }(i);
	    }
	  } // proxy certain important events.


	  for (var n = 0; n < kProxyEvents.length; n++) {
	    stream.on(kProxyEvents[n], this.emit.bind(this, kProxyEvents[n]));
	  } // when we try to consume some more bytes, simply unpause the
	  // underlying stream.


	  this._read = function (n) {
	    debug('wrapped _read', n);

	    if (paused) {
	      paused = false;
	      stream.resume();
	    }
	  };

	  return this;
	};

	if (typeof Symbol === 'function') {
	  Readable.prototype[Symbol.asyncIterator] = function () {
	    if (createReadableStreamAsyncIterator === undefined) {
	      createReadableStreamAsyncIterator = requireAsync_iterator();
	    }

	    return createReadableStreamAsyncIterator(this);
	  };
	}

	Object.defineProperty(Readable.prototype, 'readableHighWaterMark', {
	  // making it explicit this property is not enumerable
	  // because otherwise some prototype manipulation in
	  // userland will fail
	  enumerable: false,
	  get: function get() {
	    return this._readableState.highWaterMark;
	  }
	});
	Object.defineProperty(Readable.prototype, 'readableBuffer', {
	  // making it explicit this property is not enumerable
	  // because otherwise some prototype manipulation in
	  // userland will fail
	  enumerable: false,
	  get: function get() {
	    return this._readableState && this._readableState.buffer;
	  }
	});
	Object.defineProperty(Readable.prototype, 'readableFlowing', {
	  // making it explicit this property is not enumerable
	  // because otherwise some prototype manipulation in
	  // userland will fail
	  enumerable: false,
	  get: function get() {
	    return this._readableState.flowing;
	  },
	  set: function set(state) {
	    if (this._readableState) {
	      this._readableState.flowing = state;
	    }
	  }
	}); // exposed for testing purposes only.

	Readable._fromList = fromList;
	Object.defineProperty(Readable.prototype, 'readableLength', {
	  // making it explicit this property is not enumerable
	  // because otherwise some prototype manipulation in
	  // userland will fail
	  enumerable: false,
	  get: function get() {
	    return this._readableState.length;
	  }
	}); // Pluck off n bytes from an array of buffers.
	// Length is the combined lengths of all the buffers in the list.
	// This function is designed to be inlinable, so please take care when making
	// changes to the function body.

	function fromList(n, state) {
	  // nothing buffered
	  if (state.length === 0) return null;
	  var ret;
	  if (state.objectMode) ret = state.buffer.shift();else if (!n || n >= state.length) {
	    // read it all, truncate the list
	    if (state.decoder) ret = state.buffer.join('');else if (state.buffer.length === 1) ret = state.buffer.first();else ret = state.buffer.concat(state.length);
	    state.buffer.clear();
	  } else {
	    // read part of list
	    ret = state.buffer.consume(n, state.decoder);
	  }
	  return ret;
	}

	function endReadable(stream) {
	  var state = stream._readableState;
	  debug('endReadable', state.endEmitted);

	  if (!state.endEmitted) {
	    state.ended = true;
	    process.nextTick(endReadableNT, state, stream);
	  }
	}

	function endReadableNT(state, stream) {
	  debug('endReadableNT', state.endEmitted, state.length); // Check that we didn't get one last unshift.

	  if (!state.endEmitted && state.length === 0) {
	    state.endEmitted = true;
	    stream.readable = false;
	    stream.emit('end');

	    if (state.autoDestroy) {
	      // In case of duplex streams we need a way to detect
	      // if the writable side is ready for autoDestroy as well
	      var wState = stream._writableState;

	      if (!wState || wState.autoDestroy && wState.finished) {
	        stream.destroy();
	      }
	    }
	  }
	}

	if (typeof Symbol === 'function') {
	  Readable.from = function (iterable, opts) {
	    if (from === undefined) {
	      from = requireFrom();
	    }

	    return from(Readable, iterable, opts);
	  };
	}

	function indexOf(xs, x) {
	  for (var i = 0, l = xs.length; i < l; i++) {
	    if (xs[i] === x) return i;
	  }

	  return -1;
	}
	return _stream_readable;
}

var _stream_transform;
var hasRequired_stream_transform;

function require_stream_transform () {
	if (hasRequired_stream_transform) return _stream_transform;
	hasRequired_stream_transform = 1;

	_stream_transform = Transform;

	var _require$codes = requireErrors().codes,
	    ERR_METHOD_NOT_IMPLEMENTED = _require$codes.ERR_METHOD_NOT_IMPLEMENTED,
	    ERR_MULTIPLE_CALLBACK = _require$codes.ERR_MULTIPLE_CALLBACK,
	    ERR_TRANSFORM_ALREADY_TRANSFORMING = _require$codes.ERR_TRANSFORM_ALREADY_TRANSFORMING,
	    ERR_TRANSFORM_WITH_LENGTH_0 = _require$codes.ERR_TRANSFORM_WITH_LENGTH_0;

	var Duplex = require_stream_duplex();

	inherits$1.exports(Transform, Duplex);

	function afterTransform(er, data) {
	  var ts = this._transformState;
	  ts.transforming = false;
	  var cb = ts.writecb;

	  if (cb === null) {
	    return this.emit('error', new ERR_MULTIPLE_CALLBACK());
	  }

	  ts.writechunk = null;
	  ts.writecb = null;
	  if (data != null) // single equals check for both `null` and `undefined`
	    this.push(data);
	  cb(er);
	  var rs = this._readableState;
	  rs.reading = false;

	  if (rs.needReadable || rs.length < rs.highWaterMark) {
	    this._read(rs.highWaterMark);
	  }
	}

	function Transform(options) {
	  if (!(this instanceof Transform)) return new Transform(options);
	  Duplex.call(this, options);
	  this._transformState = {
	    afterTransform: afterTransform.bind(this),
	    needTransform: false,
	    transforming: false,
	    writecb: null,
	    writechunk: null,
	    writeencoding: null
	  }; // start out asking for a readable event once data is transformed.

	  this._readableState.needReadable = true; // we have implemented the _read method, and done the other things
	  // that Readable wants before the first _read call, so unset the
	  // sync guard flag.

	  this._readableState.sync = false;

	  if (options) {
	    if (typeof options.transform === 'function') this._transform = options.transform;
	    if (typeof options.flush === 'function') this._flush = options.flush;
	  } // When the writable side finishes, then flush out anything remaining.


	  this.on('prefinish', prefinish);
	}

	function prefinish() {
	  var _this = this;

	  if (typeof this._flush === 'function' && !this._readableState.destroyed) {
	    this._flush(function (er, data) {
	      done(_this, er, data);
	    });
	  } else {
	    done(this, null, null);
	  }
	}

	Transform.prototype.push = function (chunk, encoding) {
	  this._transformState.needTransform = false;
	  return Duplex.prototype.push.call(this, chunk, encoding);
	}; // This is the part where you do stuff!
	// override this function in implementation classes.
	// 'chunk' is an input chunk.
	//
	// Call `push(newChunk)` to pass along transformed output
	// to the readable side.  You may call 'push' zero or more times.
	//
	// Call `cb(err)` when you are done with this chunk.  If you pass
	// an error, then that'll put the hurt on the whole operation.  If you
	// never call cb(), then you'll never get another chunk.


	Transform.prototype._transform = function (chunk, encoding, cb) {
	  cb(new ERR_METHOD_NOT_IMPLEMENTED('_transform()'));
	};

	Transform.prototype._write = function (chunk, encoding, cb) {
	  var ts = this._transformState;
	  ts.writecb = cb;
	  ts.writechunk = chunk;
	  ts.writeencoding = encoding;

	  if (!ts.transforming) {
	    var rs = this._readableState;
	    if (ts.needTransform || rs.needReadable || rs.length < rs.highWaterMark) this._read(rs.highWaterMark);
	  }
	}; // Doesn't matter what the args are here.
	// _transform does all the work.
	// That we got here means that the readable side wants more data.


	Transform.prototype._read = function (n) {
	  var ts = this._transformState;

	  if (ts.writechunk !== null && !ts.transforming) {
	    ts.transforming = true;

	    this._transform(ts.writechunk, ts.writeencoding, ts.afterTransform);
	  } else {
	    // mark that we need a transform, so that any data that comes in
	    // will get processed, now that we've asked for it.
	    ts.needTransform = true;
	  }
	};

	Transform.prototype._destroy = function (err, cb) {
	  Duplex.prototype._destroy.call(this, err, function (err2) {
	    cb(err2);
	  });
	};

	function done(stream, er, data) {
	  if (er) return stream.emit('error', er);
	  if (data != null) // single equals check for both `null` and `undefined`
	    stream.push(data); // TODO(BridgeAR): Write a test for these two error cases
	  // if there's nothing in the write buffer, then that means
	  // that nothing more will ever be provided

	  if (stream._writableState.length) throw new ERR_TRANSFORM_WITH_LENGTH_0();
	  if (stream._transformState.transforming) throw new ERR_TRANSFORM_ALREADY_TRANSFORMING();
	  return stream.push(null);
	}
	return _stream_transform;
}

var _stream_passthrough;
var hasRequired_stream_passthrough;

function require_stream_passthrough () {
	if (hasRequired_stream_passthrough) return _stream_passthrough;
	hasRequired_stream_passthrough = 1;

	_stream_passthrough = PassThrough;

	var Transform = require_stream_transform();

	inherits$1.exports(PassThrough, Transform);

	function PassThrough(options) {
	  if (!(this instanceof PassThrough)) return new PassThrough(options);
	  Transform.call(this, options);
	}

	PassThrough.prototype._transform = function (chunk, encoding, cb) {
	  cb(null, chunk);
	};
	return _stream_passthrough;
}

var pipeline_1;
var hasRequiredPipeline;

function requirePipeline () {
	if (hasRequiredPipeline) return pipeline_1;
	hasRequiredPipeline = 1;

	var eos;

	function once(callback) {
	  var called = false;
	  return function () {
	    if (called) return;
	    called = true;
	    callback.apply(void 0, arguments);
	  };
	}

	var _require$codes = requireErrors().codes,
	    ERR_MISSING_ARGS = _require$codes.ERR_MISSING_ARGS,
	    ERR_STREAM_DESTROYED = _require$codes.ERR_STREAM_DESTROYED;

	function noop(err) {
	  // Rethrow the error if it exists to avoid swallowing it
	  if (err) throw err;
	}

	function isRequest(stream) {
	  return stream.setHeader && typeof stream.abort === 'function';
	}

	function destroyer(stream, reading, writing, callback) {
	  callback = once(callback);
	  var closed = false;
	  stream.on('close', function () {
	    closed = true;
	  });
	  if (eos === undefined) eos = requireEndOfStream();
	  eos(stream, {
	    readable: reading,
	    writable: writing
	  }, function (err) {
	    if (err) return callback(err);
	    closed = true;
	    callback();
	  });
	  var destroyed = false;
	  return function (err) {
	    if (closed) return;
	    if (destroyed) return;
	    destroyed = true; // request.destroy just do .end - .abort is what we want

	    if (isRequest(stream)) return stream.abort();
	    if (typeof stream.destroy === 'function') return stream.destroy();
	    callback(err || new ERR_STREAM_DESTROYED('pipe'));
	  };
	}

	function call(fn) {
	  fn();
	}

	function pipe(from, to) {
	  return from.pipe(to);
	}

	function popCallback(streams) {
	  if (!streams.length) return noop;
	  if (typeof streams[streams.length - 1] !== 'function') return noop;
	  return streams.pop();
	}

	function pipeline() {
	  for (var _len = arguments.length, streams = new Array(_len), _key = 0; _key < _len; _key++) {
	    streams[_key] = arguments[_key];
	  }

	  var callback = popCallback(streams);
	  if (Array.isArray(streams[0])) streams = streams[0];

	  if (streams.length < 2) {
	    throw new ERR_MISSING_ARGS('streams');
	  }

	  var error;
	  var destroys = streams.map(function (stream, i) {
	    var reading = i < streams.length - 1;
	    var writing = i > 0;
	    return destroyer(stream, reading, writing, function (err) {
	      if (!error) error = err;
	      if (err) destroys.forEach(call);
	      if (reading) return;
	      destroys.forEach(call);
	      callback(error);
	    });
	  });
	  return streams.reduce(pipe);
	}

	pipeline_1 = pipeline;
	return pipeline_1;
}

(function (module, exports) {
	var Stream = require$$0__default$5["default"];
	if (process.env.READABLE_STREAM === 'disable' && Stream) {
	  module.exports = Stream.Readable;
	  Object.assign(module.exports, Stream);
	  module.exports.Stream = Stream;
	} else {
	  exports = module.exports = require_stream_readable();
	  exports.Stream = Stream || exports;
	  exports.Readable = exports;
	  exports.Writable = require_stream_writable();
	  exports.Duplex = require_stream_duplex();
	  exports.Transform = require_stream_transform();
	  exports.PassThrough = require_stream_passthrough();
	  exports.finished = requireEndOfStream();
	  exports.pipeline = requirePipeline();
	}
} (readable, readable.exports));

const { Buffer: Buffer$1 } = require$$0__default$6["default"];
const symbol = Symbol.for('BufferList');

function BufferList$1 (buf) {
  if (!(this instanceof BufferList$1)) {
    return new BufferList$1(buf)
  }

  BufferList$1._init.call(this, buf);
}

BufferList$1._init = function _init (buf) {
  Object.defineProperty(this, symbol, { value: true });

  this._bufs = [];
  this.length = 0;

  if (buf) {
    this.append(buf);
  }
};

BufferList$1.prototype._new = function _new (buf) {
  return new BufferList$1(buf)
};

BufferList$1.prototype._offset = function _offset (offset) {
  if (offset === 0) {
    return [0, 0]
  }

  let tot = 0;

  for (let i = 0; i < this._bufs.length; i++) {
    const _t = tot + this._bufs[i].length;
    if (offset < _t || i === this._bufs.length - 1) {
      return [i, offset - tot]
    }
    tot = _t;
  }
};

BufferList$1.prototype._reverseOffset = function (blOffset) {
  const bufferId = blOffset[0];
  let offset = blOffset[1];

  for (let i = 0; i < bufferId; i++) {
    offset += this._bufs[i].length;
  }

  return offset
};

BufferList$1.prototype.get = function get (index) {
  if (index > this.length || index < 0) {
    return undefined
  }

  const offset = this._offset(index);

  return this._bufs[offset[0]][offset[1]]
};

BufferList$1.prototype.slice = function slice (start, end) {
  if (typeof start === 'number' && start < 0) {
    start += this.length;
  }

  if (typeof end === 'number' && end < 0) {
    end += this.length;
  }

  return this.copy(null, 0, start, end)
};

BufferList$1.prototype.copy = function copy (dst, dstStart, srcStart, srcEnd) {
  if (typeof srcStart !== 'number' || srcStart < 0) {
    srcStart = 0;
  }

  if (typeof srcEnd !== 'number' || srcEnd > this.length) {
    srcEnd = this.length;
  }

  if (srcStart >= this.length) {
    return dst || Buffer$1.alloc(0)
  }

  if (srcEnd <= 0) {
    return dst || Buffer$1.alloc(0)
  }

  const copy = !!dst;
  const off = this._offset(srcStart);
  const len = srcEnd - srcStart;
  let bytes = len;
  let bufoff = (copy && dstStart) || 0;
  let start = off[1];

  // copy/slice everything
  if (srcStart === 0 && srcEnd === this.length) {
    if (!copy) {
      // slice, but full concat if multiple buffers
      return this._bufs.length === 1
        ? this._bufs[0]
        : Buffer$1.concat(this._bufs, this.length)
    }

    // copy, need to copy individual buffers
    for (let i = 0; i < this._bufs.length; i++) {
      this._bufs[i].copy(dst, bufoff);
      bufoff += this._bufs[i].length;
    }

    return dst
  }

  // easy, cheap case where it's a subset of one of the buffers
  if (bytes <= this._bufs[off[0]].length - start) {
    return copy
      ? this._bufs[off[0]].copy(dst, dstStart, start, start + bytes)
      : this._bufs[off[0]].slice(start, start + bytes)
  }

  if (!copy) {
    // a slice, we need something to copy in to
    dst = Buffer$1.allocUnsafe(len);
  }

  for (let i = off[0]; i < this._bufs.length; i++) {
    const l = this._bufs[i].length - start;

    if (bytes > l) {
      this._bufs[i].copy(dst, bufoff, start);
      bufoff += l;
    } else {
      this._bufs[i].copy(dst, bufoff, start, start + bytes);
      bufoff += l;
      break
    }

    bytes -= l;

    if (start) {
      start = 0;
    }
  }

  // safeguard so that we don't return uninitialized memory
  if (dst.length > bufoff) return dst.slice(0, bufoff)

  return dst
};

BufferList$1.prototype.shallowSlice = function shallowSlice (start, end) {
  start = start || 0;
  end = typeof end !== 'number' ? this.length : end;

  if (start < 0) {
    start += this.length;
  }

  if (end < 0) {
    end += this.length;
  }

  if (start === end) {
    return this._new()
  }

  const startOffset = this._offset(start);
  const endOffset = this._offset(end);
  const buffers = this._bufs.slice(startOffset[0], endOffset[0] + 1);

  if (endOffset[1] === 0) {
    buffers.pop();
  } else {
    buffers[buffers.length - 1] = buffers[buffers.length - 1].slice(0, endOffset[1]);
  }

  if (startOffset[1] !== 0) {
    buffers[0] = buffers[0].slice(startOffset[1]);
  }

  return this._new(buffers)
};

BufferList$1.prototype.toString = function toString (encoding, start, end) {
  return this.slice(start, end).toString(encoding)
};

BufferList$1.prototype.consume = function consume (bytes) {
  // first, normalize the argument, in accordance with how Buffer does it
  bytes = Math.trunc(bytes);
  // do nothing if not a positive number
  if (Number.isNaN(bytes) || bytes <= 0) return this

  while (this._bufs.length) {
    if (bytes >= this._bufs[0].length) {
      bytes -= this._bufs[0].length;
      this.length -= this._bufs[0].length;
      this._bufs.shift();
    } else {
      this._bufs[0] = this._bufs[0].slice(bytes);
      this.length -= bytes;
      break
    }
  }

  return this
};

BufferList$1.prototype.duplicate = function duplicate () {
  const copy = this._new();

  for (let i = 0; i < this._bufs.length; i++) {
    copy.append(this._bufs[i]);
  }

  return copy
};

BufferList$1.prototype.append = function append (buf) {
  if (buf == null) {
    return this
  }

  if (buf.buffer) {
    // append a view of the underlying ArrayBuffer
    this._appendBuffer(Buffer$1.from(buf.buffer, buf.byteOffset, buf.byteLength));
  } else if (Array.isArray(buf)) {
    for (let i = 0; i < buf.length; i++) {
      this.append(buf[i]);
    }
  } else if (this._isBufferList(buf)) {
    // unwrap argument into individual BufferLists
    for (let i = 0; i < buf._bufs.length; i++) {
      this.append(buf._bufs[i]);
    }
  } else {
    // coerce number arguments to strings, since Buffer(number) does
    // uninitialized memory allocation
    if (typeof buf === 'number') {
      buf = buf.toString();
    }

    this._appendBuffer(Buffer$1.from(buf));
  }

  return this
};

BufferList$1.prototype._appendBuffer = function appendBuffer (buf) {
  this._bufs.push(buf);
  this.length += buf.length;
};

BufferList$1.prototype.indexOf = function (search, offset, encoding) {
  if (encoding === undefined && typeof offset === 'string') {
    encoding = offset;
    offset = undefined;
  }

  if (typeof search === 'function' || Array.isArray(search)) {
    throw new TypeError('The "value" argument must be one of type string, Buffer, BufferList, or Uint8Array.')
  } else if (typeof search === 'number') {
    search = Buffer$1.from([search]);
  } else if (typeof search === 'string') {
    search = Buffer$1.from(search, encoding);
  } else if (this._isBufferList(search)) {
    search = search.slice();
  } else if (Array.isArray(search.buffer)) {
    search = Buffer$1.from(search.buffer, search.byteOffset, search.byteLength);
  } else if (!Buffer$1.isBuffer(search)) {
    search = Buffer$1.from(search);
  }

  offset = Number(offset || 0);

  if (isNaN(offset)) {
    offset = 0;
  }

  if (offset < 0) {
    offset = this.length + offset;
  }

  if (offset < 0) {
    offset = 0;
  }

  if (search.length === 0) {
    return offset > this.length ? this.length : offset
  }

  const blOffset = this._offset(offset);
  let blIndex = blOffset[0]; // index of which internal buffer we're working on
  let buffOffset = blOffset[1]; // offset of the internal buffer we're working on

  // scan over each buffer
  for (; blIndex < this._bufs.length; blIndex++) {
    const buff = this._bufs[blIndex];

    while (buffOffset < buff.length) {
      const availableWindow = buff.length - buffOffset;

      if (availableWindow >= search.length) {
        const nativeSearchResult = buff.indexOf(search, buffOffset);

        if (nativeSearchResult !== -1) {
          return this._reverseOffset([blIndex, nativeSearchResult])
        }

        buffOffset = buff.length - search.length + 1; // end of native search window
      } else {
        const revOffset = this._reverseOffset([blIndex, buffOffset]);

        if (this._match(revOffset, search)) {
          return revOffset
        }

        buffOffset++;
      }
    }

    buffOffset = 0;
  }

  return -1
};

BufferList$1.prototype._match = function (offset, search) {
  if (this.length - offset < search.length) {
    return false
  }

  for (let searchOffset = 0; searchOffset < search.length; searchOffset++) {
    if (this.get(offset + searchOffset) !== search[searchOffset]) {
      return false
    }
  }
  return true
}

;(function () {
  const methods = {
    readDoubleBE: 8,
    readDoubleLE: 8,
    readFloatBE: 4,
    readFloatLE: 4,
    readInt32BE: 4,
    readInt32LE: 4,
    readUInt32BE: 4,
    readUInt32LE: 4,
    readInt16BE: 2,
    readInt16LE: 2,
    readUInt16BE: 2,
    readUInt16LE: 2,
    readInt8: 1,
    readUInt8: 1,
    readIntBE: null,
    readIntLE: null,
    readUIntBE: null,
    readUIntLE: null
  };

  for (const m in methods) {
    (function (m) {
      if (methods[m] === null) {
        BufferList$1.prototype[m] = function (offset, byteLength) {
          return this.slice(offset, offset + byteLength)[m](0, byteLength)
        };
      } else {
        BufferList$1.prototype[m] = function (offset = 0) {
          return this.slice(offset, offset + methods[m])[m](0)
        };
      }
    }(m));
  }
}());

// Used internally by the class and also as an indicator of this object being
// a `BufferList`. It's not possible to use `instanceof BufferList` in a browser
// environment because there could be multiple different copies of the
// BufferList class and some `BufferList`s might be `BufferList`s.
BufferList$1.prototype._isBufferList = function _isBufferList (b) {
  return b instanceof BufferList$1 || BufferList$1.isBufferList(b)
};

BufferList$1.isBufferList = function isBufferList (b) {
  return b != null && b[symbol]
};

var BufferList_1 = BufferList$1;

const DuplexStream = readable.exports.Duplex;
const inherits = inherits$1.exports;
const BufferList = BufferList_1;

function BufferListStream (callback) {
  if (!(this instanceof BufferListStream)) {
    return new BufferListStream(callback)
  }

  if (typeof callback === 'function') {
    this._callback = callback;

    const piper = function piper (err) {
      if (this._callback) {
        this._callback(err);
        this._callback = null;
      }
    }.bind(this);

    this.on('pipe', function onPipe (src) {
      src.on('error', piper);
    });
    this.on('unpipe', function onUnpipe (src) {
      src.removeListener('error', piper);
    });

    callback = null;
  }

  BufferList._init.call(this, callback);
  DuplexStream.call(this);
}

inherits(BufferListStream, DuplexStream);
Object.assign(BufferListStream.prototype, BufferList.prototype);

BufferListStream.prototype._new = function _new (callback) {
  return new BufferListStream(callback)
};

BufferListStream.prototype._write = function _write (buf, encoding, callback) {
  this._appendBuffer(buf);

  if (typeof callback === 'function') {
    callback();
  }
};

BufferListStream.prototype._read = function _read (size) {
  if (!this.length) {
    return this.push(null)
  }

  size = Math.min(size, this.length);
  this.push(this.slice(0, size));
  this.consume(size);
};

BufferListStream.prototype.end = function end (chunk) {
  DuplexStream.prototype.end.call(this, chunk);

  if (this._callback) {
    this._callback(null, this.slice());
    this._callback = null;
  }
};

BufferListStream.prototype._destroy = function _destroy (err, cb) {
  this._bufs.length = 0;
  this.length = 0;
  cb(err);
};

BufferListStream.prototype._isBufferList = function _isBufferList (b) {
  return b instanceof BufferListStream || b instanceof BufferList || BufferListStream.isBufferList(b)
};

BufferListStream.isBufferList = BufferList.isBufferList;

bl.exports = BufferListStream;
var BufferListStream_1 = bl.exports.BufferListStream = BufferListStream;
bl.exports.BufferList = BufferList;

const ASCII_ETX_CODE = 0x03; // Ctrl+C emits this code

class StdinDiscarder {
	#requests = 0;
	#mutedStream = new BufferListStream_1();
	#ourEmit;
	#rl;

	constructor() {
		this.#mutedStream.pipe(process__default["default"].stdout);

		const self = this; // eslint-disable-line unicorn/no-this-assignment
		this.#ourEmit = function (event, data, ...args) {
			const {stdin} = process__default["default"];
			if (self.#requests > 0 || stdin.emit === self.#ourEmit) {
				if (event === 'keypress') { // Fixes readline behavior
					return;
				}

				if (event === 'data' && data.includes(ASCII_ETX_CODE)) {
					process__default["default"].emit('SIGINT');
				}

				Reflect.apply(self.#ourEmit, this, [event, data, ...args]);
			} else {
				Reflect.apply(process__default["default"].stdin.emit, this, [event, data, ...args]);
			}
		};
	}

	start() {
		this.#requests++;

		if (this.#requests === 1) {
			this._realStart();
		}
	}

	stop() {
		if (this.#requests <= 0) {
			throw new Error('`stop` called more times than `start`');
		}

		this.#requests--;

		if (this.#requests === 0) {
			this._realStop();
		}
	}

	// TODO: Use private methods when targeting Node.js 14.
	_realStart() {
		// No known way to make it work reliably on Windows
		if (process__default["default"].platform === 'win32') {
			return;
		}

		this.#rl = readline__default["default"].createInterface({
			input: process__default["default"].stdin,
			output: this.#mutedStream,
		});

		this.#rl.on('SIGINT', () => {
			if (process__default["default"].listenerCount('SIGINT') === 0) {
				process__default["default"].emit('SIGINT');
			} else {
				this.#rl.close();
				process__default["default"].kill(process__default["default"].pid, 'SIGINT');
			}
		});
	}

	_realStop() {
		if (process__default["default"].platform === 'win32') {
			return;
		}

		this.#rl.close();
		this.#rl = undefined;
	}
}

let stdinDiscarder;

class Ora {
	#linesToClear = 0;
	#isDiscardingStdin = false;
	#lineCount = 0;
	#frameIndex = 0;
	#options;
	#spinner;
	#stream;
	#id;
	#initialInterval;
	#isEnabled;
	#isSilent;
	#indent;
	#text;
	#prefixText;

	color;

	constructor(options) {
		if (!stdinDiscarder) {
			stdinDiscarder = new StdinDiscarder();
		}

		if (typeof options === 'string') {
			options = {
				text: options,
			};
		}

		this.#options = {
			color: 'cyan',
			stream: process__default["default"].stderr,
			discardStdin: true,
			hideCursor: true,
			...options,
		};

		// Public
		this.color = this.#options.color;

		// It's important that these use the public setters.
		this.spinner = this.#options.spinner;

		this.#initialInterval = this.#options.interval;
		this.#stream = this.#options.stream;
		this.#isEnabled = typeof this.#options.isEnabled === 'boolean' ? this.#options.isEnabled : isInteractive({stream: this.#stream});
		this.#isSilent = typeof this.#options.isSilent === 'boolean' ? this.#options.isSilent : false;

		// Set *after* `this.#stream`.
		// It's important that these use the public setters.
		this.text = this.#options.text;
		this.prefixText = this.#options.prefixText;
		this.indent = this.#options.indent;

		if (process__default["default"].env.NODE_ENV === 'test') {
			this._stream = this.#stream;
			this._isEnabled = this.#isEnabled;

			Object.defineProperty(this, '_linesToClear', {
				get() {
					return this.#linesToClear;
				},
				set(newValue) {
					this.#linesToClear = newValue;
				},
			});

			Object.defineProperty(this, '_frameIndex', {
				get() {
					return this.#frameIndex;
				},
			});

			Object.defineProperty(this, '_lineCount', {
				get() {
					return this.#lineCount;
				},
			});
		}
	}

	get indent() {
		return this.#indent;
	}

	set indent(indent = 0) {
		if (!(indent >= 0 && Number.isInteger(indent))) {
			throw new Error('The `indent` option must be an integer from 0 and up');
		}

		this.#indent = indent;
		this.updateLineCount();
	}

	get interval() {
		return this.#initialInterval || this.#spinner.interval || 100;
	}

	get spinner() {
		return this.#spinner;
	}

	set spinner(spinner) {
		this.#frameIndex = 0;
		this.#initialInterval = undefined;

		if (typeof spinner === 'object') {
			if (spinner.frames === undefined) {
				throw new Error('The given spinner must have a `frames` property');
			}

			this.#spinner = spinner;
		} else if (!isUnicodeSupported()) {
			this.#spinner = cliSpinners.line;
		} else if (spinner === undefined) {
			// Set default spinner
			this.#spinner = cliSpinners.dots;
		} else if (spinner !== 'default' && cliSpinners[spinner]) {
			this.#spinner = cliSpinners[spinner];
		} else {
			throw new Error(`There is no built-in spinner named '${spinner}'. See https://github.com/sindresorhus/cli-spinners/blob/main/spinners.json for a full list.`);
		}
	}

	get text() {
		return this.#text;
	}

	set text(value) {
		this.#text = value || '';
		this.updateLineCount();
	}

	get prefixText() {
		return this.#prefixText;
	}

	set prefixText(value) {
		this.#prefixText = value || '';
		this.updateLineCount();
	}

	get isSpinning() {
		return this.#id !== undefined;
	}

	// TODO: Use private methods when targeting Node.js 14.
	getFullPrefixText(prefixText = this.#prefixText, postfix = ' ') {
		if (typeof prefixText === 'string' && prefixText !== '') {
			return prefixText + postfix;
		}

		if (typeof prefixText === 'function') {
			return prefixText() + postfix;
		}

		return '';
	}

	updateLineCount() {
		const columns = this.#stream.columns || 80;
		const fullPrefixText = this.getFullPrefixText(this.#prefixText, '-');

		this.#lineCount = 0;
		for (const line of stripAnsi(' '.repeat(this.#indent) + fullPrefixText + '--' + this.#text).split('\n')) {
			this.#lineCount += Math.max(1, Math.ceil(wcwidth$1.exports(line) / columns));
		}
	}

	get isEnabled() {
		return this.#isEnabled && !this.#isSilent;
	}

	set isEnabled(value) {
		if (typeof value !== 'boolean') {
			throw new TypeError('The `isEnabled` option must be a boolean');
		}

		this.#isEnabled = value;
	}

	get isSilent() {
		return this.#isSilent;
	}

	set isSilent(value) {
		if (typeof value !== 'boolean') {
			throw new TypeError('The `isSilent` option must be a boolean');
		}

		this.#isSilent = value;
	}

	frame() {
		const {frames} = this.#spinner;
		let frame = frames[this.#frameIndex];

		if (this.color) {
			frame = chalk[this.color](frame);
		}

		this.#frameIndex = ++this.#frameIndex % frames.length;
		const fullPrefixText = (typeof this.#prefixText === 'string' && this.#prefixText !== '') ? this.#prefixText + ' ' : '';
		const fullText = typeof this.text === 'string' ? ' ' + this.text : '';

		return fullPrefixText + frame + fullText;
	}

	clear() {
		if (!this.#isEnabled || !this.#stream.isTTY) {
			return this;
		}

		this.#stream.cursorTo(0);

		for (let index = 0; index < this.#linesToClear; index++) {
			if (index > 0) {
				this.#stream.moveCursor(0, -1);
			}

			this.#stream.clearLine(1);
		}

		if (this.#indent || this.lastIndent !== this.#indent) {
			this.#stream.cursorTo(this.#indent);
		}

		this.lastIndent = this.#indent;
		this.#linesToClear = 0;

		return this;
	}

	render() {
		if (this.#isSilent) {
			return this;
		}

		this.clear();
		this.#stream.write(this.frame());
		this.#linesToClear = this.#lineCount;

		return this;
	}

	start(text) {
		if (text) {
			this.text = text;
		}

		if (this.#isSilent) {
			return this;
		}

		if (!this.#isEnabled) {
			if (this.text) {
				this.#stream.write(`- ${this.text}\n`);
			}

			return this;
		}

		if (this.isSpinning) {
			return this;
		}

		if (this.#options.hideCursor) {
			cliCursor.hide(this.#stream);
		}

		if (this.#options.discardStdin && process__default["default"].stdin.isTTY) {
			this.#isDiscardingStdin = true;
			stdinDiscarder.start();
		}

		this.render();
		this.#id = setInterval(this.render.bind(this), this.interval);

		return this;
	}

	stop() {
		if (!this.#isEnabled) {
			return this;
		}

		clearInterval(this.#id);
		this.#id = undefined;
		this.#frameIndex = 0;
		this.clear();
		if (this.#options.hideCursor) {
			cliCursor.show(this.#stream);
		}

		if (this.#options.discardStdin && process__default["default"].stdin.isTTY && this.#isDiscardingStdin) {
			stdinDiscarder.stop();
			this.#isDiscardingStdin = false;
		}

		return this;
	}

	succeed(text) {
		return this.stopAndPersist({symbol: logSymbols.success, text});
	}

	fail(text) {
		return this.stopAndPersist({symbol: logSymbols.error, text});
	}

	warn(text) {
		return this.stopAndPersist({symbol: logSymbols.warning, text});
	}

	info(text) {
		return this.stopAndPersist({symbol: logSymbols.info, text});
	}

	stopAndPersist(options = {}) {
		if (this.#isSilent) {
			return this;
		}

		const prefixText = options.prefixText || this.#prefixText;
		const text = options.text || this.text;
		const fullText = (typeof text === 'string') ? ' ' + text : '';

		this.stop();
		this.#stream.write(`${this.getFullPrefixText(prefixText, ' ')}${options.symbol || ' '}${fullText}\n`);

		return this;
	}
}

function ora(options) {
	return new Ora(options);
}

const getCallSpinner = onetime$2(() => ora());

async function inputPasscodeKeystrokes({ passcode, isReinput = false, }) {
    const callSpinner = getCallSpinner();
    if (isReinput) {
        callSpinner.start('🔒 Waiting for focus on a secure input textbox...');
    }
    else {
        callSpinner.start('🔒 Passcode entered. Waiting for focus on a secure input textbox...');
    }
    await pWaitFor(() => getSecureInputProcesses.getSecureInputProcesses().length > 0, { interval: 500 });
    await runAppleScript(`tell application "System Events" to keystroke "${passcode}"`);
    callSpinner.stop();
    console.info(logSymbols.success, 'Password successfully inputted!');
    const { reinput } = await inquirer__default["default"].prompt([
        {
            name: 'reinput',
            message: 'Reinput the password?',
            type: 'confirm',
        },
    ]);
    if (reinput) {
        await inputPasscodeKeystrokes({ passcode, isReinput: true });
    }
    else {
        process__default["default"].exit(0);
    }
}

const { twiml } = twilio__default["default"];
function createInputRoute(context) {
    const inputRoute = async (request, reply) => {
        const voice = new twiml.VoiceResponse();
        const digits = request.body.Digits;
        if (digits === undefined) {
            voice.redirect('/voice');
        }
        else {
            if (/^\d{5}$/.test(digits)) {
                if (context.shouldAutoInputPasscode) {
                    inputPasscodeKeystrokes({ passcode: digits }).catch((error) => {
                        const err = error;
                        console.error('There was an error.');
                        // Replace all numeric characters with asterisks to prevent leaking
                        // the password
                        console.error('Name:', err.name.replace(/\d/g, '*'));
                        console.error('Message:', err.message.replace(/\d/g, '*'));
                    });
                }
                else {
                    context.resolve(digits);
                }
                voice.say('Thank you!');
            }
            else {
                voice.say("Sorry, that wasn't five digits. Please try again.");
            }
        }
        await reply.type('text/xml').send(voice.toString());
    };
    return inputRoute;
}
function createVoiceRoute(_context) {
    const voiceRoute = async (request, reply) => {
        const callSpinner = getCallSpinner();
        callSpinner.start('Call answered. Waiting for 5-digit passcode input...');
        const voice = new twiml.VoiceResponse();
        const gather = voice.gather({
            numDigits: 5,
            action: '/input',
            method: 'POST',
        });
        gather.say('Please type in the five-digit passcode.');
        // If the user doesn't type in a code, loop
        voice.redirect('/voice');
        await reply.type('text/xml').send(voice.toString());
    };
    return voiceRoute;
}
function createEventsRoute(context) {
    const eventsRoute = (request, _reply) => {
        if (request.body.CallStatus === 'completed' &&
            !context.hasPasscodeBeenEntered) {
            context.reject(new Error('Passcode has not been entered.'));
        }
    };
    return eventsRoute;
}
async function startAppServer({ port, shouldAutoInputPasscode, }) {
    return new Promise((resolve, reject) => {
        const context = {
            shouldAutoInputPasscode,
            hasPasscodeBeenEntered: false,
            resolve,
            reject,
        };
        const app = fastify__default["default"]({
            logger: process__default["default"].env.DEBUG === '1',
        });
        void app.register(fastifyFormbody__default["default"]);
        app.get('/health', async (request, reply) => {
            await reply.send('Operational!');
        });
        app.post('/input', createInputRoute(context));
        app.post('/voice', createVoiceRoute());
        app.post('/events', createEventsRoute(context));
        app
            .listen(port, '0.0.0.0')
            .then((address) => {
            console.info(`🚀 Server started on ${address}`);
        })
            .catch(reject);
    });
}

async function phoneCallInput({ destinationPhoneNumber, originPhoneNumber, twilioAccountSid, twilioAuthToken, ngrokBinPath, }) {
    try {
        const port = await getPorts();
        const passcode = await new Promise((resolve, reject) => {
            startAppServer({ port, shouldAutoInputPasscode: false })
                .then(resolve)
                .catch(reject);
            startNgrokServer({
                port,
                binPath: ngrokBinPath,
            })
                .then(async (ngrokServerUrl) => makeCall({
                ngrokServerUrl,
                destinationPhoneNumber,
                originPhoneNumber,
                twilioAccountSid,
                twilioAuthToken,
            }))
                .catch(reject);
        });
        return passcode;
    }
    catch (error) {
        const err = error;
        // Replace all numeric characters with asterisks to prevent leaking
        // the password
        err.name = err.name.replace(/\d/g, '*');
        err.message = err.message.replace(/\d/g, '*');
        throw err;
    }
    finally {
        await ngrok__default["default"].kill();
    }
}

exports.phoneCallInput = phoneCallInput;
