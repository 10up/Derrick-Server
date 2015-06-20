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
var mysql = require( 'mysql' ),
	print = require( 'winston' ).cli(),
	NPromise = require( 'promise' );

/**
 * Connect to the MySQL system.
 *
 * @param {Object} args
 * @param {Object} socket
 *
 * @returns {NPromise}
 */
function connect( args, socket ) {
	return new NPromise( function( fulfill, reject ) {
		var connection = mysql.createConnection( {
				host    : '127.0.0.1',
				user    : 'root',
				password: 'root'
			} );

		print.info( 'Connecting to MySQL.' );
		socket.emit( 'progress', { 'log': ['info', 'Connecting to MySQL.'] } );

		connection.connect( function( err ) {
			if ( err ) {
				reject( err );
			} else {
				fulfill( [ connection, args, socket ] );
			}
		} );
	} );
}

/**
 * Create the specified database.
 *
 * @param {Array} data
 *
 * @returns {NPromise}
 */
function create( data ) {
	var connection = data[0],
		args = data[1],
		socket = data[2];

	return new NPromise( function( fulfill, reject ) {
		print.log( 'info', 'Creating database: %s', args.database );
		socket.emit( 'progress', { 'log': ['info', 'Creating database: %s', args.database] } );

		connection.query( mysql.format(
			'CREATE DATABASE IF NOT EXISTS ??',
			[args.database]
		), function( err ) {
			if ( err ) {
				reject( err );
			} else {
				fulfill( [ connection, args, socket ] );
			}
		} );
	} );
}

/**
 * Grant privileges to the specified user.
 *
 * @param {Array} data
 *
 * @returns {NPromise}
 */
function grant_all( data ) {
	var connection = data[0],
		args = data[1],
		socket = data[2];

	return new NPromise( function( fulfill, reject ) {
		print.log( 'info', 'Establishing privileges for user: %s', args.username );
		socket.emit( 'progress', { 'log': ['info', 'Establishing privileges for user %s', args.username] } );

		connection.query( mysql.format(
			"GRANT ALL PRIVILEGES ON ??.* TO ?@'%' IDENTIFIED BY ?",
			[args.database, args.username, args.password ]
		), function( err ) {
			if ( err ) {
				reject( err );
			} else {
				fulfill( [ connection, socket ] );
			}
		} );
	} );
}

/**
 * Close the MySQL connection.
 *
 * @param {Array} data
 *
 * @returns {NPromise}
 */
function close_connection( data ) {
	var connection = data[0],
		socket = data[1];

	return new NPromise( function( fulfill, reject ) {
		print.info( 'Closing MySQL connection.' );
		socket.emit( 'progress', { 'log': ['info', 'Closing MySQL connection.'] } );

		connection.end( fulfill );
	} );
}

/**
 * Module definition.
 *
 * @param {Object} args
 * @param {Object} socket
 *
 * @returns {NPromise}
 */
module.exports = function( args, socket ) {
	// Truncate the database name - https://github.com/10up/Derrick/issues/28
	if ( args.params && args.params.database && args.params.database.length > 16 ) {
		args.params.database = args.params.database.substr( 0, 16 );
	}

	return new NPromise( function ( fulfill, reject ) {
		connect( args.params, socket )
			.then( create, reject )
			.then( grant_all, reject )
			.then( close_connection, reject )
			.then( fulfill, reject );
	} );
};