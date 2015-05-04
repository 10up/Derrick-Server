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
	NPromise = require( 'promise' );

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

		// Attempt to unmount things first so we don't have too many layers of nesting
		var umount = exec( 'umount -t overlayfs ' + mountPath );

		umount.on( 'close', function() {
			var command = exec( 'mount -t overlayfs -o lowerdir=' + src + ',upperdir=' + vendor + ' overlayfs ' + mountPath );

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
	var mkdir = NPromise.denodeify( mkdirp );
	return new NPromise( function( fulfill, reject ) {
		var project = args.params.projectName,
			mountPath = path.join( '/fs', project );

		return mkdir( mountPath )
			.then( function() { return mountFS( project, socket ); } )
			.then( fulfill );
	} );
};