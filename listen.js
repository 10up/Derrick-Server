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

/**
 * Module constants.
 */
const PORT = 4000;
const ADDRESS = '127.0.0.1';

/**
 * Module dependencies.
 */
var print = require( 'winston' ).cli(),
	Server = require( 'socket.io' ),
	proxy = require( 'http-proxy' ),
	http = require( 'http' ),
	NPromise = require( 'promise' ),
	cpExec = NPromise.denodeify( require( 'child_process' ).exec ),
	stash = require( './library/stash' ),
	_ = require( 'lodash' ),
	io;

// We don't want Winston to exit on us
print.exitOnError = false;

/**
 * Commands
 *
 * @type {Object}
 */
var commands = require( './commands' );

/**
 * Handle an incoming connection.
 *
 * @param {Object} socket
 */
function handleConnection( socket ) {
	print.info( 'Attaching incoming connection...' );

	socket.on( 'imbibe', function( args ) {
		var command = args[ 'command' ];

		// Log the call for debugging purbposes
		print.log( 'info', 'Imbibe called for \'%s\' command.', command );

		// Sanitize command
		command = command.replace( /-/g, '_' );

		if ( undefined !== commands[ command ] ) {
			commands[ command ]( args, socket ).then( function() {
				socket.emit( 'success' );
			} );
		} else {
			socket.emit( 'error' );
		}
	} );

}

/**
 * Look up project and port information for a domain.
 *
 * @param {String} host
 *
 * @returns {Object} Port and project name information in the format {port:555, project:name}
 */
function getDomainInfo( host ) {
	var portmap, hosts;

	print.log( 'info', 'Looking up information for %s.', host );

	// First read the portmap
	try {
		portmap = require( '../portmap' );
		delete require.cache['/srv/system/portmap.json'];
	} catch( e ) {
		print.log( 'error', 'No portmap available. Setting defaults.' );
		portmap = {domains: {}, ports: {}};
	}

	// Read the hosts file
	try {
		hosts = require( '../hosts' );
		delete require.cache['/srv/system/hosts.json'];
 	} catch( e ) {
		print.log( 'error', 'No hosts file available.' );
		hosts = {};
	}

	// Find the port
	var port = false;
	_.forEach( portmap.domains, function( port_num, domain ) {
		if ( host !== domain || port ) {
			return; // Return instead of continue to skip this iteration
		}

		port = port_num;
	} );

	// Find the project
	var project = false;
	_.forEach( hosts, function( project_name, domain ) {
		if ( host !== domain || project ) {
			return;
		}

		project = project_name;
	} );

	return {'port': port, 'project': project };
}

/**
 * Create a handler for proxy requests
 *
 * @param {Object} proxyServer
 *
 * @returns {Function} Handler function for the proxy requests
 */
function handleProxy( proxyServer ) {
	var cache = new stash();

	return function( request, response ) {
		var is_retry = false;

		var host = request.headers.host,
			project_data = cache.get( host );

		if ( undefined === project_data ) {
			project_data = getDomainInfo( host );

			cache.set( host, project_data, 'default', 30 );
		}

		if ( ! project_data.port ) {
			print.log( 'error', 'Chain does not exist for %s.', host );

			// Sometimes the server crashes when headers have already been sent to the client
			// We need to wrap these in try/catch blocks to prevent these crashes.
			try {
				response.writeHead( 503, {'Content-Type': 'text/plain'} );
			} catch ( e ) {
				print.log( 'error', 'Could not send 503 header (Chain does not exist)' );
				print.log( 'error', e );
			}
			response.end( 'Chain does not exist for ' + host + '.' );
			return;
		} else {
			print.log( 'info', '%s %s => %s.', request.method, request.url, project_data.port );
		}

		proxyServer.on( 'error', function( error, req, res ) {
			if ( ! is_retry ) {
				// First attempt to restart the chain then retry
				startDockerContainers( project_data.project ).then( function () {
					print.log( 'info', 'Retrying request for %s.', req.url );
					is_retry = true;
					proxyServer.proxyRequest( req, res, function() { is_retry = false; } );
				} );

				return;
			}

			// If we're this far, it means we've already retried things. Let's alert the user to an error.
			print.log( 'error', error );
			print.log( 'error', 'Chain for %s is unresponsive.', host );

			// Sometimes the server crashes when headers have already been sent to the client
			// We need to wrap these in try/catch blocks to prevent these crashes.
			try {
				response.writeHead( 504, {'Content-Type': 'text/plain'} );
			} catch ( e ) {
				print.log( 'error', 'Could not send 504 header (Chain is unresponsive)' );
				print.log( 'error', e );
			}
			response.end( 'Chain for ' + host + ' is unresponsive.' );
			return;
		} );

		proxyServer.web( request, response, {
			target: 'http://0.0.0.0:' + project_data.port
		} );
	}
}

