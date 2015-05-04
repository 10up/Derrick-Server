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
var fs = require("fs"),
	NPromise = require( 'promise' ),
	portfinder = require( 'portfinder' ),
	print = require( 'winston' ).cli(),
	Orchestra = require( '../library/orchestra' ),
	Player = require( '../library/player' );

/**
 * File Root
 *
 * @type {String}
 */
var fileRoot = '/srv/';

/**
 * Initialize vars for storing cached Player objects.
 */
var mysql, memcached, redis;

/**
 * Start searching at port 555.
 */
portfinder.basePort = 555;

/**
 * A promise based version of getPort using denodify.
 *
 * @type {Function}
 */
var getPort = NPromise.denodeify( portfinder.getPort );

/**
 * Get mysql object using cached version if available.
 *
 * @param {Object} args
 * @param {Object} socket
 * @return {Player} The global MySQL container as a Player object.
 */
function getMySQL( args, socket ) {
	_printMessage( 'Fetching global MySQL container', socket );

	if ( ! ( mysql instanceof Player ) ) {
		mysql = new Player( 'mysql', 'mysql', {
			env: {
				MYSQL_ROOT_PASSWORD: 'root'
			},
			ports: { '127.0.0.1:3306': '3306' },
			restartPolicy: 'always'
		} );
	}

	return mysql;
}

/**
 * Get memcached object using cached version if available.
 *
 * @param {Object} args
 * @param {Object} socket
 * @return {Player} The global Memcached container as a Player object.
 */
function getMemcached( args, socket ) {
	_printMessage( 'Fetching global Memcached container', socket );

	if ( ! ( memcached instanceof Player ) ) {
		memcached = new Player( 'memcached', 'memcached', {
			ports: { '127.0.0.1:11221': '11211' },
			restartPolicy: 'always'
		} );
	}

	return memcached;
}

/**
 * Get redis object using cached version if available.
 *
 * @param {Object} args
 * @param {Object} socket
 * @return {Player} The global Redis container as a Player object.
 */
function getRedis( args, socket ) {
	_printMessage( 'Fetching global Redis container', socket );

	if ( ! ( redis instanceof Player ) ) {
		redis = new Player( 'redis', 'redis', {
			ports: { '127.0.0.1:6380': '6380' },
			restartPolicy: 'always'
		} );
	}

	return redis;
}

/**
 * Get the requested WordPress object, using cached version if available.
 *
 * @param {Object} args
 * @param {Object} socket
 * @return {Player} The WordPress container requested as a Player object.
 */
function getWordPress( args, socket ) {
	_printMessage( 'Generating the WordPress container', socket );
	
	// Set up volumes now since the object has variable keys.
	var volumes = {};
	volumes[ fileRoot + args.wordpressPath ] = '/var/www/html';

	return new Player( args.name + '-wp', 'busybox', {
		volumes: volumes,
		command: 'true'
	} );
}

/**
 * Get the files boxs with all requested paths in place.
 *
 * @param {Object} args
 * @param {Object} socket
 * @return {Player} The Player object containing all mounted volumes.
 */
function getFiles( args, socket ) {
	_printMessage( 'Generating the files container', socket );

	// Set up volumes now since the object has variable keys.
	var path, volumes = {};

	// Loop through and add all project paths and add them to volumes.
	for ( path in args.resourceLocations ) {
		volumes[ fileRoot + args.resourceLocations[ path ] ] = '/var/www/html/' + path;
	}
	for ( path in args.overlayLocations ) {
		volumes[ args.overlayLocations[ path ] ] = '/var/www/html/' + path;
	}

	return new Player( args.name + '-files', 'busybox', {
		volumes: volumes,
		volumesFrom: [
			args.name + '-wp'
		],
		command: 'true'
	} );
}

/**
 * Get the requested PHP object.
 *
 * @return {Player} The PHP container requested as a Player object.
 */
function getPHP( args, socket ) {
	_printMessage( 'Generating the PHP container', socket );

	// Determine the php container to spin up
	var phpContainer = '10up/php:';
	if ( args.webserver === 'nginx' ) {
		phpContainer += args.php + '-fpm';
	} else {
		phpContainer += args.php + '-apache';
	}

	// Create and return the container object.
	return new Player( args.name + '-php', phpContainer, {
		volumes: {
			'/usr/bin/wp': '/usr/bin/wp',
			'/usr/local/bin/phpunit': '/usr/bin/phpunit'
		},
		volumesFrom: [
			args.name + '-files'
		],
		links: {
			'mysql': 'mysql',
			'memecached': 'memcached'
		},
		restartPolicy: 'on-failure:10'
	} );
}

/**
 * Get the requested Nginx object.
 *
 * @param {Object} args
 * @param {Object} socket
 * @param {Number} port The port number to map this container to.
 * @return {Player} The Nginx container requested as a Player object.
 */
function getNginx( args, socket, port ) {
	_printMessage( 'Generating the Nginx container', socket );

	// Set up volumes now since it's a variable key.
	var volumes = {};
		volumes[ fileRoot + args.projectPath + '/config/nginx/sites' ] = '/etc/nginx/sites-enabled';
		volumes[ fileRoot + args.projectPath + '/config/nginx/conf.d' ] = '/etc/nginx/conf.d';

	return new Player( args.name + '-nginx', '10up/nginx', {
			volumes: volumes,
			volumesFrom: [
				args.name + '-files'
			],
			links: {
				'php': args.name + '-php'
			},
			ports: [
				{ to: port, from: '80' }
			],
			restartPolicy: 'on-failure:10'
		}
	);
}

/**
 * Helper to print messages on the host send it through the socket.
 *
 * @param  {String} message The messages to send
 * @param  {Object} socket  The socket to send messages to the client
 * @param  {String} type    Optional. The type of message to send, default: info
 */
function _printMessage( message, socket, type ) {
	type = type || 'info';
	print[ type ]( message );
	socket.emit( 'progress', { log: [ type, message ] } );
}

/**
 * Runs the create chain routine to make a full set of containers for a project.
 *
 * @param {Object} args
 * @param {Object} socket
 *
 * @returns {NPromise}
 */
module.exports = function ( args, socket ) {

	_printMessage( 'Creating Chain.', socket );
	var interval, port, Chain, data = args.params.manifest;

	if ( 'string' === typeof data ) {
		data = JSON.parse( fs.readFileSync( fileRoot + data, 'utf8' ) );
	}

	_printMessage( 'Discovering usable port.', socket );

	return getPort()
		.then( function( portNum ){
			// Set the closured port and Chain vars.
			port = portNum;
			Chain = new Orchestra( [
				getMySQL( data, socket ),
				getMemcached( data, socket ),
				getWordPress( data, socket ),
				getFiles( data, socket ),
				getPHP( data, socket ),
				getNginx( data, socket, port )
			] );

			// Prevent timeouts
			interval = setInterval( function() {
				socket.emit( 'progress', { ping: true } );
			}, 1000 );

			// Let the CLI know what port we're on
			socket.emit( 'progress', { log: [ 'info', 'Chain configured to listen on port %s.', portNum ], port: portNum } );
			print.log( 'info', 'Chain configured to listen on port %s.', portNum );

			// Run the chain.
			_printMessage( 'Starting Chain. (This may take a while...)', socket );
			return Chain.run();
		}, function( error ) {
			// Make sure the interval is cleared even on error.
			// Stop pinging the server for keep alive.
			clearInterval( interval );
			return error;
		} )
		.then( function(){
			// Stop pinging the server for keep alive.
			clearInterval( interval );
			// Report the port number and Chain.
			return {
				port: port,
				Chain: Chain
			};
		} );
};
