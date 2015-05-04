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
	projectsRoot = '/srv/projects',
	_ = require( 'lodash' );

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
 * Escape arguments before passing them to the shell script so we don't fail.
 *
 * @param {String} arg
 *
 * @returns {String}
 */
function escapeShellArg( arg ) {
	return arg.replace( /(["\s'$`\\])/g, '\\$1' );
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
	return new NPromise( function ( fulfill, reject ) {
		var params = args.params;
		var project = params.path;
		if ( 0 !== project.indexOf( 'projects/' ) ) {
			project = path.join( 'projects', project );
		}
		if ( !project ) {
			_printMessage( 'Invalid project path!', socket, 'error' );
			reject( 'Invalid project path!' );
			socket.emit( 'error' );
			return;
		}

		var projectDirectory = project.split( '/' )[1],
			lockData,
			mappedPath,
			x;
		try {
			lockData = JSON.parse( fs.readFileSync( path.join( projectsRoot, projectDirectory, 'manifest.lock' ), {encoding: 'utf8'} ) );
			var mappedPath = path.join( '/var/www/html', _.findKey( lockData.resourceLocations, function ( location ) {
				return 0 === project.indexOf( location );
			} ) || '' );
		} catch ( e ) {
			_printMessage( 'Could not read project data!', socket, error );
			reject( 'Could not read project data!' );
			socket.emit( 'error' );
			return;
		}

		var interval = setInterval( function () {
			socket.emit( 'progress', {ping: true} );
		}, 1000 );

		// If we made it this far, we can run the command
		var phpunitCmd = _.map( ['phpunit'].concat( params.rawArgs ), escapeShellArg ).join( ' ' );
		var cmdArgs = ['exec', projectDirectory + '-php', 'sh', '-c', 'cd ' + escapeShellArg( mappedPath ) + '; ' + phpunitCmd];
		var command = spawn( 'docker', cmdArgs );
		// Send error data back to all parties
		command.stderr.on( 'data', function ( data ) {
			_printMessage( data.toString( 'utf8' ), socket, 'warn' );
		} );
		// Send normal output back to all parties
		command.stdout.on( 'data', function ( data ) {
			_printMessage( data.toString( 'utf8' ), socket, 'info' );
		} );
		// Handle the end of the command
		command.on( 'close', function ( code ) {
			clearInterval( interval );
			if ( code !== 0 ) {
				_printMessage( 'Command exited with a non-zero status code!', socket, 'error' );
			}
			fulfill( true );
		} );
	} );
};