/**
 * Set up the CLI server to handle incoming connections.
 *
 * @param {Object} args
 *
 * @returns {NPromise}
 */
function createCLIServer( args ) {
	return new NPromise( function( fulfill, reject ) {
		print.log( 'info', 'Setting up CLI server on port %d', args.cli_port );
		io = new Server( args.cli_port, {serveClient: false, path: '/'} );
		io.on( 'connection', handleConnection );

		fulfill( args );
	} );
}

/**
 * Start the dynamic containers for a specific project.
 *
 * @param {String} project
 *
 * @returns {Array} Collection of promise objects for the Docker restart command.
 */
function startProjectContainers( project ) {
	var promises = [];

	var php_command = 'sudo docker restart ' + project + '-php',
		nginx_command = 'sudo docker restart ' + project + '-nginx',
		apache_command = 'sudo docker restart ' + project + '-apache';

	print.log( 'info', 'Starting containers for the \'%s\' project.', project );

	// The following promises will _always_ resolve. We do this because a project might be using PHP-FPM or Apache
	// and we neither know nor care which. We'll log statuses later.
	promises.push( new NPromise( function( resolve ) {
		cpExec( php_command ).then( resolve, resolve );
	} ) );
	promises.push( new NPromise( function( resolve ) {
		cpExec( apache_command ).then( resolve, resolve );
	} ) );
	promises.push( new NPromise( function( resolve ) {
		cpExec( nginx_command ).then( resolve, resolve );
	} ) );

	return promises;
}

/**
 * Make sure all project Docker containers are running.
 *
 * @param {Object} args
 *
 * @returns {NPromise}
 */
function startDockerContainers( args ) {
	return new NPromise( function( fulfill, reject ) {
		print.info( 'Starting Docker container chains.' );

		var hosts,
			projects = [];

		// Get a list of our projects from the hosts.json file
		try {
			hosts = require( '../hosts' );
			delete require.cache['/srv/system/hosts.json'];
		} catch ( e ) {
			hosts = {};
		}

		_.forEach( hosts, function( value, key ) {
			projects.push( value );
		} );

		// Dedupe projects
		projects = _.uniq( projects );

		// Attempt to `restart` all of the containers, one at a time
		var promises = [];
		_.forEach( projects, function( value ) {
			promises = _.union( promises, startProjectContainers( value ) );
		} );

		NPromise.all( promises ).then( function() { fulfill( args ); } );
	} );
}

/**
 * Set up the proxy server to handle incoming connections.
 *
 * @param {Object} args
 *
 * @returns {NPromise}
 */
function createProxyServer( args ) {
	return new NPromise( function( fulfill, reject ) {
		print.log( 'info', 'Setting up proxy server on port %d', args.proxy_port );

		var proxyServer = proxy.createProxyServer( {} );

		proxyServer.on( 'proxyReq', function( proxyReq, request, response, options ) {
			proxyReq.setHeader( 'X-Proxy-Header', 'Derrick' );
		} );

		var handler = handleProxy( proxyServer ),
			server = http.createServer( handler );

		server.listen( PORT, ADDRESS, function() {
			print.log( 'info', 'HTTP proxy server running at http://%s:%d', ADDRESS, PORT );
			fulfill( args );
		} );

		process.on( 'SIGTERM', function() {
			if ( server !== undefined ) {
				server.close( function() {
					process.disconnect && process.disconnect();
				} );
			}
		} );
	} );
}

/**
 * Export the primary server.
 *
 * @type {Object}
 */
module.exports = {
	run: function ( port ) {
		var run_args = {
			cli_port: port,
			proxy_port: PORT
		};

		createCLIServer( run_args )
			.then( startDockerContainers )
			.then( createProxyServer )
			.then( function() {
				print.log( 'info', 'Derrick is listening ...' );
			} );
	}
};
