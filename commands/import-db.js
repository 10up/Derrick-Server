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
var exec = require( 'child_process' ).exec,
	print = require( 'winston' ).cli(),
	NPromise = require( 'promise' );

/**
 * Use MySQL to import the database.
 *
 * @param {Object} args
 * @param {Object} socket
 *
 * @returns {NPromise}
 */
function import_dump( args, socket ) {
	return new NPromise( function( fulfill, reject ) {
		print.info( 'Importing the SQL dump (This could take a while ...)' );
		socket.emit( 'progress', { log: [ 'info', 'Importing the SQL dump (This could take a while ...)' ] } );

		var interval = setInterval( function() {
			socket.emit( 'progress', { ping: true } );
		}, 1000 );

		var import_thread = exec( 'mysql -u root -proot -h 127.0.0.1 ' + args.database + ' < ' + args.dumpfile );
		import_thread.stdout.on( 'data', function( data ) {
			clearInterval( interval );
			print.info( data );
		} );
		import_thread.stderr.on( 'data', function( data ) {
			clearInterval( interval );
			print.error( data );
		} );
		import_thread.on( 'close', function( code ) {
			clearInterval( interval );
			print.log( 'info', 'Process exited with code: %s', code );
			socket.emit( 'progress', { log: ['info', 'Database %s imported.', args.database ] } );

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
		import_dump( args.params, socket )
			.then( fulfill, reject );
	} );
};