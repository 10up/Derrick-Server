#!/usr/bin/env node
var logger,
	path = require( 'path' ),
	pkg = require( path.join( __dirname, 'package.json' ) ),
	program = require( 'commander' );

program.version( pkg.version )
	.option( '-d, --debug', 'Turn on debug mode' )
	.option( '-s, --silent', 'Turns off output to console' );

// Hacky? yes. a bit. But I don't care. http://jorb.in/hate
program.parseOptions( program.normalize( process.argv.slice( 2 ) ) );

// Set up the logger
logger = require( './logger' )( program.silent, program.debug );
logger.debug( 'Logger finished setting up' );

logger.debug( 'Adding subcommands' );
program.command( 'listen' )
	.description( 'Start the server' )
	.option( '-p, --port <port>', 'Specify the port on which to listen. Defaults to port 239', parseInt )
	.action( function ( options ) {
		         require( './listen' ).run( options.port || 239 );
	         } );

logger.debug( 'Parsing arguments and running subcommand' );
program.parse( process.argv );
