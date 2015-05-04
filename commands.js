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
 * Commands namespace.
 *
 * @type {Object}
 */
var commands = module.exports;

/**
 * Load up commands
 */
commands.create_db = require( './commands/create-db' );
commands.import_db = require( './commands/import-db' );
commands.export_db = require( './commands/export-db' );
commands.create_chain = require( './commands/create-chain' );
commands.wp = require( './commands/wp' );
commands.phpunit = require( './commands/phpunit' );
commands.composer = require( './commands/composer' );
commands.mount_fs = require( './commands/mount-fs' );