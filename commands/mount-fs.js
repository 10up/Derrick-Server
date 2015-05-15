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
var path = require( 'path' ),
	exec = require( 'child_process' ).exec,
	print = require( 'winston' ).cli(),
	mkdirp = require( 'mkdirp' ),
	NPromise = require( 'promise' ),
	mkdir = NPromise.denodeify( mkdirp );

/**
 * Mount a project's filesystem into a virtual overlayFS mount in /fs.
 *
 * @param {String} project
 * @param {Object} socket
 *
 * @return {NPromise}
 */
function mountFS( project, socket ) {
	var projectPath = path.join( '/srv', 'projects', project ),
		mountPath = path.join( '/fs', project ),
		src = path.join( projectPath, 'src' ),
		vendor = path.join( projectPath, 'vendor' );

	return new NPromise( function( fulfill, reject ) {
		var interval = setInterval( function() {
			socket.emit( 'progress', { ping: true } );
		}, 1000 );

		var command = exec( 'unionfs-fuse -o allow_other ' + vendor + '=RW:' + src + '=RW ' + mountPath );

		command.stdout.on( 'data', function( data ) {
			print.info( data );
		} );
		command.stderr.on( 'data', function( data ) {
			clearInterval( interval );
			print.error( data );
			fulfill();
		} );
		command.on( 'close', function() {
			clearInterval( interval );
			fulfill();
		} );

	} );
}

/**
 * Module definition.
 * @param {Object} args
 * @param {Object} socket
 *
 * @returns {NPromise}
 */
module.exports = function( args, socket ) {
	return new NPromise( function( fulfill, reject ) {
		var project = args.params.projectName,
			mountPath = path.join( '/fs', project );

		return mkdir( mountPath )
			.then( function() { return mountFS( project, socket ); } )
			.then( fulfill );
	} );
};