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
 * Module dependencies.
 */
var NPromise = require( 'promise' ),
	spawn = require( 'child_process' ).spawn,
	path = require( 'path' ),
	fs = require( 'fs' ),
	print = require( 'winston' ).cli(),
	projectsRoot = '/srv/projects';

/**
 * Helper to print messages on the host send it through the socket.
 *
 * @param  {String} message The messages to send
 * @param  {Object} socket  The socket to send messages to the client
 * @param  {String} type    Optional. The type of message to send, default: info
 */
function _printMessage( message, socket, type ) {
	type = type || 'info';
	print[type]( message );
	socket.emit( 'progress', {log: [type, message]} );
}

/**
 * Module definition.
 *
 * @param {Object} args
 * @param {Object} socket
 *
 * @returns {NPromise}
 */
module.exports = function ( args, socket ) {
	_printMessage( 'Running composer command...', socket, 'info' );

	return new NPromise( function ( fulfill, reject ) {
		var hosts,
			params = args.params,
			project = params.path;

		if ( 0 === project.indexOf( 'projects/' ) ) {
			project = project.substr( 9 );
		}
		if ( !project || !fs.existsSync( path.join( projectsRoot, project, 'composer.json' ) ) ) {
			_printMessage( 'Invalid project path!', socket, 'error' );
			reject( 'Invalid project path!' );
			socket.emit( 'error' );
			return;
		}

		var interval = setInterval( function () {
			socket.emit( 'progress', {ping: true} );
		}, 1000 );

		// If we made it this far, we can run the command
		var command = spawn( 'composer', ['--working-dir=/srv/projects/' + project].concat( params.rawArgs ) );
		// Send error data back to all parties
		command.stderr.on( 'data', function ( data ) {
			process.stdout.write( data );
			_printMessage( data.toString( 'utf8' ), socket, 'info' );
		} );
		// Send normal output back to all parties
		command.stdout.on( 'data', function ( data ) {
			process.stdout.write( data );
			_printMessage( data.toString( 'utf8' ), socket, 'info' );
		} );

		function close( code ) {
			clearInterval( interval );
			if ( code !== 0 ) {
				_printMessage( 'Command exited with a non-zero status code!', socket, 'error' );
				reject( 'Command exited with a non-zero status code!' );
				socket.emit( 'error' );
				return;
			}
			fulfill( true );
		}

		// Handle the end of the command
		command.on( 'close', close );
		command.on( 'exit', close );
	} );
};
