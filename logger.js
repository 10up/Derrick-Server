/*!
 * Derrick CLI
 *
 * 10up <sales@10up.com>
 * John Bloch <john.bloch@10up.com>
 * Eric Mann <eric.mann@10up.com>
 * Luke Woodward <luke.woodward@10up.com>
 * Taylor Lovett <taylor.lovett@10up.com>
 *
 * MIT License.
 */

'use strict';

/**
 * Module dependencies
 */
var winston = require('winston'),
	exports = {logger: null, setup: null},
	logger,
	initialized = false;

/**
 * Export our custom logger.
 *
 * @param {Boolean} silent
 * @param {Boolean} debug
 *
 * @returns {Object}
 */
module.exports = function (silent, debug) {
	if (initialized) {
		return logger;
	}

	silent = !!silent;
	debug = !!debug;

	var transports = [];
	if (!silent) {
		transports.push(new (winston.transports.Console)({level: debug ? 'debug' : 'info'}));
	}
	transports.push(new (winston.transports.File)({
		filename: '/srv/logs/derrick' + (debug ? '-debug' : '') + '.log',
		level   : debug ? 'debug' : 'verbose'
	}));

	logger = new (winston.Logger)({
		transports: transports
	});

	initialized = true;
	return logger;
};